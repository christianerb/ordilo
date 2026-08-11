-- 0047_product_events.sql
--
-- Minimal first-party product analytics. Events intentionally contain no
-- document data, filenames, names, email addresses, or other user content.

create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade not null,
  family_id uuid references public.families (id) on delete set null,
  event_name text not null check (event_name in (
    'onboarding_started',
    'onboarding_step_completed',
    'onboarding_completed',
    'onboarding_scan_started',
    'document_upload_succeeded',
    'document_confirmed'
  )),
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists product_events_user_event_idx
  on public.product_events (user_id, event_name, occurred_at desc);
create index if not exists product_events_family_event_idx
  on public.product_events (family_id, event_name, occurred_at desc);

alter table public.product_events enable row level security;

drop policy if exists "product_events_insert_own" on public.product_events;
create policy "product_events_insert_own" on public.product_events
  for insert with check (auth.uid() = user_id);

drop policy if exists "product_events_select_own" on public.product_events;
create policy "product_events_select_own" on public.product_events
  for select using (auth.uid() = user_id);
