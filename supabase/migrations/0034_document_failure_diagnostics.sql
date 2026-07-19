alter table public.documents
  add column if not exists failure_stage text,
  add column if not exists failure_code text,
  add column if not exists failed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'documents_failure_stage_check'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_failure_stage_check
      check (
        failure_stage is null
        or failure_stage in ('upload', 'ocr', 'analysis', 'confirmation', 'embedding')
      );
  end if;
end
$$;

create or replace function public.sync_document_failure_diagnostics()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'failed' then
    new.failed_at = coalesce(new.failed_at, now());
  else
    new.error_message = null;
    new.failure_stage = null;
    new.failure_code = null;
    new.failed_at = null;
  end if;
  return new;
end
$$;

drop trigger if exists sync_document_failure_diagnostics on public.documents;
create trigger sync_document_failure_diagnostics
before insert or update of status on public.documents
for each row
execute function public.sync_document_failure_diagnostics();
