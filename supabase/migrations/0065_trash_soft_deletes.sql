alter table public.documents add column if not exists deleted_at timestamptz;
alter table public.documents add column if not exists purge_claim_id uuid;
alter table public.documents add column if not exists purge_claimed_at timestamptz;
alter table public.tasks add column if not exists deleted_at timestamptz;
alter table public.tasks add column if not exists status_before_trash text;
alter table public.tasks add column if not exists trashed_by_document_id uuid references public.documents(id) on delete set null;
create index if not exists documents_family_deleted_at_idx on public.documents (family_id, deleted_at);
create index if not exists documents_purge_claim_id_idx on public.documents (purge_claim_id) where purge_claim_id is not null;
create index if not exists tasks_family_deleted_at_idx on public.tasks (family_id, deleted_at);
create index if not exists tasks_trashed_by_document_id_idx on public.tasks (trashed_by_document_id);

create or replace function public.trash_document(p_document_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_deleted_at timestamptz := now();
begin
  update public.documents
  set deleted_at = v_deleted_at
  where id = p_document_id
    and deleted_at is null;

  if not found then
    return false;
  end if;

  update public.tasks
  set status_before_trash = status,
      status = 'dismissed',
      deleted_at = v_deleted_at,
      trashed_by_document_id = p_document_id
  where document_id = p_document_id
    and deleted_at is null;

  return true;
end;
$$;

create or replace function public.claim_expired_trash_documents(
  p_cutoff timestamptz,
  p_claim_id uuid
)
returns table(id uuid, file_url text)
language sql
security invoker
set search_path = public
as $$
  update public.documents
  set purge_claim_id = p_claim_id,
      purge_claimed_at = now()
  where deleted_at < p_cutoff
    and (
      purge_claim_id is null
      or purge_claimed_at < now() - interval '1 hour'
    )
  returning documents.id, documents.file_url;
$$;

create or replace function public.restore_document(p_document_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.documents
  set deleted_at = null
  where id = p_document_id
    and deleted_at is not null
    and purge_claim_id is null;

  if not found then
    return false;
  end if;

  update public.tasks
  set status = coalesce(status_before_trash, 'open'),
      deleted_at = null,
      status_before_trash = null,
      trashed_by_document_id = null
  where trashed_by_document_id = p_document_id
    and deleted_at is not null;

  return true;
end;
$$;

create or replace function public.semantic_search(
  p_query_embedding vector(1536),
  p_family_id uuid,
  p_limit int default 10
)
returns table (document_id uuid, title text, chunk_text text, score double precision)
language sql security invoker stable
as $$
  select de.document_id, d.title, de.chunk_text,
    1 - (de.embedding <=> p_query_embedding) as score
  from public.document_embeddings de
  join public.documents d on d.id = de.document_id
  where de.family_id = p_family_id
    and d.status = 'confirmed'
    and d.deleted_at is null
    and de.embedding is not null
  order by de.embedding <=> p_query_embedding
  limit greatest(0, least(p_limit, 10));
$$;

create or replace function public.lexical_search(
  p_query text,
  p_family_id uuid,
  p_limit int default 10
)
returns table (document_id uuid, title text, chunk_text text, score double precision)
language sql security invoker stable
as $$
  select de.document_id, d.title, de.chunk_text,
    ts_rank_cd(de.chunk_text_fts, q.tsq)::double precision as score
  from public.document_embeddings de
  join public.documents d on d.id = de.document_id
  cross join (
    select replace(websearch_to_tsquery('german', p_query)::text, ' & ', ' | ')::tsquery as tsq
  ) q
  where de.family_id = p_family_id
    and d.status = 'confirmed'
    and d.deleted_at is null
    and q.tsq <> ''::tsquery
    and de.chunk_text_fts @@ q.tsq
  order by score desc
  limit greatest(0, least(p_limit, 10));
$$;

create or replace function public.fuzzy_fact_search(
  p_family_id uuid,
  p_terms text[],
  p_threshold real default 0.6,
  p_limit int default 20
)
returns table (
  document_id uuid, label text, value text, normalized_value text,
  confidence double precision, similarity real
)
language plpgsql security invoker stable
as $$
begin
  perform set_config(
    'pg_trgm.word_similarity_threshold',
    greatest(0.1, least(1.0, p_threshold))::text,
    true
  );

  return query
  select f.document_id, f.label, f.value, f.normalized_value, f.confidence,
    max(word_similarity(t.term, f.label))::real as similarity
  from public.document_facts f
  join public.documents d on d.id = f.document_id
  cross join unnest(p_terms) as t(term)
  where f.family_id = p_family_id
    and f.confirmed = true
    and d.status = 'confirmed'
    and d.deleted_at is null
    and t.term <% f.label
  group by f.document_id, f.label, f.value, f.normalized_value, f.confidence
  order by similarity desc
  limit greatest(0, least(p_limit, 50));
end;
$$;
