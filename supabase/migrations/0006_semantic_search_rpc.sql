-- Semantic search RPC for pgvector cosine similarity.
--
-- Provides the server-side query backing POST /api/search (mode: semantic).
-- The Supabase JS client cannot use the pgvector `<=>` operator directly
-- through PostgREST, so we wrap the similarity query in a SECURITY INVOKER
-- function. RLS is enforced on both `document_embeddings` and `documents`
-- for the caller's session, and we additionally filter by `p_family_id`
-- and `documents.status = 'confirmed'` so only confirmed documents from
-- the requesting user's family are ever returned (VAL-SEARCH-002,
-- VAL-SEARCH-003, confirmed-vs-unconfirmed distinction).

create or replace function public.semantic_search(
  p_query_embedding vector(1536),
  p_family_id uuid,
  p_limit int default 10
)
returns table (
  document_id uuid,
  title text,
  chunk_text text,
  score double precision
)
language sql
security invoker
stable
as $$
  select
    de.document_id,
    d.title,
    de.chunk_text,
    1 - (de.embedding <=> p_query_embedding) as score
  from public.document_embeddings de
  join public.documents d on d.id = de.document_id
  where de.family_id = p_family_id
    and d.status = 'confirmed'
    and de.embedding is not null
  order by de.embedding <=> p_query_embedding
  limit greatest(0, least(p_limit, 10));
$$;

-- Grant execute to authenticated users only (the server client runs with
-- an authenticated session, so RLS + this grant enforce family scoping).
revoke all on function public.semantic_search(vector(1536), uuid, int) from public;
grant execute on function public.semantic_search(vector(1536), uuid, int) to authenticated;
