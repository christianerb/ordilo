-- 0014_node_label_embeddings.sql
-- Add label_embedding column to knowledge_nodes for semantic label matching.
--
-- Instead of matching node labels only with ILIKE (text substring), we now
-- store a text-embedding-3-small vector for each node's label. This enables
-- cosine similarity matching: "Kita" finds "Kindergarten" even though they
-- share no characters, because their embeddings are close in vector space.
--
-- This is SOTA knowledge graph retrieval: semantic node matching instead
-- of lexical matching.

-- Add the embedding column (nullable so existing nodes can be backfilled)
alter table public.knowledge_nodes
  add column if not exists label_embedding vector(1536);

-- HNSW index for fast cosine similarity search on label embeddings
create index if not exists knowledge_nodes_label_embedding_idx
  on public.knowledge_nodes
  using hnsw (label_embedding vector_cosine_ops);

-- Composite index for family-scoped label embedding search
create index if not exists knowledge_nodes_family_label_embedding_idx
  on public.knowledge_nodes (family_id)
  where label_embedding is not null;
