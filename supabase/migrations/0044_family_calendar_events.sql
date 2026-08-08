-- Shared, manually maintained calendar entries for a family planner.
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families (id) on delete cascade not null,
  title text not null check (char_length(trim(title)) between 1 and 160),
  note text,
  starts_on date not null,
  ends_on date not null,
  all_day boolean not null default true,
  starts_time time,
  ends_time time,
  recurrence text not null default 'none'
    check (recurrence in ('none', 'weekly', 'monthly', 'yearly')),
  recurrence_until date,
  recurrence_exceptions date[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint calendar_events_date_range_check check (ends_on >= starts_on),
  constraint calendar_events_time_check check (
    (all_day and starts_time is null and ends_time is null)
    or
    (not all_day and starts_time is not null and ends_time is not null)
  ),
  constraint calendar_events_recurrence_until_check check (
    recurrence_until is null or recurrence <> 'none'
  )
);

create index if not exists calendar_events_family_dates_idx
  on public.calendar_events (family_id, starts_on, ends_on);

create table if not exists public.calendar_event_attendees (
  event_id uuid references public.calendar_events (id) on delete cascade not null,
  family_member_id uuid references public.family_members (id) on delete cascade not null,
  created_at timestamptz not null default now(),
  primary key (event_id, family_member_id)
);

create index if not exists calendar_event_attendees_member_idx
  on public.calendar_event_attendees (family_member_id);

alter table public.calendar_events enable row level security;
alter table public.calendar_events force row level security;
alter table public.calendar_event_attendees enable row level security;
alter table public.calendar_event_attendees force row level security;

drop policy if exists "calendar_events_select" on public.calendar_events;
create policy "calendar_events_select" on public.calendar_events
  for select using (public.user_belongs_to_family(family_id));

drop policy if exists "calendar_events_insert" on public.calendar_events;
create policy "calendar_events_insert" on public.calendar_events
  for insert with check (public.user_belongs_to_family(family_id));

drop policy if exists "calendar_events_update" on public.calendar_events;
create policy "calendar_events_update" on public.calendar_events
  for update using (public.user_belongs_to_family(family_id))
  with check (public.user_belongs_to_family(family_id));

drop policy if exists "calendar_events_delete" on public.calendar_events;
create policy "calendar_events_delete" on public.calendar_events
  for delete using (public.user_belongs_to_family(family_id));

drop policy if exists "calendar_event_attendees_select" on public.calendar_event_attendees;
create policy "calendar_event_attendees_select" on public.calendar_event_attendees
  for select using (
    exists (
      select 1
      from public.calendar_events
      where calendar_events.id = calendar_event_attendees.event_id
        and public.user_belongs_to_family(calendar_events.family_id)
    )
  );

drop policy if exists "calendar_event_attendees_insert" on public.calendar_event_attendees;
create policy "calendar_event_attendees_insert" on public.calendar_event_attendees
  for insert with check (
    exists (
      select 1
      from public.calendar_events
      where calendar_events.id = calendar_event_attendees.event_id
        and public.user_belongs_to_family(calendar_events.family_id)
    )
  );

drop policy if exists "calendar_event_attendees_delete" on public.calendar_event_attendees;
create policy "calendar_event_attendees_delete" on public.calendar_event_attendees
  for delete using (
    exists (
      select 1
      from public.calendar_events
      where calendar_events.id = calendar_event_attendees.event_id
        and public.user_belongs_to_family(calendar_events.family_id)
    )
  );
