-- Publish tasks on Realtime, so the Aufgaben list is one list.
--
-- The Aufgaben view subscribes to `postgres_changes` on `public.tasks` to
-- keep two phones in step: a task Karina ticks off has to stop being open
-- on Christian's screen. Subscribing is not enough — a table only emits
-- change events once it is part of the `supabase_realtime` publication, and
-- `tasks` never was. Without this the subscription attaches happily and
-- silently receives nothing, which is the worst shape a bug can take: the
-- feature looks wired up and simply does not happen.
--
-- Same pattern as 0033 (documents) and 0046 (calendar_events): INSERT and
-- UPDATE events are consumed by the client (deletes stay optimistic and
-- local), default replica identity is sufficient because the client only
-- reads the change as a signal to refetch, and RLS scopes the events to the
-- subscriber's own family.
--
-- Idempotent: guarded by a lookup in pg_publication_tables, because
-- `alter publication ... add table` errors on a table that is already a
-- member.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;
