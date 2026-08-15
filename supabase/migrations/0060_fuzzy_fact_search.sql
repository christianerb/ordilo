-- Fuzzy label lookup for numbers — putting the trigram index to work.
--
-- Migration 0027 created `document_facts_label_trgm_idx` for exactly this
-- and nothing ever used it: the fact search matches labels with ILIKE
-- '%term%', which is an exact substring test. A family that types
-- "Aktenzeihen" or "Steuernumer" gets nothing, even though the number is
-- right there.
--
-- `fuzzy_fact_search` is the fallback for that case. It uses the word
-- similarity operator `<%` (term is similar to SOME word inside the
-- label), which is the right shape here: labels are phrases
-- ("Aktenzeichen Jugendamt") and the query names one word of them. `<%`
-- is index-backed by the existing gin_trgm_ops index, so this stays a
-- lookup, not a scan.
--
-- The threshold is a parameter rather than a constant so the caller can
-- tighten it without a migration; it is applied with set_config(...,
-- true) — transaction-local, never leaking into another session.
--
-- Security: `security invoker` + the family filter, so RLS on
-- document_facts and documents applies exactly as it does to the ILIKE
-- path. Only facts of confirmed documents are visible, matching the
-- non-fuzzy query.
--
-- Idempotent: `drop function if exists` for the exact signature, then
-- `create or replace`.

drop function if exists public.fuzzy_fact_search(uuid, text[], real, int);

create or replace function public.fuzzy_fact_search(
  p_family_id uuid,
  p_terms text[],
  p_threshold real default 0.6,
  p_limit int default 20
)
returns table (
  document_id uuid,
  label text,
  value text,
  normalized_value text,
  confidence double precision,
  similarity real
)
language plpgsql
security invoker
stable
as $$
begin
  -- Transaction-local: the `<%` operator reads this GUC.
  perform set_config(
    'pg_trgm.word_similarity_threshold',
    greatest(0.1, least(1.0, p_threshold))::text,
    true
  );

  return query
  select
    f.document_id,
    f.label,
    f.value,
    f.normalized_value,
    f.confidence,
    max(word_similarity(t.term, f.label))::real as similarity
  from public.document_facts f
  join public.documents d on d.id = f.document_id
  cross join unnest(p_terms) as t(term)
  where f.family_id = p_family_id
    and f.confirmed = true
    and d.status = 'confirmed'
    and t.term <% f.label
  group by f.document_id, f.label, f.value, f.normalized_value, f.confidence
  order by similarity desc
  limit greatest(0, least(p_limit, 50));
end;
$$;

revoke all on function public.fuzzy_fact_search(uuid, text[], real, int) from public;
grant execute on function public.fuzzy_fact_search(uuid, text[], real, int)
  to authenticated, service_role;
