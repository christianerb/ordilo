-- Standalone PostgreSQL integration test. Run only against a disposable DB:
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/task_recurrence.sql <connection>
--
-- Covers 0087_task_recurrence.sql: the pure next-date function and the
-- spawn trigger that materializes the next instance when a recurring task
-- becomes done — from any writer, including the chat tools.
\set ON_ERROR_STOP on
begin;

-- Minimal schema surface the migration touches.
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  document_id uuid,
  title text not null,
  description text,
  due_date date,
  status text not null default 'open',
  confidence double precision not null default 0.0,
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  tags text[] not null default '{}',
  assigned_to uuid,
  completed_at timestamptz
);

-- Idempotent: applying the migration twice must not fail.
\ir ../migrations/0087_task_recurrence.sql
\ir ../migrations/0087_task_recurrence.sql

-- ---------------------------------------------------------------------------
-- task_next_recurrence: the pure date arithmetic
-- ---------------------------------------------------------------------------

do $$
begin
  -- Weekly steps from the due date, never from today.
  assert public.task_next_recurrence(date '2026-09-21', 'weekly', date '2026-09-21') = date '2026-09-28',
    'weekly: one step ahead';
  -- A task finished three weeks late skips the occurrences already past.
  assert public.task_next_recurrence(date '2026-08-31', 'weekly', date '2026-09-21') = date '2026-09-28',
    'weekly: catch-up stays on the rhythm''s weekday';
  assert public.task_next_recurrence(date '2026-09-21', 'biweekly', date '2026-09-21') = date '2026-10-05',
    'biweekly: fourteen days';
  -- Month overflow clamps to the last valid day, and the chain anchors on
  -- the clamped date (Feb 28 steps to Mar 28, not back to the 31st).
  assert public.task_next_recurrence(date '2026-01-31', 'monthly', date '2026-01-31') = date '2026-02-28',
    'monthly: clamps to February''s last day';
  assert public.task_next_recurrence(date '2026-02-28', 'monthly', date '2026-02-28') = date '2026-03-28',
    'monthly: chain anchors on the clamped date';
  -- Leap day clamps the same way.
  assert public.task_next_recurrence(date '2024-02-29', 'yearly', date '2024-02-29') = date '2025-02-28',
    'yearly: leap day clamps';
  -- The series end: the next occurrence past `until` never materializes.
  assert public.task_next_recurrence(date '2026-09-21', 'weekly', date '2026-09-21', date '2026-09-25') is null,
    'until: occurrence beyond the end stops the series';
  assert public.task_next_recurrence(date '2026-09-21', 'weekly', date '2026-09-21', date '2026-09-28') = date '2026-09-28',
    'until: occurrence exactly on the end still spawns';
  -- No rhythm, no anchor, no sense: no date.
  assert public.task_next_recurrence(date '2026-09-21', 'none', date '2026-09-21') is null,
    'none: no next occurrence';
  assert public.task_next_recurrence(null, 'weekly', date '2026-09-21') is null,
    'null due date: no next occurrence';
  assert public.task_next_recurrence(date '2026-09-21', 'fortnightly-ish', date '2026-09-21') is null,
    'unknown rhythm: no next occurrence';
end $$;

-- ---------------------------------------------------------------------------
-- tasks_spawn_recurrence: the trigger
-- ---------------------------------------------------------------------------

do $$
declare
  fam uuid := '10000000-0000-0000-0000-000000000001';
  member uuid := '20000000-0000-0000-0000-000000000001';
  source uuid;
  spawned record;
  spawned_count int;
begin
  -- A weekly task due yesterday spawns exactly one continuation six days
  -- out, carrying title, note, assignee, tags and the series itself.
  insert into public.tasks (
    family_id, title, description, due_date, status,
    confidence, confirmed, tags, assigned_to, recurrence
  ) values (
    fam, 'Müll rausbringen', 'Gelber Sack nicht vergessen',
    current_date - 1, 'open', 1.0, true, array['haushalt'], member, 'weekly'
  ) returning id into source;

  -- Any writer counts: this bare status update is what the chat tools do.
  update public.tasks set status = 'done' where id = source;

  select count(*) into spawned_count
  from public.tasks
  where family_id = fam and id <> source and status = 'open';
  assert spawned_count = 1, 'completion spawns exactly one next instance';

  select * into spawned
  from public.tasks
  where family_id = fam and id <> source and status = 'open';
  assert spawned.due_date = current_date + 6,
    'spawned instance lands on the next future occurrence';
  assert spawned.title = 'Müll rausbringen'
     and spawned.description = 'Gelber Sack nicht vergessen'
     and spawned.assigned_to = member
     and spawned.tags = array['haushalt']
     and spawned.recurrence = 'weekly'
     and spawned.confirmed
     and spawned.completed_at is null
     and spawned.recurrence_parent_id = source,
    'spawned instance carries the series, its context and its lineage';

  -- Undo and redo must not pile up a twin: the guard finds the existing
  -- continuation and stays quiet.
  update public.tasks set status = 'open' where id = source;
  update public.tasks set status = 'done' where id = source;
  select count(*) into spawned_count
  from public.tasks
  where family_id = fam and id <> source and status = 'open';
  assert spawned_count = 1, 'undo and redo do not spawn a twin';
end $$;

do $$
declare
  fam uuid := '10000000-0000-0000-0000-000000000003';
  first uuid;
  second uuid;
  open_count int;
begin
  -- Two independent series may share title, rhythm and due date ("Müll
  -- rausbringen" for two people). Deduplication keys on lineage, so each
  -- completion must still spawn its own continuation.
  insert into public.tasks (family_id, title, due_date, recurrence)
  values (fam, 'Müll rausbringen', current_date - 1, 'weekly')
  returning id into first;
  insert into public.tasks (family_id, title, due_date, recurrence)
  values (fam, 'Müll rausbringen', current_date - 1, 'weekly')
  returning id into second;

  update public.tasks set status = 'done' where id = first;
  update public.tasks set status = 'done' where id = second;

  select count(*) into open_count
  from public.tasks where family_id = fam and status = 'open';
  assert open_count = 2,
    'lookalike series each spawn their own continuation';
end $$;

do $$
declare
  fam uuid := '10000000-0000-0000-0000-000000000004';
  source uuid;
  child uuid;
  open_count int;
begin
  -- Discarding the spawned instance means "skip this one". An undo/redo
  -- of the source afterwards is a fresh statement and may spawn again.
  insert into public.tasks (family_id, title, due_date, recurrence)
  values (fam, 'Müll rausbringen', current_date - 1, 'weekly')
  returning id into source;
  update public.tasks set status = 'done' where id = source;

  select id into child from public.tasks
  where recurrence_parent_id = source;
  update public.tasks set status = 'dismissed' where id = child;

  update public.tasks set status = 'open' where id = source;
  update public.tasks set status = 'done' where id = source;

  select count(*) into open_count
  from public.tasks where family_id = fam and status = 'open';
  assert open_count = 1,
    'redo after discarding the spawned instance spawns a fresh one';
end $$;

do $$
declare
  fam uuid := '10000000-0000-0000-0000-000000000002';
  ended uuid;
  plain uuid;
  undated uuid;
  done_row uuid;
  spawned_count int;
begin
  -- A series past its end spawns nothing.
  insert into public.tasks (family_id, title, due_date, recurrence, recurrence_until)
  values (fam, 'Ended series', current_date - 1, 'weekly', current_date + 3)
  returning id into ended;
  update public.tasks set status = 'done' where id = ended;

  -- A one-off task spawns nothing.
  insert into public.tasks (family_id, title, due_date)
  values (fam, 'One-off', current_date - 1)
  returning id into plain;
  update public.tasks set status = 'done' where id = plain;

  -- A rhythm without an anchor date spawns nothing.
  insert into public.tasks (family_id, title, recurrence)
  values (fam, 'Undated series', 'weekly')
  returning id into undated;
  update public.tasks set status = 'done' where id = undated;

  select count(*) into spawned_count
  from public.tasks where family_id = fam and status = 'open';
  assert spawned_count = 0, 'ended, one-off and undated rows spawn nothing';

  -- Editing a finished row does not re-fire the spawn (the trigger only
  -- watches the status column).
  select id into done_row from public.tasks
  where family_id = fam and title = 'One-off';
  update public.tasks set title = 'One-off (renamed)' where id = done_row;
  select count(*) into spawned_count
  from public.tasks where family_id = fam and status = 'open';
  assert spawned_count = 0, 'editing a finished row spawns nothing';
end $$;

rollback;
