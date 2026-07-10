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
