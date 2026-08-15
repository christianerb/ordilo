import {
  chunkPages,
  generateEmbeddings,
  embeddingToVectorString,
  deduplicateChunks,
  generateSyntheticQuestions,
  cleanOcrForEmbedding,
  contextualizeForEmbedding,
  type TextChunk,
  type PageContent,
  type PageTextChunk,
} from "@/lib/ai/embeddings";
import type { ConfirmRpcEmbedding } from "@/types/database";
import type { DocumentAnalysis } from "@/lib/schemas/extraction";

/**
 * The metadata that shapes a document's embeddings. Chunk vectors are
 * contextualized with the title, and the synthetic questions are built
 * from all of these — which is why editing any of them makes the stored
 * embeddings stale and requires rebuilding them.
 */
export type EmbeddingMetadata = Pick<
  DocumentAnalysis,
  | "title"
  | "summary"
  | "document_type"
  | "family_members"
  | "organizations"
  | "tags"
  | "dates"
>;

/**
 * Build every embedding row a document needs: one per OCR chunk, plus the
 * synthetic questions generated from its metadata.
 *
 * Shared by confirm (first time a document enters the family book) and the
 * update route (after a correction), so both store the same shape and a
 * corrected title never leaves the old one in the search index.
 *
 * The OpenAI call for the chunk embeddings can throw (the caller decides
 * how to report that — confirm marks the document failed, an edit simply
 * fails the request). Question embeddings are a bonus: if they fail, the
 * chunk embeddings are returned on their own.
 */
export async function buildDocumentEmbeddings({
  pages,
  ocrTextFallback,
  metadata,
}: {
  /** Page rows for the document, in page order. */
  pages: { ocr_markdown: string | null; page_number: number }[];
  /** `documents.ocr_text`, used when no page markdown exists (e.g. notes). */
  ocrTextFallback: string | null;
  metadata: EmbeddingMetadata;
}): Promise<ConfirmRpcEmbedding[]> {
  // Page-aware content: every embedding row carries its originating
  // page_number in metadata_json (VAL-CONFIRM-005). OCR noise (image
  // references, icon labels, rules) is stripped first so embeddings
  // capture semantic content, not formatting artifacts.
  const pageContents: PageContent[] = pages
    .filter((p) => p.ocr_markdown && p.ocr_markdown.trim())
    .map((p) => ({
      text: cleanOcrForEmbedding(p.ocr_markdown!),
      page_number: p.page_number,
    }))
    .filter((p) => p.text.length > 0);

  if (pageContents.length === 0) {
    const fallbackText = cleanOcrForEmbedding((ocrTextFallback ?? "").trim());
    if (fallbackText) {
      pageContents.push({ text: fallbackText, page_number: 1 });
    }
  }

  const chunks = chunkPages(pageContents);
  let embeddings: number[][] = [];
  if (chunks.length > 0) {
    // Contextualize chunks with the document title before embedding so
    // each vector carries document-level context. The stored chunk_text
    // remains the clean original (for FTS + display).
    const embedChunks: TextChunk[] = chunks.map((c) => ({
      text: contextualizeForEmbedding(c.text, metadata.title),
      index: c.index,
    }));
    embeddings = await generateEmbeddings(embedChunks);
  }

  // Semantic deduplication — two chunks with >=85% cosine similarity are
  // redundant: they compete in vector search and degrade retrieval.
  let finalChunks: PageTextChunk[] = chunks;
  let finalEmbeddings: number[][] = embeddings;

  if (chunks.length > 1 && embeddings.length > 1) {
    const dedup = deduplicateChunks(chunks, embeddings);
    finalChunks = dedup.kept as PageTextChunk[];
    const removed = new Set(dedup.removedIndices);
    finalEmbeddings = embeddings.filter((_, i) => !removed.has(i));
  }

  const chunkEmbeddings: ConfirmRpcEmbedding[] = finalChunks.map(
    (chunk, i) => ({
      chunk_text: chunk.text,
      embedding: embeddingToVectorString(finalEmbeddings[i]),
      page_number: chunk.page_number,
      chunk_index: chunk.index,
      chunk_total: finalChunks.length,
      chunk_type: "chunk",
    }),
  );

  // Query-shaped embeddings — user queries are questions, and matching
  // question-to-question is structurally aligned with how people search.
  const syntheticQuestions = generateSyntheticQuestions({
    title: metadata.title,
    summary: metadata.summary,
    documentType: metadata.document_type,
    persons: metadata.family_members.map((m) => m.name).filter(Boolean),
    organization: metadata.organizations[0]?.name ?? null,
    tags: metadata.tags,
    hasDates: metadata.dates.length > 0,
  });

  if (syntheticQuestions.length === 0) return chunkEmbeddings;

  try {
    const questionEmbeddings = await generateEmbeddings(
      syntheticQuestions.map((text, index) => ({ text, index })),
    );
    return [
      ...chunkEmbeddings,
      ...questionEmbeddings.map((emb, i) => ({
        chunk_text: syntheticQuestions[i],
        embedding: embeddingToVectorString(emb),
        page_number: 1,
        chunk_index: i,
        chunk_total: questionEmbeddings.length,
        chunk_type: "question",
      })),
    ];
  } catch {
    return chunkEmbeddings;
  }
}

/**
 * Build the knowledge-graph label embeddings (document title, person and
 * organization names) so the graph can match semantically ("Kita" →
 * "Kindergarten") after a rename. Best-effort: returns an empty list when
 * the embedding call fails — a missing label vector costs fuzzy matching
 * for that node, not the write.
 */
export async function buildLabelEmbeddings(
  metadata: Pick<EmbeddingMetadata, "title" | "family_members" | "organizations">,
): Promise<{ label: string; embedding: string }[]> {
  try {
    const labels = [
      metadata.title || "Dokument",
      ...metadata.family_members.map((m) => m.name).filter(Boolean),
      ...metadata.organizations.map((o) => o.name).filter(Boolean),
    ];
    if (labels.length === 0) return [];

    const vectors = await generateEmbeddings(
      labels.map((text, index) => ({ text, index })),
    );
    return labels.map((label, i) => ({
      label,
      embedding: embeddingToVectorString(vectors[i]),
    }));
  } catch {
    return [];
  }
}
