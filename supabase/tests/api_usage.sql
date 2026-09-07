\set ON_ERROR_STOP on
begin;
create schema auth;
create table auth.users (id uuid primary key);
create table public.documents (id uuid primary key);
create role anon;
create role authenticated;
create role service_role bypassrls;
\ir ../migrations/0079_api_usage.sql
\ir ../migrations/0079_api_usage.sql
do $$
begin
  if has_table_privilege('anon', 'public.api_usage', 'SELECT')
    or has_table_privilege('authenticated', 'public.api_usage', 'SELECT')
    or has_table_privilege('authenticated', 'public.api_usage', 'INSERT') then
    raise exception 'Usage must be server-only';
  end if;
  if not has_table_privilege('service_role', 'public.api_usage', 'SELECT,INSERT') then
    raise exception 'Server usage access missing';
  end if;
end $$;
insert into api_usage (operation_id, operation, provider, provider_request_id)
values ('00000000-0000-4000-a000-000000000001', 'chat', 'openai', 'test-response');
do $$
begin
  if not exists (select 1 from api_usage where cost_usd is null) then
    raise exception 'Unknown cost must remain null';
  end if;
  begin
    insert into api_usage (operation_id, operation, provider, provider_request_id)
    values ('00000000-0000-4000-a000-000000000002', 'chat', 'openai', 'test-response');
    raise exception 'Duplicate provider response accepted';
  exception when unique_violation then null;
  end;
end $$;
rollback;
