-- Keep voice transcription separate from chat_usage. A recording produces
-- editable draft text, so it is not itself a chat message and must not
-- consume the chat budget a second time.

create table if not exists public.voice_transcription_usage (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid references public.families (id) on delete cascade not null,
  usage_date          date not null default current_date,
  transcription_count int not null default 0 check (transcription_count >= 0),
  unique (family_id, usage_date)
);

create index if not exists voice_transcription_usage_family_date_idx
  on public.voice_transcription_usage (family_id, usage_date);

alter table public.voice_transcription_usage enable row level security;
alter table public.voice_transcription_usage force row level security;

drop policy if exists "voice_transcription_usage_select"
  on public.voice_transcription_usage;
create policy "voice_transcription_usage_select"
  on public.voice_transcription_usage
  for select using (public.user_belongs_to_family(family_id));

drop policy if exists "voice_transcription_usage_insert"
  on public.voice_transcription_usage;
create policy "voice_transcription_usage_insert"
  on public.voice_transcription_usage
  for insert with check (public.user_belongs_to_family(family_id));

drop policy if exists "voice_transcription_usage_update"
  on public.voice_transcription_usage;
create policy "voice_transcription_usage_update"
  on public.voice_transcription_usage
  for update using (public.user_belongs_to_family(family_id))
  with check (public.user_belongs_to_family(family_id));
