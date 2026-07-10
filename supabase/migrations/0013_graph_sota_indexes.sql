-- 0013_graph_sota_indexes.sql
-- Knowledge graph SOTA improvements:
--   1. pg_trgm extension + GIN trigram indexes on knowledge_nodes.label (fuzzy matching)
--   2. Composite indexes on knowledge_edges for fast traversal (source_node_id, target_node_id)
--   3. Composite index on knowledge_nodes (family_id, type) for filtered lookups

-- ---------------------------------------------------------------------------
-- 1. pg_trgm extension for fuzzy text matching
-- ---------------------------------------------------------------------------
-- Enables similarity() and % operator for trigram-based fuzzy matching.
-- Allows queries like "kita" to match "Kita Sonnenblume" even with typos.
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- 2. GIN trigram indexes on knowledge_nodes.label
-- ---------------------------------------------------------------------------
-- Speeds up ILIKE '%keyword%' queries and enables similarity-based matching.
-- Without this, ILIKE does sequential scans over all nodes.
create index if not exists knowledge_nodes_label_trgm_idx
  on public.knowledge_nodes
  using gin (label gin_trgm_ops);

-- Composite index for filtered lookups: "all person nodes in family X"
create index if not exists knowledge_nodes_family_type_idx
  on public.knowledge_nodes (family_id, type);

-- ---------------------------------------------------------------------------
-- 3. Edge traversal indexes
-- ---------------------------------------------------------------------------
-- These are critical for multi-hop graph traversal (WITH RECURSIVE).
-- Without indexes on source_node_id / target_node_id, every hop does a
-- sequential scan of all edges.
create index if not exists knowledge_edges_source_node_idx
  on public.knowledge_edges (source_node_id);

create index if not exists knowledge_edges_target_node_idx
  on public.knowledge_edges (target_node_id);

-- Composite index for confirmed-edge traversal (skip unconfirmed edges)
create index if not exists knowledge_edges_source_confirmed_idx
  on public.knowledge_edges (source_node_id)
  where confirmed = true;

create index if not exists knowledge_edges_target_confirmed_idx
  on public.knowledge_edges (target_node_id)
  where confirmed = true;
