-- 0038_task_assignee_and_manual_creation.sql
-- Allow manual task creation (document_id nullable) and add assigned_to
-- for assigning tasks to family members.

-- Make document_id nullable so tasks can be created manually without a document
alter table public.tasks alter column document_id drop not null;

-- Add assigned_to column referencing family_members
alter table public.tasks
  add column if not exists assigned_to uuid
  references public.family_members (id) on delete set null;

-- Index for filtering tasks by assignee
create index if not exists tasks_assigned_to_idx
  on public.tasks (assigned_to);
