-- 0018_task_details_tags_documents.sql
-- Add description, tags, and multi-document linking to tasks.

-- Add description column (nullable — existing tasks have no description)
alter table public.tasks add column if not exists description text;

-- Add tags column (text array, defaults to empty array)
alter table public.tasks add column if not exists tags text[] not null default '{}';

-- Join table for additional linked documents beyond the primary document_id
create table if not exists public.task_documents (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid references public.tasks (id) on delete cascade not null,
  document_id uuid references public.documents (id) on delete cascade not null,
  family_id   uuid references public.families (id) on delete cascade not null,
  created_at  timestamptz not null default now(),
  unique (task_id, document_id)
);

-- RLS for task_documents (same pattern as tasks: family-scoped)
alter table public.task_documents enable row level security;

create policy "task_documents family select"
  on public.task_documents for select
  using (
    family_id in (
      select id from public.families where created_by = auth.uid()
    )
  );

create policy "task_documents family insert"
  on public.task_documents for insert
  with check (
    family_id in (
      select id from public.families where created_by = auth.uid()
    )
  );

create policy "task_documents family delete"
  on public.task_documents for delete
  using (
    family_id in (
      select id from public.families where created_by = auth.uid()
    )
  );

-- Index for lookups by task_id
create index if not exists idx_task_documents_task_id
  on public.task_documents (task_id);

-- Index for lookups by document_id
create index if not exists idx_task_documents_document_id
  on public.task_documents (document_id);
