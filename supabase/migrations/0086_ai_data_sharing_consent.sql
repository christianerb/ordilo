-- 0086_ai_data_sharing_consent.sql
--
-- Apple App Review 5.1.2(i): before personal data leaves Ordilo for a
-- third-party AI service (OpenAI for analysis, chat and voice; Datalab for
-- OCR), the user must have explicitly agreed. This table is the durable,
-- server-checked record of that decision — one row per user, written only
-- by the user themselves (RLS), read by every API route and background job
-- that would otherwise call OpenAI or Datalab.
--
-- A missing row means "not asked yet": AI routes refuse with
-- AI_CONSENT_REQUIRED and the clients show the consent sheet. Withdrawing
-- sets the row to 'declined'; already-processed documents keep their
-- results, but nothing new is transmitted.

create table if not exists public.user_consents (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  ai_data_sharing    text not null check (ai_data_sharing in ('granted', 'declined')),
  ai_data_sharing_at timestamptz not null default now()
);

comment on table public.user_consents is
  'Per-user privacy decisions. ai_data_sharing records the explicit choice about transmitting content to third-party AI processors (OpenAI, Datalab).';

alter table public.user_consents enable row level security;
alter table public.user_consents force row level security;

drop policy if exists "user_consents_select" on public.user_consents;
create policy "user_consents_select" on public.user_consents
  for select using (user_id = auth.uid());

drop policy if exists "user_consents_insert" on public.user_consents;
create policy "user_consents_insert" on public.user_consents
  for insert with check (user_id = auth.uid());

drop policy if exists "user_consents_update" on public.user_consents;
create policy "user_consents_update" on public.user_consents
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No delete policy on purpose: a recorded decision is only ever replaced,
-- never silently removed. Account deletion cascades the row away.
