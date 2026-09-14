-- Actual two-connection quota race test. Run only against a disposable DB:
-- psql -v ON_ERROR_STOP=1 -f \
--   supabase/tests/family_entitlements_concurrency.sql <connection>
\set ON_ERROR_STOP on

create extension if not exists dblink;
create schema auth;
create role anon;
create role authenticated;
create role service_role bypassrls;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
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
create function public.user_belongs_to_family(uuid)
returns boolean language sql security definer stable as $$ select false $$;

\ir ../migrations/0081_family_entitlements.sql

insert into auth.users values ('00000000-0000-0000-0000-000000000001');
insert into public.families (id, name, created_by) values (
  '10000000-0000-0000-0000-000000000001',
  'Concurrent family',
  '00000000-0000-0000-0000-000000000001'
);

-- Hold the transaction-level row lock after reserving so the second
-- connection is guaranteed to overlap the first.
create function public.test_reserve_and_hold(p_operation_key text)
returns jsonb
language plpgsql
as $$
declare
  result jsonb;
begin
  result := public.reserve_family_usage(
    '10000000-0000-0000-0000-000000000001',
    'chat_answer',
    7,
    p_operation_key,
    '2026-09-08 12:00:00+00'
  );
  perform pg_sleep(1);
  return result;
end;
$$;

select dblink_connect('quota_first', 'dbname=' || current_database());
select dblink_connect('quota_second', 'dbname=' || current_database());
select dblink_send_query(
  'quota_first',
  $$select public.test_reserve_and_hold('concurrent-first')$$
);
select pg_sleep(0.1);
select dblink_send_query(
  'quota_second',
  $$select public.reserve_family_usage(
    '10000000-0000-0000-0000-000000000001',
    'chat_answer',
    7,
    'concurrent-second',
    '2026-09-08 12:00:00+00'
  )$$
);

create temporary table concurrent_results (
  operation_key text primary key,
  result jsonb not null
);
insert into concurrent_results
select 'concurrent-first', result
from dblink_get_result('quota_first') as response(result jsonb);
insert into concurrent_results
select 'concurrent-second', result
from dblink_get_result('quota_second') as response(result jsonb);

do $$
begin
  assert (
    select (result->>'allowed')::boolean
    from concurrent_results where operation_key = 'concurrent-first'
  ), 'first concurrent reservation should fit';
  assert not (
    select (result->>'allowed')::boolean
    from concurrent_results where operation_key = 'concurrent-second'
  ), 'second concurrent reservation crossed the limit';
  assert (
    select used = 7
    from public.family_usage_periods
    where family_id = '10000000-0000-0000-0000-000000000001'
      and metric_code = 'chat_answer'
      and period_start = '2026-09-01'
  ), 'concurrent reservations corrupted aggregate usage';
end;
$$;

select dblink_disconnect('quota_first');
select dblink_disconnect('quota_second');
