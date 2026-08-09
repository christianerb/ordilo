-- Live family coordination for the planner: publish calendar_events on
-- Realtime, remember who created an event, and track per-user "seen"
-- state so a partner's new entries show up marked as new.

-- 1. Realtime ---------------------------------------------------------------
--
-- Same pattern as 0033 (documents): INSERT/UPDATE events are consumed by
-- the client (deletes stay optimistic/local), default replica identity is
-- sufficient, and RLS scopes events to the subscriber's family.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'calendar_events'
  ) then
    alter publication supabase_realtime add table public.calendar_events;
  end if;
end $$;

-- 2. Who created an event ----------------------------------------------------
--
-- auth.uid() as the default means every RLS-scoped insert (form, voice,
-- chat tool) records its author with no code changes. Rows written before
-- this migration keep NULL and are simply never marked as new.

alter table public.calendar_events
  add column if not exists created_by uuid
    references auth.users (id) on delete set null
    default auth.uid();

-- 3. Seen state ---------------------------------------------------------------
--
-- One row per (event, user): "this user has seen this event". Events
-- created by someone else without a seen row render with a "Neu" marker.

create table if not exists public.calendar_event_seen (
  event_id uuid references public.calendar_events (id) on delete cascade not null,
  user_id uuid references auth.users (id) on delete cascade not null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.calendar_event_seen enable row level security;
alter table public.calendar_event_seen force row level security;

-- Users only ever read and write their own seen state, and only for
-- events of a family they belong to.
drop policy if exists "calendar_event_seen_select" on public.calendar_event_seen;
create policy "calendar_event_seen_select" on public.calendar_event_seen
  for select using (user_id = auth.uid());

drop policy if exists "calendar_event_seen_insert" on public.calendar_event_seen;
create policy "calendar_event_seen_insert" on public.calendar_event_seen
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.calendar_events
      where calendar_events.id = calendar_event_seen.event_id
        and public.user_belongs_to_family(calendar_events.family_id)
    )
  );

drop policy if exists "calendar_event_seen_delete" on public.calendar_event_seen;
create policy "calendar_event_seen_delete" on public.calendar_event_seen
  for delete using (user_id = auth.uid());
