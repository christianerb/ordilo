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

revoke execute on function public.request_product_platform() from public, anon, authenticated;

create or replace function public.record_invite_created_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Attribute the event to the creator only when that is who is signed in
  -- (or a server-side insert without a session): a client cannot write an
  -- invite_created event for someone else by setting created_by.
  if new.created_by is not null
     and (auth.uid() is null or auth.uid() = new.created_by) then
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
  -- Only the person joining (accept_family_invite runs as them) or a
  -- server-side insert without a session: an owner adding someone's
  -- membership directly is not that person accepting an invite.
  if new.role <> 'owner'
     and (auth.uid() is null or auth.uid() = new.user_id) then
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

-- When app opens were first recorded. Stored once, because deriving it
-- from product_events would move it forward whenever the earliest rows go
-- (account deletion cascades, the 12-month purge). No policies: only the
-- definer functions below read or write it.
create table if not exists public.analytics_markers (
  key text primary key,
  at timestamptz not null default now()
);
alter table public.analytics_markers enable row level security;

insert into public.analytics_markers (key, at)
select 'app_opened_since', min(occurred_at)
from public.product_events
where event_name = 'app_opened'
having min(occurred_at) is not null
on conflict (key) do nothing;

-- Returns the Berlin day (YYYY-MM-DD) whose open is recorded — now or
-- earlier that day — so a client can tell whether its own clock agrees;
-- null when the caller does not count yet: no session, or only an own family
-- whose setup is unfinished — reopening onboarding is not "coming back".
-- Invited members are set up the moment they join, whatever the owner's
-- setup state (the same rule both clients use).
drop function if exists public.record_app_open(uuid, text);
create function public.record_app_open(
  p_family_id uuid default null,
  p_platform text default 'unknown'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return null;
  end if;

  if not exists (
    select 1
    from public.family_memberships m
    join public.families f on f.id = m.family_id
    where m.user_id = v_user_id
      and (f.onboarding_completed_at is not null or m.role <> 'owner')
  ) then
    return null;
  end if;

  insert into public.product_events (user_id, family_id, event_name, properties)
  values (
    v_user_id,
    -- Same rule as the insert policy: only a family the user belongs to;
    -- without one (e.g. right after onboarding), their own set-up family.
    case
      when p_family_id is not null and public.user_belongs_to_family(p_family_id)
        then p_family_id
      else (
        select m.family_id
        from public.family_memberships m
        join public.families f on f.id = m.family_id
        where m.user_id = v_user_id
          and (f.onboarding_completed_at is not null or m.role <> 'owner')
        order by (m.role = 'owner') desc, m.created_at
        limit 1
      )
    end,
    'app_opened',
    jsonb_build_object(
      'platform',
      case when p_platform in ('web', 'ios', 'android') then p_platform else 'unknown' end
    )
  )
  on conflict do nothing;

  -- Set once; afterwards a cheap read instead of an insert attempt.
  if found and not exists (select 1 from public.analytics_markers where key = 'app_opened_since') then
    insert into public.analytics_markers (key) values ('app_opened_since')
    on conflict (key) do nothing;
  end if;
  return to_char((now() at time zone 'Europe/Berlin')::date, 'YYYY-MM-DD');
end;
$$;

revoke execute on function public.record_app_open(uuid, text) from public, anon;
grant execute on function public.record_app_open(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: families that ever forwarded an email (with or without attachment)
-- ---------------------------------------------------------------------------
-- The admin functions run as the caller (security invoker). Only the
-- service role may call them, and it bypasses RLS — whereas a definer
-- function runs as the owner, which FORCE RLS on documents (0031) would
-- limit to the families of auth.uid(), i.e. none.

create or replace function public.admin_forwarding_family_count()
returns bigint
language sql
stable
security invoker
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
-- paging a set-returning function through PostgREST would rerun the whole
-- aggregation for every page.
drop function if exists public.admin_growth_event_days(timestamptz, text[]);
create function public.admin_growth_event_days(
  p_since timestamptz,
  p_event_names text[]
)
returns jsonb
language sql
stable
security invoker
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
-- Read from analytics_markers, set by the first recorded app open.

create or replace function public.admin_app_opens_tracked_since()
returns timestamptz
language sql
stable
security invoker
set search_path = public
as $$
  select at from public.analytics_markers where key = 'app_opened_since';
$$;

revoke execute on function public.admin_app_opens_tracked_since() from public, anon, authenticated;
grant execute on function public.admin_app_opens_tracked_since() to service_role;

-- ---------------------------------------------------------------------------
-- First touch, stored where the user cannot change it
-- ---------------------------------------------------------------------------
-- The login form sends signup_attribution as user metadata on the request
-- that creates the account. User metadata stays editable by its owner
-- (auth.updateUser), so it is copied into a table only the service role
-- reads — following it until the code is confirmed, then frozen. No
-- policies.

create table if not exists public.signup_attributions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  attribution jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.signup_attributions enable row level security;

-- Client-sent metadata is untrusted: keep only the known keys as short
-- strings, and drop anything that looks like personal data (an e-mail, a
-- UUID, a phone number). The admin page cleans it again when reading.
create or replace function public.clean_signup_attribution(p_raw jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each_text(case when jsonb_typeof(p_raw) = 'object' then p_raw else '{}'::jsonb end)
  where key in (
      'source', 'medium', 'campaign', 'content', 'term',
      'referrer', 'landing', 'via', 'paid_click'
    )
    and length(value) between 1 and 200
    and value not like '%@%'
    and value !~* '%40'
    and value !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}'
    -- Hex ids without dashes, and long letter-digit tokens that are at
    -- least 30 % digits (same rule as looksPersonal in attribution.ts).
    and regexp_replace(value, '[-_.]', '', 'g') !~* '^[0-9a-f]{16,}$'
    and not exists (
      select 1
      from regexp_matches(value, '[A-Za-z0-9]{20,}', 'g') as run(parts)
      where run.parts[1] ~ '[A-Za-z]'
        and length(regexp_replace(run.parts[1], '[^0-9]', '', 'g')) >= 0.3 * length(run.parts[1])
    )
    and (value !~ '^(\+|0)[0-9 ()./-]{6,}$' or value ~ '^[0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4}$');
$$;

revoke execute on function public.clean_signup_attribution(jsonb) from public, anon, authenticated;

create or replace function public.store_signup_attribution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attribution jsonb := public.clean_signup_attribution(new.raw_user_meta_data -> 'signup_attribution');
begin
  -- Follow the metadata while the account is unconfirmed: a code request
  -- that was abandoned must not win over the one that led to the signup.
  -- Once confirmed, the first touch is frozen (later auth.updateUser calls
  -- by the user do not change it).
  if v_attribution <> '{}'::jsonb
     and (tg_op = 'INSERT' or new.email_confirmed_at is null
          or (old.email_confirmed_at is null and new.email_confirmed_at is not null)) then
    insert into public.signup_attributions (user_id, attribution)
    values (new.id, v_attribution)
    on conflict (user_id) do update set attribution = excluded.attribution;
  end if;
  return new;
exception when others then
  -- Analytics must never block creating an account.
  return new;
end;
$$;

revoke execute on function public.store_signup_attribution() from public, anon, authenticated;

drop trigger if exists store_signup_attribution_on_auth_user on auth.users;
create trigger store_signup_attribution_on_auth_user
  after insert or update of raw_user_meta_data, email_confirmed_at on auth.users
  for each row execute function public.store_signup_attribution();

-- Accounts created before this migration: copy what their metadata holds.
insert into public.signup_attributions (user_id, attribution)
select id, public.clean_signup_attribution(raw_user_meta_data -> 'signup_attribution')
from auth.users
where public.clean_signup_attribution(raw_user_meta_data -> 'signup_attribution') <> '{}'::jsonb
on conflict (user_id) do nothing;
