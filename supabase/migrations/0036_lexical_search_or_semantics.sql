-- Switch lexical_search from AND to OR semantics so natural-language
-- questions like "Wann ging mein letzter Flug" match documents that
-- contain ANY of the query terms, not ALL of them.
--
-- Before: websearch_to_tsquery produces 'wann' & 'ging' & 'letzt' & 'flug'
--   → requires every term in the same chunk → almost never matches.
-- After:  the & operators are replaced with | (OR), so 'wann' | 'ging' |
--   'letzt' | 'flug' matches any chunk containing at least one term.
--   ts_rank_cd still ranks chunks with more matching terms higher.
--
-- Phrase queries ("easyjet flug") are unaffected: websearch_to_tsquery
-- encodes them with <-> (adjacency), not &, so the replace only touches
-- the inter-term AND operators.

create or replace function public.lexical_search(
  p_query text,
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
    ts_rank_cd(de.chunk_text_fts, q.tsq)::double precision as score
  from public.document_embeddings de
  join public.documents d on d.id = de.document_id
  cross join (
    select replace(
      websearch_to_tsquery('german', p_query)::text,
      ' & ',
      ' | '
    )::tsquery as tsq
  ) q
  where de.family_id = p_family_id
    and d.status = 'confirmed'
    and q.tsq <> ''::tsquery
    and de.chunk_text_fts @@ q.tsq
  order by score desc
  limit greatest(0, least(p_limit, 10));
$$;

revoke all on function public.lexical_search(text, uuid, int) from public;
grant execute on function public.lexical_search(text, uuid, int) to authenticated, service_role;
