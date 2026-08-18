-- Recoverable deletion for documents and tasks.
--
-- Live application queries should not need to remember a deleted_at filter.
-- RLS hides trashed rows centrally, while the small RPC surface below owns
-- trash listing, atomic trash/restore transitions, and the final purge claim.

alter table public.documents
  add column if not exists deleted_at timestamptz,
  add column if not exists purge_started_at timestamptz;

alter table public.tasks
  add column if not exists deleted_at timestamptz,
  add column if not exists trashed_by_document_id uuid
    references public.documents(id) on delete set null;

create index if not exists documents_family_deleted_at_idx
  on public.documents (family_id, deleted_at);
create index if not exists documents_purge_started_at_idx
  on public.documents (purge_started_at)
  where purge_started_at is not null;
create index if not exists tasks_family_deleted_at_idx
  on public.tasks (family_id, deleted_at);
create index if not exists tasks_trashed_by_document_id_idx
  on public.tasks (trashed_by_document_id)
  where trashed_by_document_id is not null;

-- Active rows are the default everywhere. The paper bin deliberately uses
-- list_trash instead of bypassing this boundary in individual screens.
drop policy if exists "documents_select" on public.documents;
create policy "documents_select" on public.documents
  for select using (
    deleted_at is null
    and public.user_belongs_to_family(family_id)
  );

drop policy if exists "documents_update" on public.documents;
create policy "documents_update" on public.documents
  for update using (
    deleted_at is null
    and public.user_belongs_to_family(family_id)
  ) with check (
    deleted_at is null
    and public.user_belongs_to_family(family_id)
  );

-- Document deletion now goes through trash_document. The service role still
-- bypasses RLS for the scheduled permanent purge.
drop policy if exists "documents_delete" on public.documents;

drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select" on public.tasks
  for select using (
    deleted_at is null
    and public.user_belongs_to_family(family_id)
  );

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update using (
    deleted_at is null
    and public.user_belongs_to_family(family_id)
  ) with check (
    deleted_at is null
    and public.user_belongs_to_family(family_id)
  );

-- Physical task deletion is reserved for trusted database functions and the
-- service-role cleanup. The confirm/re-analysis paths are wrapped below.
drop policy if exists "tasks_delete" on public.tasks;

-- Derived document content follows the parent visibility rule as well. This
-- keeps dates, facts, and embeddings from surfacing while their source lives
-- in the paper bin.
drop policy if exists "document_pages_select" on public.document_pages;
create policy "document_pages_select" on public.document_pages
  for select using (
    exists (
      select 1
      from public.documents d
      where d.id = document_id
        and d.deleted_at is null
        and public.user_belongs_to_family(d.family_id)
    )
  );

drop policy if exists "extracted_entities_select" on public.extracted_entities;
create policy "extracted_entities_select" on public.extracted_entities
  for select using (
    public.user_belongs_to_family(family_id)
    and exists (
      select 1 from public.documents d
      where d.id = document_id and d.deleted_at is null
    )
  );

drop policy if exists "document_embeddings_select" on public.document_embeddings;
create policy "document_embeddings_select" on public.document_embeddings
  for select using (
    public.user_belongs_to_family(family_id)
    and exists (
      select 1 from public.documents d
      where d.id = document_id and d.deleted_at is null
    )
  );

drop policy if exists "document_facts_select" on public.document_facts;
create policy "document_facts_select" on public.document_facts
  for select using (
    public.user_belongs_to_family(family_id)
    and exists (
      select 1 from public.documents d
      where d.id = document_id and d.deleted_at is null
    )
  );

drop policy if exists "task_documents family select" on public.task_documents;
create policy "task_documents family select" on public.task_documents
  for select using (
    public.user_belongs_to_family(family_id)
    and exists (
      select 1 from public.documents d
      where d.id = document_id and d.deleted_at is null
    )
    and exists (
      select 1 from public.tasks t
      where t.id = task_id and t.deleted_at is null
    )
  );

drop policy if exists "processing_jobs_select" on public.processing_jobs;
create policy "processing_jobs_select" on public.processing_jobs
  for select using (
    public.user_belongs_to_family(family_id)
    and (
      document_id is null
      or exists (
        select 1 from public.documents d
        where d.id = document_id and d.deleted_at is null
      )
    )
  );

create or replace function public.trash_document(p_document_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_at timestamptz := now();
  v_status text;
  v_was_deleted boolean;
begin
  select d.status, d.deleted_at is not null
    into v_status, v_was_deleted
  from public.documents d
  where d.id = p_document_id
    and public.user_belongs_to_family(d.family_id)
  for update;

  if not found then
    return 'not_found';
  end if;
  if v_was_deleted then
    return 'already_trashed';
  end if;
  if v_status in ('ocr_processing', 'analyzing') then
    return 'busy';
  end if;

  update public.documents
  set deleted_at = v_deleted_at
  where id = p_document_id;

  update public.tasks t
  set deleted_at = v_deleted_at,
      trashed_by_document_id = p_document_id
  where t.document_id = p_document_id
    and t.deleted_at is null;

  return 'trashed';
end;
$$;

create or replace function public.restore_document(p_document_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.documents d
  set deleted_at = null
  where d.id = p_document_id
    and d.deleted_at is not null
    and d.purge_started_at is null
    and public.user_belongs_to_family(d.family_id);

  if not found then
    return false;
  end if;

  update public.tasks t
  set deleted_at = null,
      trashed_by_document_id = null
  where t.trashed_by_document_id = p_document_id
    and t.deleted_at is not null;

  return true;
end;
$$;

create or replace function public.trash_task(p_task_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tasks t
  set deleted_at = now(),
      trashed_by_document_id = null
  where t.id = p_task_id
    and t.deleted_at is null
    and public.user_belongs_to_family(t.family_id);

  return found;
end;
$$;

create or replace function public.restore_task(p_task_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tasks t
  set deleted_at = null
  where t.id = p_task_id
    and t.deleted_at is not null
    and t.trashed_by_document_id is null
    and public.user_belongs_to_family(t.family_id)
    and (
      t.document_id is null
      or exists (
        select 1 from public.documents d
        where d.id = t.document_id
          and d.deleted_at is null
          and d.purge_started_at is null
      )
    );

  return found;
end;
$$;

create or replace function public.list_trash(p_family_id uuid)
returns table (
  item_type text,
  id uuid,
  label text,
  deleted_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.user_belongs_to_family(p_family_id) then
    return;
  end if;

  return query
    select trash_rows.item_type,
           trash_rows.id,
           trash_rows.label,
           trash_rows.deleted_at
    from (
      select 'document'::text as item_type,
             d.id,
             coalesce(nullif(d.title, ''), nullif(d.original_filename, ''), 'Ohne Titel') as label,
             d.deleted_at
      from public.documents d
      where d.family_id = p_family_id
        and d.deleted_at is not null
        and d.purge_started_at is null
      union all
      select 'task'::text as item_type,
             t.id,
             coalesce(nullif(t.title, ''), 'Ohne Titel') as label,
             t.deleted_at
      from public.tasks t
      where t.family_id = p_family_id
        and t.deleted_at is not null
        and t.trashed_by_document_id is null
    ) trash_rows
    order by trash_rows.deleted_at desc;
end;
$$;

revoke all on function public.trash_document(uuid) from public, anon;
revoke all on function public.restore_document(uuid) from public, anon;
revoke all on function public.trash_task(uuid) from public, anon;
revoke all on function public.restore_task(uuid) from public, anon;
revoke all on function public.list_trash(uuid) from public, anon;
grant execute on function public.trash_document(uuid) to authenticated, service_role;
grant execute on function public.restore_document(uuid) to authenticated, service_role;
grant execute on function public.trash_task(uuid) to authenticated, service_role;
grant execute on function public.restore_task(uuid) to authenticated, service_role;
grant execute on function public.list_trash(uuid) to authenticated, service_role;

-- Replace all extraction-derived rows in one transaction while holding the
-- document row lock. A concurrent trash operation therefore happens wholly
-- before or wholly after the replacement, never between its delete/insert
-- phases.
create or replace function public.replace_document_extraction(
  p_document_id uuid,
  p_family_id uuid,
  p_entities jsonb,
  p_tasks jsonb,
  p_facts jsonb,
  p_clear_edges boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1
  from public.documents d
  where d.id = p_document_id
    and d.family_id = p_family_id
    and d.status = 'analyzing'
    and d.deleted_at is null
    and (
      auth.role() = 'service_role'
      or public.user_belongs_to_family(d.family_id)
    )
  for update;

  if not found then
    return false;
  end if;

  delete from public.extracted_entities where document_id = p_document_id;
  delete from public.tasks where document_id = p_document_id;
  delete from public.document_facts where document_id = p_document_id;

  if p_clear_edges then
    delete from public.knowledge_edges where source_document_id = p_document_id;
  end if;

  insert into public.extracted_entities (
    document_id, family_id, entity_type, entity_value, normalized_value,
    label, amount_minor, currency, amount_kind, value_date, confidence,
    linked_object_id
  )
  select p_document_id, p_family_id, entity.entity_type, entity.entity_value,
         entity.normalized_value, entity.label, entity.amount_minor,
         entity.currency, entity.amount_kind, entity.value_date,
         entity.confidence, entity.linked_object_id
  from jsonb_to_recordset(coalesce(p_entities, '[]'::jsonb)) as entity (
    entity_type text,
    entity_value text,
    normalized_value text,
    label text,
    amount_minor bigint,
    currency text,
    amount_kind text,
    value_date date,
    confidence double precision,
    linked_object_id uuid
  );

  insert into public.tasks (
    family_id, document_id, title, due_date, status, confidence
  )
  select p_family_id, p_document_id, task.title, task.due_date,
         coalesce(task.status, 'open'), task.confidence
  from jsonb_to_recordset(coalesce(p_tasks, '[]'::jsonb)) as task (
    title text,
    due_date date,
    status text,
    confidence double precision
  );

  insert into public.document_facts (
    document_id, family_id, fact_type, label, value, normalized_value,
    confidence
  )
  select p_document_id, p_family_id, fact.fact_type, fact.label, fact.value,
         fact.normalized_value, fact.confidence
  from jsonb_to_recordset(coalesce(p_facts, '[]'::jsonb)) as fact (
    fact_type text,
    label text,
    value text,
    normalized_value text,
    confidence double precision
  );

  return true;
end;
$$;

revoke all on function public.replace_document_extraction(
  uuid, uuid, jsonb, jsonb, jsonb, boolean
) from public, anon;
grant execute on function public.replace_document_extraction(
  uuid, uuid, jsonb, jsonb, jsonb, boolean
) to authenticated, service_role;

-- Keep the large, proven confirm transaction intact, but put a narrow
-- authorization wrapper in front of it. The internal function runs as the
-- owner so it can replace tasks after the direct task-delete policy is gone.
do $$
begin
  if to_regprocedure(
    'public.confirm_document_internal(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,integer)'
  ) is null then
    alter function public.confirm_document(
      uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb,
      jsonb, jsonb, jsonb, jsonb, int
    ) rename to confirm_document_internal;
  end if;
end;
$$;

alter function public.confirm_document_internal(
  uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb,
  jsonb, jsonb, jsonb, jsonb, int
) security definer;
alter function public.confirm_document_internal(
  uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb,
  jsonb, jsonb, jsonb, jsonb, int
) set search_path = public, pg_temp;
revoke all on function public.confirm_document_internal(
  uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb,
  jsonb, jsonb, jsonb, jsonb, int
) from public, anon, authenticated;

create or replace function public.confirm_document(
  p_document_id uuid,
  p_family_id uuid,
  p_title text,
  p_summary text,
  p_document_type text,
  p_category text,
  p_persons jsonb default '[]'::jsonb,
  p_organizations jsonb default '[]'::jsonb,
  p_embeddings jsonb default '[]'::jsonb,
  p_label_embeddings jsonb default '[]'::jsonb,
  p_entities jsonb default '[]'::jsonb,
  p_tasks jsonb default '[]'::jsonb,
  p_facts jsonb default '[]'::jsonb,
  p_pipeline_version int default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1
  from public.documents d
  where d.id = p_document_id
    and d.family_id = p_family_id
    and d.status = 'analyzed'
    and d.deleted_at is null
    and public.user_belongs_to_family(d.family_id)
  for update;

  if not found then
    return jsonb_build_object('status', 'status_changed');
  end if;

  return public.confirm_document_internal(
    p_document_id, p_family_id, p_title, p_summary, p_document_type,
    p_category, p_persons, p_organizations, p_embeddings,
    p_label_embeddings, p_entities, p_tasks, p_facts, p_pipeline_version
  );
end;
$$;

revoke all on function public.confirm_document(
  uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb,
  jsonb, jsonb, jsonb, jsonb, int
) from public, anon;
grant execute on function public.confirm_document(
  uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb,
  jsonb, jsonb, jsonb, jsonb, int
) to authenticated;

-- Claiming makes a document non-restorable before its Storage object is
-- removed. A stale claim may be retried after one hour by the scheduler.
create or replace function public.claim_expired_trash_documents(p_cutoff timestamptz)
returns table(id uuid, file_url text)
language sql
security definer
set search_path = public
as $$
  update public.documents d
  set purge_started_at = now()
  where d.deleted_at < p_cutoff
    and (
      d.purge_started_at is null
      or d.purge_started_at < now() - interval '1 hour'
    )
  returning d.id, d.file_url;
$$;

revoke all on function public.claim_expired_trash_documents(timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_expired_trash_documents(timestamptz)
  to service_role;

-- New workers never claim jobs for documents in the paper bin. In-flight
-- writes are rejected below by the child-row guard.
create or replace function public.claim_processing_jobs(p_limit int default 5)
returns setof public.processing_jobs
language sql
security definer
set search_path = public
as $$
  update public.processing_jobs j
  set status     = 'running',
      attempts   = j.attempts + 1,
      started_at = now(),
      updated_at = now()
  where j.id in (
    select candidate.id
    from public.processing_jobs candidate
    left join public.documents d on d.id = candidate.document_id
    where candidate.status = 'pending'
      and candidate.run_after <= now()
      and (candidate.document_id is null or d.deleted_at is null)
    order by candidate.created_at
    limit greatest(0, least(p_limit, 20))
    for update of candidate skip locked
  )
  returning j.*;
$$;

revoke all on function public.claim_processing_jobs(int) from public, anon, authenticated;
grant execute on function public.claim_processing_jobs(int) to service_role;

-- A worker that started just before deletion must not recreate or rewrite
-- derived content afterwards. Purge cascades are allowed once claimed.
create or replace function public.guard_trashed_document_child()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document_id uuid;
  v_deleted_at timestamptz;
  v_purge_started_at timestamptz;
begin
  v_document_id := case when tg_op = 'DELETE' then old.document_id else new.document_id end;
  if v_document_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  select d.deleted_at, d.purge_started_at
    into v_deleted_at, v_purge_started_at
  from public.documents d
  where d.id = v_document_id;

  if v_deleted_at is not null and v_purge_started_at is null then
    raise exception 'document is in trash' using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_trashed_document_child()
  from public, anon, authenticated;

drop trigger if exists guard_trashed_document_pages on public.document_pages;
create trigger guard_trashed_document_pages
  before insert or update or delete on public.document_pages
  for each row execute function public.guard_trashed_document_child();

drop trigger if exists guard_trashed_extracted_entities on public.extracted_entities;
create trigger guard_trashed_extracted_entities
  before insert or update or delete on public.extracted_entities
  for each row execute function public.guard_trashed_document_child();

drop trigger if exists guard_trashed_document_embeddings on public.document_embeddings;
create trigger guard_trashed_document_embeddings
  before insert or update or delete on public.document_embeddings
  for each row execute function public.guard_trashed_document_child();

drop trigger if exists guard_trashed_document_facts on public.document_facts;
create trigger guard_trashed_document_facts
  before insert or update or delete on public.document_facts
  for each row execute function public.guard_trashed_document_child();

drop trigger if exists guard_trashed_task_documents on public.task_documents;
create trigger guard_trashed_task_documents
  before insert or update or delete on public.task_documents
  for each row execute function public.guard_trashed_document_child();

drop trigger if exists guard_trashed_document_tasks on public.tasks;
create trigger guard_trashed_document_tasks
  before insert or delete on public.tasks
  for each row execute function public.guard_trashed_document_child();

-- Explicit predicates also protect service-role callers, which bypass RLS.
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
