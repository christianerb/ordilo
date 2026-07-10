import OpenAI from "openai";
import {
  EMBEDDINGS_MODEL,
  EMBEDDING_DIMENSIONS,
} from "@/lib/ai/models";

/**
 * OpenAI text-embedding-3-small embeddings client.
 *
 * Chunks text into ~500-token chunks with ~50-token overlap, calls
 * OpenAI's embeddings API, and returns 1536-dimensional vectors for
 * storage in pgvector (`document_embeddings.embedding`).
 *
 * The OPENAI_API_KEY is read from server-only env and is never exposed
 * to the client.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export { EMBEDDING_DIMENSIONS };

/**
 * Approximate characters per token.
 *
 * The OpenAI tokenizer (BPE) produces roughly 4 characters per token for
 * English and slightly fewer for German (umlauts, compound words). We use
 * a conservative 4 chars/token heuristic so chunks stay under the 500-token
 * target.
 */
const CHARS_PER_TOKEN = 4;

/** Target chunk size in tokens. */
const CHUNK_SIZE_TOKENS = 500;

/** Overlap between chunks in tokens. */
const CHUNK_OVERLAP_TOKENS = 50;

/**
 * Maximum number of chunks to send in a single OpenAI embeddings API call.
 *
 * The API supports up to 2048 inputs, but we batch conservatively to stay
 * well within token limits and keep responses fast.
 */
const MAX_BATCH_SIZE = 100;

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Error thrown when the embeddings call fails (API error, timeout, or
 * unexpected response shape).
 */
export class EmbeddingError extends Error {
  /** Machine-readable error code for structured API responses. */
  readonly code: string;
  /** HTTP status from OpenAI (if applicable). */
  readonly statusCode?: number;

  constructor(message: string, code: string, statusCode?: number) {
    super(message);
    this.name = "EmbeddingError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

/**
 * A text chunk with its position metadata.
 */
export interface TextChunk {
  /** The chunk text. */
  text: string;
  /** 0-based chunk index. */
  index: number;
}

/**
 * A single page's text content with its page number.
 *
 * Used by `chunkPages` to chunk text while preserving which page each
 * chunk originated from.
 */
export interface PageContent {
  /** The page's text (e.g. OCR markdown for that page). */
  text: string;
  /** 1-based page number from the document. */
  page_number: number;
}

/**
 * A text chunk with page provenance.
 *
 * Extends `TextChunk` with the page number the chunk originated from,
 * so that `document_embeddings.metadata_json` can store `page_number`
 * alongside `document_id` for page-aware search results.
 */
export interface PageTextChunk extends TextChunk {
  /** 1-based page number from the source document. */
  page_number: number;
}

/**
 * Split text into overlapping chunks of approximately `chunkSizeTokens`
 * tokens with `chunkOverlapTokens` overlap.
 *
 * Uses a character-based heuristic (4 chars ≈ 1 token) to estimate chunk
 * boundaries, then adjusts to break at word boundaries when possible to
 * avoid splitting words.
 *
 * @param text - The full text to chunk (e.g. OCR markdown).
 * @param chunkSizeTokens - Target chunk size in tokens (default: 500).
 * @param chunkOverlapTokens - Overlap between chunks in tokens (default: 50).
 * @returns An array of text chunks (with index metadata), or an empty
 *          array if the input is empty/whitespace-only.
 */
export function chunkText(
  text: string,
  chunkSizeTokens: number = CHUNK_SIZE_TOKENS,
  chunkOverlapTokens: number = CHUNK_OVERLAP_TOKENS,
): TextChunk[] {
  if (!text || !text.trim()) return [];

  const chunkSize = chunkSizeTokens * CHARS_PER_TOKEN;
  const overlap = chunkOverlapTokens * CHARS_PER_TOKEN;

  // Short text → single chunk.
  if (text.length <= chunkSize) {
    return [{ text: text.trim(), index: 0 }];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);

    // If we're not at the end of the text, try to break at a word boundary
    // near the chunk end (avoid splitting words).
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(" ", end);
      if (lastSpace > start + chunkSize / 2) {
        end = lastSpace;
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // Move to the next chunk start, with overlap.
    if (end >= text.length) break;
    start = end - overlap;
    if (start < 0) start = 0;

    // Avoid infinite loop if overlap >= chunk size.
    if (start >= end) {
      start = end;
    }
  }

  return chunks.map((text, index) => ({ text, index }));
}

/**
 * Split multiple pages of text into overlapping chunks while preserving
 * page provenance.
 *
 * Each page's text is chunked independently using `chunkText`, and every
 * resulting chunk is tagged with its originating `page_number`. Chunk
 * indices are global (continuous across pages) so they remain unique
 * within the document.
 *
 * This preserves page-level provenance for embeddings: each
 * `document_embeddings` row can store `page_number` in its
 * `metadata_json`, enabling page-aware search results and citations.
 *
 * @param pages - Array of page content (text + page number).
 * @returns An array of page-aware text chunks, or an empty array if all
 *          pages are empty/whitespace-only.
 */
export function chunkPages(pages: PageContent[]): PageTextChunk[] {
  const chunks: PageTextChunk[] = [];
  let globalIndex = 0;

  for (const page of pages) {
    const pageChunks = chunkText(page.text);
    for (const chunk of pageChunks) {
      chunks.push({
        text: chunk.text,
        index: globalIndex++,
        page_number: page.page_number,
      });
    }
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// OpenAI client
// ---------------------------------------------------------------------------

/**
 * Get the OpenAI client, configured with the API key from env.
 * Throws a typed error if the key is missing.
 */
function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new EmbeddingError(
      "OpenAI API key is not configured.",
      "OPENAI_NOT_CONFIGURED",
    );
  }
  return new OpenAI({ apiKey });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate embeddings for an array of text chunks using OpenAI
 * text-embedding-3-small.
 *
 * Chunks are batched (up to `MAX_BATCH_SIZE` per API call) to stay within
 * API limits. Each batch is sent as a single request with multiple inputs,
 * which is more efficient than one request per chunk.
 *
 * @param chunks - The text chunks to embed.
 * @returns An array of 1536-dimensional vectors, one per chunk, in order.
 * @throws {EmbeddingError} if the API call fails, the key is missing, or
 *         the response shape is unexpected.
 */
export async function generateEmbeddings(
  chunks: TextChunk[],
): Promise<number[][]> {
  if (chunks.length === 0) return [];

  const client = getOpenAIClient();
  const results: number[][] = new Array(chunks.length);

  // Process chunks in batches.
  for (let i = 0; i < chunks.length; i += MAX_BATCH_SIZE) {
    const batch = chunks.slice(i, i + MAX_BATCH_SIZE);
    const inputs = batch.map((c) => c.text);

    let response: OpenAI.Embeddings.CreateEmbeddingResponse;
    try {
      response = await client.embeddings.create({
        model: EMBEDDINGS_MODEL,
        input: inputs,
      });
    } catch (err) {
      if (err instanceof OpenAI.APIError) {
        const status = err.status ?? undefined;
        if (status === 401 || status === 403) {
          throw new EmbeddingError(
            "OpenAI: Authentifizierung fehlgeschlagen.",
            "OPENAI_AUTH_ERROR",
            status,
          );
        }
        if (status === 429) {
          throw new EmbeddingError(
            "OpenAI: Rate-Limit erreicht. Bitte später erneut versuchen.",
            "OPENAI_RATE_LIMITED",
            status,
          );
        }
        throw new EmbeddingError(
          `OpenAI: API-Fehler${err.message ? ` (${err.message})` : ""}.`,
          "OPENAI_API_ERROR",
          status,
        );
      }
      throw new EmbeddingError(
        "Netzwerkfehler beim Kontaktieren von OpenAI.",
        "OPENAI_NETWORK_ERROR",
      );
    }

    // Map response embeddings back to their correct positions.
    for (const item of response.data) {
      const batchIndex = item.index;
      const globalIndex = i + batchIndex;

      if (!Array.isArray(item.embedding)) {
        throw new EmbeddingError(
          "OpenAI: Unerwartetes Antwortformat (Embedding fehlt).",
          "OPENAI_INVALID_RESPONSE",
        );
      }

      if (item.embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new EmbeddingError(
          `OpenAI: Embedding hat ${item.embedding.length} Dimensionen, erwartet ${EMBEDDING_DIMENSIONS}.`,
          "OPENAI_INVALID_DIMENSIONS",
        );
      }

      results[globalIndex] = item.embedding;
    }
  }

  // Verify all chunks got embeddings.
  for (let i = 0; i < results.length; i++) {
    if (!results[i]) {
      throw new EmbeddingError(
        `OpenAI: Embedding für Chunk ${i} fehlt.`,
        "OPENAI_MISSING_EMBEDDING",
      );
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Semantic deduplication
// ---------------------------------------------------------------------------

/**
 * Cosine similarity between two vectors.
 * Returns a value in [-1, 1], where 1 = identical direction.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Default similarity threshold for considering two chunks as duplicates. */
export const DEDUP_SIMILARITY_THRESHOLD = 0.85;

/**
 * Result of semantic deduplication: the surviving chunks/embeddings and
 * the indices that were removed as near-duplicates.
 */
export interface DedupResult<T> {
  /** Surviving items (deduplicates removed). */
  kept: T[];
  /** Indices from the original array that were removed. */
  removedIndices: number[];
}

/**
 * Semantically deduplicate embeddings by cosine similarity.
 *
 * If two embeddings have cosine similarity >= threshold, the second one
 * is considered a near-duplicate and removed. This prevents near-identical
 * chunks from competing in vector search, which degrades retrieval quality.
 *
 * Inspired by the Blockify "semantic distillation" approach: redundant
 * vectors in the same region of embedding space distribute probability
 * mass across all of them, pulling the match score down for the canonical
 * version. Collapse them and the signal sharpens.
 *
 * @param embeddings - The embedding vectors to deduplicate.
 * @param threshold - Cosine similarity above which two embeddings are
 *                    considered duplicates (default: 0.85).
 * @returns Indices of kept embeddings (in original order).
 */
export function deduplicateEmbeddingIndices(
  embeddings: number[][],
  threshold: number = DEDUP_SIMILARITY_THRESHOLD,
): number[] {
  if (embeddings.length <= 1) return embeddings.map((_, i) => i);

  const kept: number[] = [];
  const removed = new Set<number>();

  for (let i = 0; i < embeddings.length; i++) {
    if (removed.has(i)) continue;
    kept.push(i);

    // Check all subsequent embeddings against this one
    for (let j = i + 1; j < embeddings.length; j++) {
      if (removed.has(j)) continue;
      const sim = cosineSimilarity(embeddings[i], embeddings[j]);
      if (sim >= threshold) {
        removed.add(j);
      }
    }
  }

  return kept;
}

/**
 * Deduplicate text chunks by their embedding similarity.
 *
 * Returns the surviving chunks (near-duplicates removed) and the indices
 * that were removed.
 *
 * @param chunks - The text chunks to deduplicate.
 * @param embeddings - The corresponding embedding vectors (same length).
 * @param threshold - Cosine similarity threshold (default: 0.85).
 */
export function deduplicateChunks<T>(
  chunks: T[],
  embeddings: number[][],
  threshold: number = DEDUP_SIMILARITY_THRESHOLD,
): DedupResult<T> {
  if (chunks.length <= 1) {
    return { kept: chunks, removedIndices: [] };
  }

  const keptIndices = deduplicateEmbeddingIndices(embeddings, threshold);
  const keptSet = new Set(keptIndices);
  const removedIndices: number[] = [];

  for (let i = 0; i < chunks.length; i++) {
    if (!keptSet.has(i)) removedIndices.push(i);
  }

  return {
    kept: keptIndices.map((i) => chunks[i]),
    removedIndices,
  };
}

// ---------------------------------------------------------------------------
// Query-shaped embeddings (synthetic questions)
// ---------------------------------------------------------------------------

/**
 * Generate synthetic questions for a document from its extracted metadata.
 *
 * Instead of embedding only the raw chunk text, we also embed question-shaped
 * representations of the document's key facts. This improves retrieval because:
 *   - User queries are questions → matching against question-embeddings is
 *     structurally aligned (query-to-question similarity > query-to-prose similarity)
 *   - Each question captures one atomic claim, not a chunk of narrative
 *
 * Inspired by the "IdeaBlock" concept: embed claims, not chunks.
 *
 * @param title - The document title (e.g. "Stromrechnung Juli 2024").
 * @param summary - The document summary (1-3 sentences).
 * @param documentType - The document type (invoice, letter, medical, etc.).
 * @param persons - Person names mentioned in the document.
 * @param organization - Organization name (if any).
 * @returns An array of synthetic question strings to embed alongside chunks.
 */
export function generateSyntheticQuestions(params: {
  title: string | null;
  summary: string | null;
  documentType: string | null;
  persons: string[];
  organization: string | null;
}): string[] {
  const questions: string[] = [];
  const { title, summary, documentType, persons, organization } = params;

  // Question from title + type
  if (title) {
    const typeLabel = documentType
      ? DOCUMENT_TYPE_QUESTION_LABELS[documentType] ?? "Dokument"
      : "Dokument";
    questions.push(`Was steht in ${title} (${typeLabel})?`);
  }

  // Question from summary
  if (summary && summary.trim()) {
    questions.push(`Welche Informationen enthält ${title ?? "das Dokument"}? ${summary.trim()}`);
  }

  // Question from person association
  for (const person of persons) {
    if (person.trim()) {
      questions.push(
        `Welche Dokumente betreffen ${person.trim()}?`,
      );
    }
  }

  // Question from organization
  if (organization && organization.trim()) {
    questions.push(
      `Welche Dokumente gibt es von ${organization.trim()}?`,
    );
  }

  return questions;
}

/** Human-readable German labels for document types in question form. */
const DOCUMENT_TYPE_QUESTION_LABELS: Record<string, string> = {
  invoice: "Rechnung",
  letter: "Brief",
  contract: "Vertrag",
  medical: "Arztbrief",
  school: "Schulbrief",
  insurance: "Versicherungsdokument",
  tax: "Steuerunterlage",
  other: "Dokument",
};

// ---------------------------------------------------------------------------
// Query embedding (for semantic search)
// ---------------------------------------------------------------------------

/**
 * Generate an embedding for a single search query string.
 *
 * This is a convenience wrapper around `generateEmbeddings` for the search
 * use case, where we embed one user query at a time. The resulting vector
 * is used for pgvector cosine similarity (`1 - <=>`) against
 * `document_embeddings`.
 *
 * @param query - The user's search query text.
 * @returns A 1536-dimensional embedding vector for the query.
 * @throws {EmbeddingError} if the query is empty or the OpenAI call fails.
 */
export async function generateQueryEmbedding(
  query: string,
): Promise<number[]> {
  if (!query || !query.trim()) {
    throw new EmbeddingError(
      "Suchanfrage darf nicht leer sein.",
      "EMPTY_QUERY",
    );
  }

  const chunks: TextChunk[] = [{ text: query.trim(), index: 0 }];
  const embeddings = await generateEmbeddings(chunks);
  return embeddings[0];
}

// ---------------------------------------------------------------------------
// Vector format helper
// ---------------------------------------------------------------------------

/**
 * Convert an embedding (number[]) to the pgvector string format
 * expected by Postgres: `[0.1,0.2,...]`.
 *
 * The Supabase JS client represents the vector column as a string in
 * TypeScript types (see `types/database.ts`), and PostgREST accepts the
 * pgvector text format for inserts.
 *
 * @param embedding - The 1536-dimensional embedding vector.
 * @returns A string in pgvector format: `[v1,v2,...,v1536]`.
 */
export function embeddingToVectorString(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
