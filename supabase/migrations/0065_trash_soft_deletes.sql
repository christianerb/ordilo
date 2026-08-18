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
