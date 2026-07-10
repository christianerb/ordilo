-- 0016_semantic_node_search_rpc.sql
-- RPC for semantic search on knowledge_nodes.label_embedding.
--
-- Finds nodes whose label_embedding is cosine-similar to the query embedding.
-- This enables semantic matching: "Kita" finds "Kindergarten" even though
-- they share no characters, because their embeddings are close in vector space.
--
-- Security: SECURITY INVOKER (RLS enforced on knowledge_nodes table).

create or replace function public.semantic_node_search(
  p_query_embedding vector(1536),
  p_family_id uuid,
  p_limit int default 10,
  p_threshold float default 0.7
)
returns table (
  id uuid,
  type text,
  label text,
  score float
)
language sql
stable
security invoker
as $$
  select
    n.id,
    n.type,
    n.label,
    1 - (n.label_embedding <=> p_query_embedding) as score
  from public.knowledge_nodes n
  where n.family_id = p_family_id
    and n.label_embedding is not null
    and 1 - (n.label_embedding <=> p_query_embedding) >= p_threshold
  order by n.label_embedding <=> p_query_embedding
  limit p_limit;
$$;
