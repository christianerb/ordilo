-- Familienplaner upgrades: location and a responsible member per event, a
-- 14-day recurrence rhythm, a source-document link, suggestion dismissals
-- for document-extracted dates, and per-family ICS feed tokens.

-- 1. New event fields ------------------------------------------------------

alter table public.calendar_events
  add column if not exists location text,
  add column if not exists responsible_member_id uuid
    references public.family_members (id) on delete set null,
  add column if not exists document_id uuid
    references public.documents (id) on delete set null;

alter table public.calendar_events
  drop constraint if exists calendar_events_location_length_check;
alter table public.calendar_events
  add constraint calendar_events_location_length_check
  check (location is null or char_length(location) <= 200);

create index if not exists calendar_events_responsible_idx
  on public.calendar_events (responsible_member_id);
create index if not exists calendar_events_document_idx
  on public.calendar_events (document_id);

-- 2. 14-day rhythm ---------------------------------------------------------

alter table public.calendar_events
  drop constraint if exists calendar_events_recurrence_check;
alter table public.calendar_events
  add constraint calendar_events_recurrence_check
  check (recurrence in ('none', 'weekly', 'biweekly', 'monthly', 'yearly'));

-- 3. Suggestion dismissals -------------------------------------------------
--
-- Extracted date entities surface as planner suggestions. A row here means
-- the family already handled that entity (added it as an event or hid it),
-- so it never comes back.

create table if not exists public.calendar_suggestion_dismissals (
  family_id uuid references public.families (id) on delete cascade not null,
  entity_id uuid references public.extracted_entities (id) on delete cascade not null,
  created_at timestamptz not null default now(),
  primary key (family_id, entity_id)
);

alter table public.calendar_suggestion_dismissals enable row level security;
alter table public.calendar_suggestion_dismissals force row level security;

drop policy if exists "calendar_suggestion_dismissals_select" on public.calendar_suggestion_dismissals;
create policy "calendar_suggestion_dismissals_select" on public.calendar_suggestion_dismissals
  for select using (public.user_belongs_to_family(family_id));

drop policy if exists "calendar_suggestion_dismissals_insert" on public.calendar_suggestion_dismissals;
create policy "calendar_suggestion_dismissals_insert" on public.calendar_suggestion_dismissals
  for insert with check (public.user_belongs_to_family(family_id));

drop policy if exists "calendar_suggestion_dismissals_delete" on public.calendar_suggestion_dismissals;
create policy "calendar_suggestion_dismissals_delete" on public.calendar_suggestion_dismissals
  for delete using (public.user_belongs_to_family(family_id));

-- 4. ICS feed tokens -------------------------------------------------------
--
-- One secret token per family. The public ICS route resolves the token with
-- the service role; family members create and read it through RLS. The
-- token is a capability: anyone holding the URL can read the calendar, so
-- deleting the row rotates access.

create table if not exists public.calendar_feed_tokens (
  family_id uuid primary key references public.families (id) on delete cascade,
  token text unique not null
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

alter table public.calendar_feed_tokens enable row level security;
alter table public.calendar_feed_tokens force row level security;

drop policy if exists "calendar_feed_tokens_select" on public.calendar_feed_tokens;
create policy "calendar_feed_tokens_select" on public.calendar_feed_tokens
  for select using (public.user_belongs_to_family(family_id));

drop policy if exists "calendar_feed_tokens_insert" on public.calendar_feed_tokens;
create policy "calendar_feed_tokens_insert" on public.calendar_feed_tokens
  for insert with check (public.user_belongs_to_family(family_id));

drop policy if exists "calendar_feed_tokens_delete" on public.calendar_feed_tokens;
create policy "calendar_feed_tokens_delete" on public.calendar_feed_tokens
  for delete using (public.user_belongs_to_family(family_id));
