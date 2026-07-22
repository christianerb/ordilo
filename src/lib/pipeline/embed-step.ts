import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConfirmRpcEmbedding, Database } from "@/types/database";
import {
  chunkPages,
  generateEmbeddings,
  embeddingToVectorString,
  deduplicateChunks,
  generateSyntheticQuestions,
  cleanOcrForEmbedding,
  contextualizeForEmbedding,
  type PageContent,
  type PageTextChunk,
  type TextChunk,
} from "@/lib/ai/embeddings";

/**
 * Shared embedding-generation step.
 *
 * Builds the full embedding set for a document from its STORED state
 * (document_pages + documents + extracted_entities), mirroring what the
 * confirm route builds from the review payload:
 *   - page-aware text chunks (with overlap), semantically deduplicated
 *   - synthetic question embeddings from title/summary/type/persons/org
 *
 * Used by the `reindex` job to re-embed already-confirmed documents after
 * a pipeline upgrade (chunking change, prompt change, new question shapes).
 */

type Client = SupabaseClient<Database>;

/**
 * Build the embedding rows (pgvector text format) for a confirmed document
 * from its stored pages and metadata.
 *
 * @returns The embedding rows, or an empty array when the document has no
 *          OCR text at all.
 * @throws {EmbeddingError} if the OpenAI embeddings call fails.
 * @throws {Error} on DB read failure.
 */
export async function buildDocumentEmbeddings(
  client: Client,
  documentId: string,
): Promise<ConfirmRpcEmbedding[]> {
  // 1. Load the document + pages --------------------------------------------
  const { data: document, error: docError } = await client
    .from("documents")
    .select("id, title, summary, document_type, ocr_text")
    .eq("id", documentId)
    .maybeSingle();

  if (docError || !document) {
    throw new Error("Dokument konnte nicht geladen werden.");
  }

  const { data: pages, error: pagesError } = await client
    .from("document_pages")
    .select("ocr_markdown, page_number")
    .eq("document_id", documentId)
    .order("page_number", { ascending: true });

  if (pagesError) {
    throw new Error("OCR-Seiten konnten nicht geladen werden.");
  }

  const pageContents: PageContent[] = (pages ?? [])
    .filter((p) => p.ocr_markdown && p.ocr_markdown.trim())
    .map((p) => ({ text: cleanOcrForEmbedding(p.ocr_markdown!), page_number: p.page_number }))
    .filter((p) => p.text.length > 0);

  if (pageContents.length === 0) {
    const fallbackText = cleanOcrForEmbedding((document.ocr_text ?? "").trim());
    if (fallbackText) {
      pageContents.push({ text: fallbackText, page_number: 1 });
    }
  }

  // 2. Chunk + embed + deduplicate -------------------------------------------
  //    Chunks are contextualized with the document title before embedding
  //    so the embedding vector carries document-level context. The stored
  //    chunk_text remains the clean original (for FTS + display).
  const chunks = chunkPages(pageContents);
  let finalChunks: PageTextChunk[] = chunks;
  let finalEmbeddings: number[][] = [];

  if (chunks.length > 0) {
    const embedChunks: TextChunk[] = chunks.map((c) => ({
      text: contextualizeForEmbedding(c.text, document.title),
      index: c.index,
    }));
    const embeddings = await generateEmbeddings(embedChunks);
    finalEmbeddings = embeddings;

    if (chunks.length > 1 && embeddings.length > 1) {
      const dedup = deduplicateChunks(chunks, embeddings);
      finalChunks = dedup.kept as PageTextChunk[];
      const removedSet = new Set(dedup.removedIndices);
      finalEmbeddings = embeddings.filter((_, i) => !removedSet.has(i));
    }
  }

  // 3. Synthetic question embeddings from stored metadata --------------------
  const { data: entities } = await client
    .from("extracted_entities")
    .select("entity_value, entity_type")
    .eq("document_id", documentId)
    .in("entity_type", ["person", "organization", "tag", "date"]);

  const persons = (entities ?? [])
    .filter((e) => e.entity_type === "person")
    .map((e) => e.entity_value);
  const organization =
    (entities ?? []).find((e) => e.entity_type === "organization")
      ?.entity_value ?? null;
  const tags = (entities ?? [])
    .filter((e) => e.entity_type === "tag")
    .map((e) => e.entity_value);
  const hasDates = (entities ?? []).some((e) => e.entity_type === "date");

  const syntheticQuestions = generateSyntheticQuestions({
    title: document.title,
    summary: document.summary,
    documentType: document.document_type,
    persons,
    organization,
    tags,
    hasDates,
  });

  let questionEmbeddings: number[][] = [];
  if (syntheticQuestions.length > 0) {
    try {
      questionEmbeddings = await generateEmbeddings(
        syntheticQuestions.map((q, i) => ({ text: q, index: i })),
      );
    } catch {
      // Question embeddings are a bonus — continue with chunk-only.
      questionEmbeddings = [];
    }
  }

  // 4. Assemble the embedding rows -------------------------------------------
  const chunkRows: ConfirmRpcEmbedding[] = finalChunks.map((chunk, i) => ({
    chunk_text: chunk.text,
    embedding: embeddingToVectorString(finalEmbeddings[i]),
    page_number: chunk.page_number,
    chunk_index: chunk.index,
    chunk_total: finalChunks.length,
    chunk_type: "chunk",
  }));

  const questionRows: ConfirmRpcEmbedding[] = questionEmbeddings.map(
    (emb, i) => ({
      chunk_text: syntheticQuestions[i],
      embedding: embeddingToVectorString(emb),
      page_number: 1,
      chunk_index: i,
      chunk_total: questionEmbeddings.length,
      chunk_type: "question",
    }),
  );

  return [...chunkRows, ...questionRows];
}
