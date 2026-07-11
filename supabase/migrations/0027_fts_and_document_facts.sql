-- 0027_fts_and_document_facts.sql
--
-- Lexical (full-text) search + typed document facts.
--
-- 1. Full-text search over embedding chunks
--    Semantic embeddings are the WORST retrieval path for exact
--    identifiers (serial numbers, IBANs, policy numbers) and for rare
--    literal terms. A German tsvector index + a trigram index give exact
--    and substring matching; results are fused with the vector search via
--    reciprocal rank fusion in the app layer (src/lib/ai/search.ts).
--
-- 2. document_facts
--    Typed key-value facts extracted from documents (Seriennummer,
--    Vertragsnummer, Policennummer, IBAN, Kennzeichen, ...). Facts make
--    "Wie ist die Seriennummer der Waschmaschine?" a precise lookup
--    instead of a retrieval gamble. `normalized_value` is the identifier
--    lowercased with all non-alphanumeric characters stripped, so
--    "SN 4823-XK" matches "sn4823xk" regardless of formatting.

-- ============================================================================
-- 1. Full-text + trigram indexes on document_embeddings.chunk_text
-- ============================================================================

alter table public.document_embeddings
  add column if not exists chunk_text_fts tsvector
  generated always as (to_tsvector('german', coalesce(chunk_text, ''))) stored;

create index if not exists document_embeddings_fts_idx
  on public.document_embeddings
  using gin (chunk_text_fts);

-- Trigram index for substring matching of identifiers inside chunks
-- (FTS tokenization mangles things like "SN-4823-XK"; trigram ILIKE does not).
create index if not exists document_embeddings_chunk_trgm_idx
  on public.document_embeddings
  using gin (chunk_text gin_trgm_ops);

-- ============================================================================
-- 2. Lexical search RPC
-- ============================================================================
--
-- websearch_to_tsquery-based ranking over confirmed documents' chunks.
-- SECURITY INVOKER: RLS applies; additionally filtered by family + status,
-- mirroring semantic_search (0006).

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
  cross join (select websearch_to_tsquery('german', p_query) as tsq) q
  where de.family_id = p_family_id
    and d.status = 'confirmed'
    and q.tsq <> ''::tsquery
    and de.chunk_text_fts @@ q.tsq
  order by score desc
  limit greatest(0, least(p_limit, 10));
$$;

revoke all on function public.lexical_search(text, uuid, int) from public;
grant execute on function public.lexical_search(text, uuid, int) to authenticated, service_role;

-- ============================================================================
-- 3. document_facts
-- ============================================================================

create table if not exists public.document_facts (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid references public.documents (id) on delete cascade not null,
  family_id        uuid references public.families (id) on delete cascade not null,
  fact_type        text not null,   -- serial_number | contract_number | policy_number | customer_number | invoice_number | iban | license_plate | member_id | other
  label            text not null,   -- e.g. "Seriennummer Waschmaschine"
  value            text not null,   -- exact value as printed, e.g. "SN 4823-XK"
  normalized_value text not null,   -- lowercased, alphanumeric only, e.g. "sn4823xk"
  confidence       double precision not null default 0.0,
  confirmed        boolean not null default false,
  created_at       timestamptz not null default now()
);

create index if not exists document_facts_document_id_idx
  on public.document_facts (document_id);
create index if not exists document_facts_family_id_idx
  on public.document_facts (family_id);
create index if not exists document_facts_family_type_idx
  on public.document_facts (family_id, fact_type);

-- Trigram indexes: fuzzy lookup by label ("Seriennummer Waschmaschine")
-- and by normalized identifier value.
create index if not exists document_facts_label_trgm_idx
  on public.document_facts
  using gin (label gin_trgm_ops);
create index if not exists document_facts_normalized_trgm_idx
  on public.document_facts
  using gin (normalized_value gin_trgm_ops);

alter table public.document_facts enable row level security;

create policy "document_facts_select" on public.document_facts
  for select using (public.user_belongs_to_family(family_id));
create policy "document_facts_insert" on public.document_facts
  for insert with check (public.user_belongs_to_family(family_id));
create policy "document_facts_update" on public.document_facts
  for update using (public.user_belongs_to_family(family_id))
  with check (public.user_belongs_to_family(family_id));
create policy "document_facts_delete" on public.document_facts
  for delete using (public.user_belongs_to_family(family_id));
