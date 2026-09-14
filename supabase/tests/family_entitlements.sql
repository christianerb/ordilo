-- Standalone PostgreSQL integration test. Run only against a disposable DB:
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/family_entitlements.sql <connection>
\set ON_ERROR_STOP on
begin;

create schema auth;
create role anon;
create role authenticated;
create role service_role bypassrls;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create table auth.users (id uuid primary key);
create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id)
);
create table public.family_memberships (
  family_id uuid not null,
  user_id uuid not null,
  role text not null,
  unique (family_id, user_id)
);
create function public.user_belongs_to_family(fam_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.family_memberships
    where family_id = fam_id and user_id = auth.uid()
  )
$$;

insert into auth.users values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');
insert into public.families (id, name, created_by) values
  ('10000000-0000-0000-0000-000000000001', 'One',
   '00000000-0000-0000-0000-000000000001');
insert into public.family_memberships values
  ('10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001', 'owner');

\ir ../migrations/0081_family_entitlements.sql
\ir ../migrations/0081_family_entitlements.sql

do $$
declare
  fam uuid := '10000000-0000-0000-0000-000000000001';
  result jsonb;
begin
  assert (
    select plan_code = 'free' and status = 'free'
    from public.family_entitlements where family_id = fam
  ), 'existing family did not receive explicit free default';

  insert into public.families (id, name, created_by) values
    ('10000000-0000-0000-0000-000000000002', 'Two',
     '00000000-0000-0000-0000-000000000002');
  assert exists (
    select 1 from public.family_entitlements
    where family_id = '10000000-0000-0000-0000-000000000002'
      and plan_code = 'free' and status = 'free'
  ), 'new family did not receive free default';

  assert not has_table_privilege('authenticated', 'public.family_entitlements', 'SELECT'),
    'authenticated can read raw entitlement state';
  assert not has_table_privilege('authenticated', 'public.family_entitlements', 'UPDATE'),
    'authenticated can self-upgrade';
  assert not has_table_privilege('authenticated', 'public.billing_plan_limits', 'SELECT'),
    'authenticated can read plan configuration directly';
  assert not has_table_privilege('authenticated', 'public.family_usage_periods', 'SELECT'),
    'authenticated can read usage internals directly';
  assert not has_table_privilege('authenticated', 'public.billing_events', 'INSERT'),
    'authenticated can write billing events';
  assert has_function_privilege(
    'authenticated',
    'public.get_family_entitlement(uuid,timestamp with time zone)',
    'EXECUTE'
  ), 'authenticated cannot read effective entitlement';
  assert not has_function_privilege(
    'authenticated',
    'public.get_family_entitlement_admin(uuid,timestamp with time zone)',
    'EXECUTE'
  ), 'authenticated can bypass entitlement membership checks';
  assert not has_function_privilege(
    'authenticated',
    'public.reserve_family_usage(uuid,text,bigint,text,timestamp with time zone)',
    'EXECUTE'
  ), 'authenticated can reserve quota';
  assert not has_function_privilege(
    'authenticated',
    'public.release_family_usage(uuid,text,text,timestamp with time zone)',
    'EXECUTE'
  ), 'authenticated can release quota';
  assert not has_function_privilege(
    'authenticated',
    'public.record_billing_event(text,text,text,uuid,text,timestamp with time zone)',
    'EXECUTE'
  ), 'authenticated can write billing event RPC';

  perform set_config(
    'request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000000001',
    true
  );
  set local role authenticated;
  result := public.get_family_entitlement(
    fam, '2026-09-08 12:00:00+00'
  );
  assert result->>'plan' = 'free', 'default effective plan';
  assert (result->'limits'->>'chat_answer')::int = 10, 'free chat limit';
  assert public.get_family_entitlement(
    '10000000-0000-0000-0000-000000000002',
    '2026-09-08 12:00:00+00'
  ) is null, 'cross-family effective entitlement disclosure';
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  result := public.get_family_entitlement_admin(
    fam, '2026-09-08 12:00:00+00'
  );
  assert result->>'plan' = 'free',
    'service-role resolver incorrectly depends on auth.uid';
  perform set_config(
    'request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000000001',
    true
  );

  update public.family_entitlements
  set plan_code = 'plus', status = 'trialing',
      trial_ends_at = '2026-10-01 00:00:00+00'
  where family_id = fam;
  select public.get_family_entitlement(
    fam, '2026-09-30 23:59:59+00'
  ) into result;
  assert result->>'plan' = 'plus', 'live trial did not resolve to plus';
  select public.get_family_entitlement(
    fam, '2026-10-01 00:00:00+00'
  ) into result;
  assert result->>'plan' = 'free', 'expired trial did not resolve to free';

  update public.family_entitlements
  set status = 'active', trial_ends_at = null,
      current_period_ends_at = '2026-11-01 00:00:00+00'
  where family_id = fam;
  select public.get_family_entitlement(
    fam, '2026-10-15 00:00:00+00'
  ) into result;
  assert result->>'plan' = 'plus', 'active paid plan resolution';
  select public.get_family_entitlement(
    fam, '2026-11-01 00:00:00+00'
  ) into result;
  assert result->>'plan' = 'free', 'ended paid period did not downgrade';

  update public.family_entitlements
  set plan_code = 'free', status = 'free',
      current_period_ends_at = null
  where family_id = fam;

  -- Boundary: ten accepted, the eleventh denied without increasing usage.
  for i in 1..10 loop
    result := public.reserve_family_usage(
      fam, 'chat_answer', 1, 'chat-' || i,
      '2026-09-08 12:00:00+00'
    );
    assert (result->>'allowed')::boolean, 'request below limit denied';
  end loop;
  result := public.reserve_family_usage(
    fam, 'chat_answer', 1, 'chat-11',
    '2026-09-08 12:00:00+00'
  );
  assert not (result->>'allowed')::boolean, 'request over limit allowed';
  assert (result->>'used')::int = 10, 'denied request changed aggregate';

  -- Idempotency: a retry returns the original outcome and does not increment.
  result := public.reserve_family_usage(
    fam, 'chat_answer', 1, 'chat-10',
    '2026-09-08 12:00:00+00'
  );
  assert (result->>'allowed')::boolean, 'accepted retry changed outcome';
  assert (result->>'duplicate')::boolean, 'retry not marked duplicate';
  assert (select used = 10 from public.family_usage_periods
          where family_id = fam and metric_code = 'chat_answer'
            and period_start = '2026-09-01'), 'retry double counted';

  -- Release is atomic, idempotent, and permits the operation to retry.
  assert public.release_family_usage(
    fam, 'chat_answer', 'chat-10', '2026-09-08 12:00:00+00'
  ), 'accepted reservation was not released';
  assert not public.release_family_usage(
    fam, 'chat_answer', 'chat-10', '2026-09-08 12:00:00+00'
  ), 'release was not idempotent';
  result := public.reserve_family_usage(
    fam, 'chat_answer', 1, 'chat-10', '2026-09-08 12:00:00+00'
  );
  assert (result->>'allowed')::boolean
    and not (result->>'duplicate')::boolean,
    'released operation could not reserve again';

  -- UTC calendar-month periods reset independently. A key denied in one
  -- month is a new reservation in the next month.
  result := public.reserve_family_usage(
    fam, 'chat_answer', 1, 'chat-11',
    '2026-10-01 00:00:00+00'
  );
  assert (result->>'allowed')::boolean and (result->>'used')::int = 1,
    'new month did not reset usage';
  assert result->>'period_start' = '2026-10-01', 'wrong UTC period start';

  -- The aggregate row lock in reserve_family_usage serializes different
  -- operation keys. This invariant is what makes the checked boundary atomic
  -- under concurrent callers; verify the implementation retains that lock.
  assert position(
    'FOR UPDATE' in upper(pg_get_functiondef(
      'public.reserve_family_usage(uuid,text,bigint,text,timestamp with time zone)'::regprocedure
    ))
  ) > 0, 'quota aggregate is no longer concurrency-safe';

  assert public.record_billing_event(
    'test-provider', 'evt-1', 'subscription.updated', fam,
    repeat('a', 64), '2026-09-08 12:00:00+00'
  ), 'first billing event not recorded';
  assert not public.record_billing_event(
    'test-provider', 'evt-1', 'subscription.updated', fam,
    repeat('a', 64), '2026-09-08 12:00:00+00'
  ), 'duplicate billing event accepted';
  assert (select count(*) = 1 from public.billing_events
          where provider = 'test-provider' and provider_event_id = 'evt-1'),
    'billing event ledger is not idempotent';
end;
$$;

rollback;
