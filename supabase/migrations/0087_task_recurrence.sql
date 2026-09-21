-- Recurring tasks ("Müll rausbringen, jeden Dienstag").
--
-- Calendar events have had recurrence since 0044/0045; tasks get the same
-- vocabulary now. One open row carries the series, and finishing it
-- materializes the next instance as a new row. The finished row keeps its
-- place in "Erledigt" — history, not a single row whose due date keeps
-- sliding. That was the backlog's open product question, decided in favor
-- of completed_at and the done window.
--
-- Like 0063 (completed_at) the spawn lives in a trigger, not in the
-- clients: tasks are completed from the native app, the web app and the AI
-- chat tools, and "every writer remembers to spawn the next instance" is
-- the kind of rule that holds until the next writer is written.
--
-- There is deliberately no recurrence_exceptions column: exceptions exist
-- to skip a *virtual* occurrence. Instances here are materialized one at a
-- time, so "skip this one" is simply discarding the row — nothing to
-- record.
--
-- Idempotent: add column if not exists, drop constraint/function/trigger
-- before recreating.

alter table public.tasks
  add column if not exists recurrence text not null default 'none',
  add column if not exists recurrence_until date;

alter table public.tasks drop constraint if exists tasks_recurrence_check;
alter table public.tasks
  add constraint tasks_recurrence_check
  check (recurrence in ('none', 'weekly', 'biweekly', 'monthly', 'yearly'));

alter table public.tasks drop constraint if exists tasks_recurrence_until_check;
alter table public.tasks
  add constraint tasks_recurrence_until_check
  check (recurrence_until is null or recurrence <> 'none');

comment on column public.tasks.recurrence is
  'Rhythm of the series this open row carries: none | weekly | biweekly | monthly | yearly. Finishing the row materializes the next instance.';
comment on column public.tasks.recurrence_until is
  'Last day a new instance may be due; null repeats without an end.';

/**
 * The next due date of a series after `due`, strictly later than `today`.
 *
 * Stepping from the previous due date (not from today) keeps the rhythm's
 * weekday and quietly skips occurrences that are already past, so a task
 * finished three weeks late does not respawn in the past. Month and year
 * steps clamp to the last valid day (the 31st becomes Feb 28) and the
 * chain anchors on that clamped date from then on.
 *
 * Returns null when the series ends: no rhythm, no anchor date, an `until`
 * the next occurrence would overshoot, or a rhythm name outside the check
 * constraint (the guard also caps the catch-up loop for corrupt input).
 */
create or replace function public.task_next_recurrence(
  due date,
  recurrence text,
  today date,
  until date default null
)
returns date
language plpgsql
immutable
as $$
declare
  step interval;
  candidate date;
  guard int := 0;
begin
  if due is null or today is null or recurrence is null or recurrence = 'none' then
    return null;
  end if;

  step := case recurrence
    when 'weekly' then interval '7 days'
    when 'biweekly' then interval '14 days'
    when 'monthly' then interval '1 month'
    when 'yearly' then interval '1 year'
    else null
  end;
  if step is null then
    return null;
  end if;

  candidate := (due + step)::date;
  while candidate <= today loop
    guard := guard + 1;
    if guard > 200 then
      return null;
    end if;
    candidate := (candidate + step)::date;
  end loop;

  if until is not null and candidate > until then
    return null;
  end if;
  return candidate;
end;
$$;

comment on function public.task_next_recurrence(date, text, date, date) is
  'Next due date of a recurring task: one rhythm step after the given due '
  'date, advanced past today, bounded by the series end. Null ends the series.';

/**
 * Materialize the next instance when a recurring task becomes done.
 *
 * Any transition into 'done' counts — app, web, undo-redo, chat tool. The
 * exists-guard keeps the spawn single: an undo followed by redo (or two
 * family members ticking the same row) finds the continuation it already
 * made instead of piling up twins. An undo that reopens a finished row
 * never deletes the spawned future instance; it is a row of its own and
 * can be discarded like any other.
 */
create or replace function public.tasks_spawn_recurrence()
returns trigger
language plpgsql
as $$
declare
  next_due date;
begin
  if new.status <> 'done'
     or old.status = 'done'
     or new.recurrence = 'none'
     or new.due_date is null then
    return null;
  end if;

  next_due := public.task_next_recurrence(
    new.due_date,
    new.recurrence,
    current_date,
    new.recurrence_until
  );
  if next_due is null then
    return null;
  end if;

  if exists (
    select 1 from public.tasks
    where family_id = new.family_id
      and id <> new.id
      and title = new.title
      and status = 'open'
      and recurrence = new.recurrence
      and due_date = next_due
  ) then
    return null;
  end if;

  insert into public.tasks (
    family_id, document_id, title, description, due_date,
    status, confidence, confirmed, tags, assigned_to,
    recurrence, recurrence_until
  ) values (
    new.family_id, new.document_id, new.title, new.description, next_due,
    'open', new.confidence, new.confirmed, new.tags, new.assigned_to,
    new.recurrence, new.recurrence_until
  );

  return null;
end;
$$;

comment on function public.tasks_spawn_recurrence() is
  'After a recurring task becomes done, inserts the next instance as an '
  'open row carrying the same series. Guarded against double spawns.';

drop trigger if exists tasks_spawn_recurrence on public.tasks;

create trigger tasks_spawn_recurrence
  after update of status on public.tasks
  for each row
  execute function public.tasks_spawn_recurrence();
