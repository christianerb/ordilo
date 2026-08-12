/**
 * Central AI model configuration.
 *
 * All OpenAI model names live here so there is a single source of truth.
 * Import from here instead of hardcoding model strings in route files or
 * library modules.
 */

/** Cost-efficient model for mechanical and retrieval-adjacent AI work. */
export const GENERAL_MODEL = "gpt-5.6-luna";

/** Higher-capability model for multi-step reasoning and structured analysis. */
export const REASONING_MODEL = "gpt-5.6-terra";

/** Model for LLM extraction (document analysis, entity/task detection). Runs once per document on confirm. */
export const EXTRACTION_MODEL = REASONING_MODEL;

/** Model for user-facing, tool-calling chat. */
export const CHAT_MODEL = REASONING_MODEL;

/** Model for query expansion, HyDE search variants, and result re-ranking. */
export const SEARCH_AUGMENTATION_MODEL = GENERAL_MODEL;

/**
 * Reasoning effort for agentic, tool-calling chat. Responses API supports
 * reasoning together with function tools, unlike the legacy completions API.
 */
export const CHAT_REASONING_EFFORT = "low" as const;

/** Reasoning effort for structured document analysis. */
export const EXTRACTION_REASONING_EFFORT = "medium" as const;

/**
 * Reasoning effort for search-result re-ranking. Scoring ten documents
 * 0-10 is a mechanical task — no explicit reasoning keeps the re-rank from adding
 * noticeable latency on the search critical path.
 */
export const RERANK_REASONING_EFFORT = "none" as const;

/** Model for text embeddings (semantic search vectors). */
export const EMBEDDINGS_MODEL = "text-embedding-3-large";

/** Dimensionality of the embedding vectors (must match pgvector column).
 *
 * We use text-embedding-3-large with dimensionality reduction to 1536
 * (via the OpenAI `dimensions` API parameter). This gives us the quality
 * of the large model while staying within pgvector's 2000-dim HNSW limit
 * and avoiding a schema migration. The large model at 1536 dims
 * outperforms text-embedding-3-small at the same dimensionality.
 */
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
 *   3 — text-embedding-3-large (3072 dims) + OCR cleaning + contextual
 *        chunks (title prefix) + enriched synthetic questions (tags/dates)
 *   4 — time-specific synthetic questions (Um wieviel Uhr, Wie spät, Uhrzeit)
 *        + improved extraction prompt (detailed summaries, always tags, times)
 *        + re-analyze keeps confirmed status with auto re-embedding
 */
export const PIPELINE_VERSION = 4;
