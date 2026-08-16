-- When a task was actually finished.
--
-- `tasks` records *that* something is done but never *when*, and the
-- Aufgaben list paid for it twice:
--
--   1. The "Erledigt" section had nothing sensible to sort by, so it fell
--      back to the due date — putting the chore that was due longest ago on
--      top of the list people scan for what they just ticked off.
--   2. It could not be bounded. Every task the family has ever completed
--      loaded with the page and sat in that section, so a household nine
--      months in carries hundreds of rows nobody wants to see.
--
-- With `completed_at` the list orders by completion and loads only the last
-- week of it; everything older stays in the database, out of the way.
--
-- Backfill: existing done tasks keep `completed_at = null` on purpose. The
-- honest value is unknown — `created_at` is when the task appeared, not when
-- somebody finished it — and inventing a timestamp would put fabricated
-- history into the one column meant to be trustworthy. A null reads as
-- "completed some time ago" and is simply not shown, which is exactly where
-- those rows belong.
--
-- Idempotent: `add column if not exists`.

alter table public.tasks
  add column if not exists completed_at timestamptz;

comment on column public.tasks.completed_at is
  'When the task was marked done. Set on the transition to status = done '
  'and cleared when it is reopened. Null for tasks completed before this '
  'column existed — deliberately not backfilled, because the real '
  'completion time is unknown.';

-- The Aufgaben page asks for "this family''s open tasks, plus what was
-- completed recently", ordered by completion. Without this index that is a
-- filtered sort over every task the family ever had.
create index if not exists tasks_family_completed_at_idx
  on public.tasks (family_id, completed_at desc);
