-- The database owns `completed_at`.
--
-- 0061 added the column and the app filled it in on the paths the Aufgaben
-- list uses. That was one writer short: the chat tools (`mark_task_done`,
-- `update_task` in `src/lib/ai/tools.ts`) write `status` straight to the
-- table. A task completed by voice or chat therefore got `status = 'done'`
-- with `completed_at` still null — and the page's new predicate
-- (`status.neq.done` OR `completed_at.gte.<cutoff>`) is false on both sides
-- for exactly that row, so the chat would report success while the task
-- disappeared from the list entirely.
--
-- Keeping every writer in line by hand is the kind of rule that holds until
-- the next one is written. A trigger makes the invariant structural: no
-- statement, from any client, can move `status` and leave `completed_at`
-- behind.
--
-- Rules:
--   * becomes done      → stamp now(), unless the statement supplied its own
--                         value (an undo restoring the moment the task was
--                         actually finished)
--   * stops being done  → clear the stamp, so a reopened or dismissed task
--                         carries no completion time
--   * stays as it was   → leave it alone, so editing the title of a finished
--                         task does not re-date it
--
-- Because the trigger only fills in a blank, the app can still restore an
-- exact earlier timestamp by passing it explicitly. What it no longer has to
-- do is guess with a browser clock: a device set to the wrong date would
-- otherwise write a completion time outside the visible window and hide the
-- task it just completed.
--
-- Idempotent: `create or replace function`, `drop trigger if exists`.

create or replace function public.tasks_set_completed_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'done' then
      new.completed_at := coalesce(new.completed_at, now());
    else
      new.completed_at := null;
    end if;
    return new;
  end if;

  if new.status = 'done' and old.status is distinct from 'done' then
    -- Only fill in a blank. A statement that carries its own timestamp is
    -- restoring a known one; `= old.completed_at` catches the common case of
    -- an update that simply does not mention the column.
    if new.completed_at is null or new.completed_at = old.completed_at then
      new.completed_at := now();
    end if;
  elsif new.status is distinct from 'done' and old.status = 'done' then
    new.completed_at := null;
  end if;

  return new;
end;
$$;

comment on function public.tasks_set_completed_at is
  'Keeps tasks.completed_at in step with tasks.status for every writer. '
  'Stamps on the transition to done unless the statement supplies its own '
  'timestamp, and clears it when a task stops being done.';

drop trigger if exists tasks_set_completed_at on public.tasks;

create trigger tasks_set_completed_at
  before insert or update of status, completed_at on public.tasks
  for each row
  execute function public.tasks_set_completed_at();
