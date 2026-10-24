-- 0094_growth_tracking_events.sql
--
-- Growth tracking: invites and daily app opens become product events.
--
-- * invite_created / invite_accepted are recorded by triggers, so every
--   path (web, native app, family merge) is covered without each client
--   having to remember an analytics call. Invited members always get the
--   role 'adult' or 'viewer'; the creator's own membership is 'owner' and
--   is not an accepted invite.
-- * app_opened is written through record_app_open(). A partial unique
--   index keeps it to one row per user and German calendar day, so
--   concurrent tabs or app foregrounds cannot double-count a visit.
-- * Clients can no longer insert these three events directly; the insert
--   policy excludes them, so only the database can write them.
-- * admin_growth_event_days() and admin_forwarding_family_count() let the
--   admin dashboard aggregate in SQL instead of paging through every row.
--
-- Events stay content-free: ids, the invite role and the platform only
-- (the platform comes from the x-ordilo-platform request header).
-- Idempotent: constraint, index, functions and triggers are replaced.

alter table public.product_events
  drop constraint if exists product_events_event_name_check;

alter table public.product_events
  add constraint product_events_event_name_check check (event_name in (
    'onboarding_started',
    'onboarding_step_completed',
    'onboarding_completed',
    'onboarding_scan_started',
    'onboarding_entry_selected',
    'document_upload_succeeded',
    'document_upload_failed',
    'document_result_viewed',
    'document_confirmed',
    'document_next_step_selected',
    'search_completed',
    'chat_question_sent',
    'chat_answer_repair_started',
    'task_created',
    'task_completed',
    'calendar_event_created',
    'live_conversation_ended',
    'invite_created',
    'invite_accepted',
    'app_opened'
  ));

-- Coarse client platform from the x-ordilo-platform request header that
-- the native app and the web server client send (PostgREST exposes request
-- headers to SQL). Anything else is 'unknown'.
create or replace function public.request_product_platform()
returns text
language sql
stable
set search_path = public
as $$
  select case
    when platform in ('web', 'ios', 'android') then platform
    else 'unknown'
  end
  from (
    select nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-ordilo-platform' as platform
  ) as request;
$$;

create or replace function public.record_invite_created_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.product_events (user_id, family_id, event_name, properties)
    values (
      new.created_by,
      new.family_id,
      'invite_created',
      jsonb_build_object('role', new.role, 'platform', public.request_product_platform())
    );
  end if;
  return new;
exception when others then
  -- Analytics must never block creating or accepting an invite.
  return new;
end;
$$;

drop trigger if exists family_invites_record_created_event on public.family_invites;
create trigger family_invites_record_created_event
  after insert on public.family_invites
  for each row execute function public.record_invite_created_event();

create or replace function public.record_invite_accepted_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role <> 'owner' then
    insert into public.product_events (user_id, family_id, event_name, properties)
    values (
      new.user_id,
      new.family_id,
      'invite_accepted',
      jsonb_build_object('role', new.role, 'platform', public.request_product_platform())
    );
  end if;
  return new;
exception when others then
  -- Analytics must never block creating or accepting an invite.
  return new;
end;
$$;

drop trigger if exists family_memberships_record_invite_accepted_event on public.family_memberships;
create trigger family_memberships_record_invite_accepted_event
  after insert on public.family_memberships
  for each row execute function public.record_invite_accepted_event();

-- Trigger functions are not meant to be called directly.
revoke execute on function public.record_invite_created_event() from public, anon, authenticated;
revoke execute on function public.record_invite_accepted_event() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- app_opened: one row per user and German calendar day
-- ---------------------------------------------------------------------------

-- Keep the first app_opened per user and day before the unique index, so
-- the index can always be built (e.g. on a database that saw app_opened
-- inserted directly). A no-op when there are no duplicates.
delete from public.product_events e
using public.product_events earlier
where e.event_name = 'app_opened'
  and earlier.event_name = 'app_opened'
  and earlier.user_id = e.user_id
  and (earlier.occurred_at at time zone 'Europe/Berlin')::date
    = (e.occurred_at at time zone 'Europe/Berlin')::date
  and (earlier.occurred_at, earlier.id) < (e.occurred_at, e.id);

create unique index if not exists product_events_app_opened_daily_idx
  on public.product_events (
    user_id,
    ((occurred_at at time zone 'Europe/Berlin')::date)
  )
  where event_name = 'app_opened';

-- Returns true when today's open is recorded (now or earlier today), false
-- when the caller does not count yet: no session, or only an own family
-- whose setup is unfinished — reopening onboarding is not "coming back".
-- Invited members are set up the moment they join, whatever the owner's
-- setup state (the same rule both clients use).
drop function if exists public.record_app_open(uuid, text);
create function public.record_app_open(
  p_family_id uuid default null,
  p_platform text default 'unknown'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.family_memberships m
    join public.families f on f.id = m.family_id
    where m.user_id = v_user_id
      and (f.onboarding_completed_at is not null or m.role <> 'owner')
  ) then
    return false;
  end if;

  insert into public.product_events (user_id, family_id, event_name, properties)
  values (
    v_user_id,
    -- Same rule as the insert policy: only a family the user belongs to.
    case
      when p_family_id is not null and public.user_belongs_to_family(p_family_id)
        then p_family_id
    end,
    'app_opened',
    jsonb_build_object(
      'platform',
      case when p_platform in ('web', 'ios', 'android') then p_platform else 'unknown' end
    )
  )
  on conflict do nothing;
  return true;
end;
$$;

revoke execute on function public.record_app_open(uuid, text) from public, anon;
grant execute on function public.record_app_open(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: families that ever forwarded an email (with or without attachment)
-- ---------------------------------------------------------------------------

create or replace function public.admin_forwarding_family_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*) from (
    select family_id from public.documents where source = 'email'
    union
    select family_id from public.inbound_emails
  ) as forwarding_families;
$$;

revoke execute on function public.admin_forwarding_family_count() from public, anon, authenticated;
grant execute on function public.admin_forwarding_family_count() to service_role;

-- ---------------------------------------------------------------------------
-- Database-written events cannot be inserted by clients
-- ---------------------------------------------------------------------------
-- Same policy as 0047 plus the exclusion. Triggers and record_app_open run
-- as the table owner and are not subject to it.

drop policy if exists "product_events_insert_own" on public.product_events;
create policy "product_events_insert_own" on public.product_events
  for insert with check (
    auth.uid() = user_id
    and event_name not in ('invite_created', 'invite_accepted', 'app_opened')
    and (
      family_id is null
      or public.user_belongs_to_family(family_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Admin: events per user, event and German calendar day
-- ---------------------------------------------------------------------------
-- One row per (user, event, Berlin day) with the first and last time and
-- the count. That is exact for every "did X happen between A and B" check
-- the growth metrics make (their windows are at least a day long), at a
-- fraction of the rows.

-- Returned as one JSON array so the dashboard reads it in a single call:
-- paging a SECURITY DEFINER set-returning function would rerun the whole
-- aggregation for every page.
drop function if exists public.admin_growth_event_days(timestamptz, text[]);
create function public.admin_growth_event_days(
  p_since timestamptz,
  p_event_names text[]
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(day_rows), '[]'::jsonb)
  from (
    select
      e.user_id,
      e.event_name,
      min(e.occurred_at) as first_at,
      max(e.occurred_at) as last_at,
      count(*) as event_count
    from public.product_events e
    where e.occurred_at >= p_since
      and e.event_name = any(p_event_names)
    group by e.user_id, e.event_name, (e.occurred_at at time zone 'Europe/Berlin')::date
  ) as day_rows;
$$;

revoke execute on function public.admin_growth_event_days(timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.admin_growth_event_days(timestamptz, text[]) to service_role;

-- ---------------------------------------------------------------------------
-- Admin: when app opens were first recorded
-- ---------------------------------------------------------------------------
-- Return windows before this point cannot be judged (someone who only
-- opened the app left no trace), so the dashboard leaves them open.

-- Lets min(occurred_at) for app_opened read one index entry.
create index if not exists product_events_app_opened_occurred_idx
  on public.product_events (occurred_at)
  where event_name = 'app_opened';

create or replace function public.admin_app_opens_tracked_since()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select min(occurred_at) from public.product_events where event_name = 'app_opened';
$$;

revoke execute on function public.admin_app_opens_tracked_since() from public, anon, authenticated;
grant execute on function public.admin_app_opens_tracked_since() to service_role;
