alter table public.documents add column if not exists deleted_at timestamptz;
alter table public.tasks add column if not exists deleted_at timestamptz;
create index if not exists documents_family_deleted_at_idx on public.documents (family_id, deleted_at);
create index if not exists tasks_family_deleted_at_idx on public.tasks (family_id, deleted_at);
