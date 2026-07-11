/**
 * Central AI model configuration.
 *
 * All OpenAI model names live here so there is a single source of truth.
 * Import from here instead of hardcoding model strings in route files or
 * library modules.
 */

/** Model for LLM extraction (document analysis, entity/task detection). Runs once per document on confirm. */
export const EXTRACTION_MODEL = "gpt-5.4-mini";

/** Model for user-facing chat with tool calling (streaming). */
export const CHAT_MODEL = "gpt-5.4-mini";

/** Model for text embeddings (semantic search vectors). */
export const EMBEDDINGS_MODEL = "text-embedding-3-small";

/** Dimensionality of the embedding vectors (must match pgvector column). */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Current pipeline version.
 *
 * Stamped on every embedding row (`document_embeddings.pipeline_version`)
 * and on analyzed documents (`documents.extraction_version`). Bump this
 * whenever the embedding model, chunking strategy, or extraction schema/
 * prompt changes in a way that makes previously processed documents stale.
 * The reindex job (`job_type = 'reindex'`) re-embeds documents whose
 * embeddings carry an older version.
 *
 * History:
 *   1 — initial pipeline (pre-versioning)
 *   2 — typed document facts extraction + versioned embeddings
 */
export const PIPELINE_VERSION = 2;
