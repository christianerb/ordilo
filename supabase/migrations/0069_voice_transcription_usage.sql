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

-- No authenticated-client policies: exposing write access would let a
-- modified mobile client reset its own counter. API routes use the
-- service-role-only RPCs below after checking family membership.

create or replace function public.reserve_voice_transcription(
  p_family_id uuid,
  p_limit integer
)
returns table (allowed boolean, used integer, remaining integer, usage_date date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  insert into public.voice_transcription_usage (
    family_id,
    usage_date,
    transcription_count
  )
  values (p_family_id, current_date, 1)
  on conflict (family_id, usage_date) do update
    set transcription_count =
      public.voice_transcription_usage.transcription_count + 1
    where public.voice_transcription_usage.transcription_count < p_limit
  returning transcription_count into v_used;

  if found then
    return query select true, v_used, greatest(0, p_limit - v_used), current_date;
    return;
  end if;

  select transcription_count into v_used
  from public.voice_transcription_usage
  where family_id = p_family_id
    and usage_date = current_date;

  return query select false, coalesce(v_used, 0), 0, current_date;
end;
$$;

create or replace function public.release_voice_transcription(
  p_family_id uuid,
  p_usage_date date
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.voice_transcription_usage
  set transcription_count = greatest(0, transcription_count - 1)
  where family_id = p_family_id
    and usage_date = p_usage_date;
$$;

revoke all on function public.reserve_voice_transcription(uuid, integer) from public;
revoke all on function public.release_voice_transcription(uuid, date) from public;
grant execute on function public.reserve_voice_transcription(uuid, integer)
  to service_role;
grant execute on function public.release_voice_transcription(uuid, date)
  to service_role;
