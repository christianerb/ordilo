-- Standalone PostgreSQL integration test. Run only against a disposable database:
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/family_access.sql <connection>
begin;
create schema auth;
create role authenticated;
create role anon;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create table auth.users (id uuid primary key, email text);
create table public.families (id uuid primary key, created_by uuid, name text);
create table public.family_memberships (
  id uuid default gen_random_uuid(), family_id uuid, user_id uuid, role text,
  created_at timestamptz default now(), unique(family_id, user_id)
);
create table public.family_invites (
  id uuid primary key, family_id uuid, token text, role text default 'adult',
  created_by uuid, expires_at timestamptz default now() + interval '14 days',
  revoked_at timestamptz, created_at timestamptz default now()
);
create table public.documents (family_id uuid, status text);
create table public.family_invite_notifications (
  id uuid default gen_random_uuid(), recipient_user_id uuid, actor_user_id uuid, family_id uuid, family_name text
);
create function public.user_belongs_to_family(fam_id uuid) returns boolean language sql security definer as $$
  select exists(select 1 from public.family_memberships where family_id = fam_id and user_id = auth.uid())
    or exists(select 1 from public.families where id = fam_id and created_by = auth.uid())
$$;
\ir ../migrations/0078_family_access_management.sql
-- Applying twice must not fail.
\ir ../migrations/0078_family_access_management.sql
insert into auth.users values
 ('00000000-0000-0000-0000-000000000001', 'owner@example.test'),
 ('00000000-0000-0000-0000-000000000002', 'member@example.test'),
 ('00000000-0000-0000-0000-000000000003', 'other@example.test');
insert into public.families values
 ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Family One'),
 ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'Family Two');
insert into public.family_memberships (family_id, user_id, role) values
 ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner'),
 ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'adult'),
 ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'owner');
insert into public.family_invites (id, family_id, token) values
 ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'link-one'),
 ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'link-two'),
 ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'other-link');
alter table public.family_memberships enable row level security;
alter table public.family_invites enable row level security;
create policy membership_read on public.family_memberships for select using (public.user_belongs_to_family(family_id));
grant select on public.families, public.family_memberships, public.family_invites to authenticated;
grant delete on public.family_memberships to authenticated;
grant usage on schema public, auth to authenticated;
grant execute on function auth.uid() to authenticated;
set local role authenticated;
do $$
declare
  f1 uuid := '10000000-0000-0000-0000-000000000001';
  f2 uuid := '10000000-0000-0000-0000-000000000002';
  u1 uuid := '00000000-0000-0000-0000-000000000001';
  u2 uuid := '00000000-0000-0000-0000-000000000002';
  u3 uuid := '00000000-0000-0000-0000-000000000003';
  i1 uuid := '20000000-0000-0000-0000-000000000001';
  i3 uuid := '20000000-0000-0000-0000-000000000003';
  result jsonb;
begin
  assert not has_function_privilege('anon', 'public.get_family_access(uuid)', 'execute'), 'anonymous execute grant';
  assert public.get_family_access(f1)->>'status' = 'forbidden', 'anonymous reads';
  assert public.revoke_family_access(f1,u2)->>'status' = 'forbidden', 'anonymous revoke';
  perform set_config('request.jwt.claim.sub', u2::text, true);
  result := public.get_family_access(f1);
  assert result->>'status' = 'ok' and jsonb_array_length(result->'members') = 2, 'member roster';
  assert jsonb_array_length(result->'invites') = 0, 'member sees invites';
  assert (select count(*) = 0 from public.family_invites), 'member reads tokens directly';
  assert public.get_family_access(f2)->>'status' = 'forbidden', 'cross family read';
  assert public.revoke_family_access(f1,u1)->>'status' = 'forbidden', 'member removes owner';
  assert public.revoke_family_access(f1,u2)->>'status' = 'forbidden', 'member self removes via owner RPC';
  assert public.revoke_family_invite(f1,i1)->>'status' = 'forbidden', 'member revokes invite';
  perform set_config('request.jwt.claim.sub', u1::text, true);
  result := public.get_family_access(f1);
  assert jsonb_array_length(result->'invites') = 2, 'owner sees active invites';
  assert not (result->'invites'->0 ? 'token'), 'token disclosure';
  assert public.revoke_family_access(f1,u1)->>'status' = 'owner_protected', 'owner self protection';
  delete from public.family_memberships where family_id=f1 and user_id=u1;
  assert jsonb_array_length(public.get_family_access(f1)->'members') = 2, 'direct deletion bypasses owner protection';
  assert public.revoke_family_access(f2,u3)->>'status' = 'forbidden', 'cross family revoke';
  assert public.revoke_family_invite(f1,i3)->>'status' = 'not_found', 'cross family invite ID';
  assert public.revoke_family_access(f1,u3)->>'status' = 'not_found', 'cross family member ID';
  assert public.revoke_family_invite(f1,i1)->>'status' = 'ok', 'owner revokes invite';
  assert public.revoke_family_invite(f1,i1)->>'status' = 'ok', 'invite revoke idempotency';
  assert jsonb_array_length(public.get_family_access(f1)->'members') = 2, 'revoking link removes existing member';
  assert public.revoke_family_access(f1,u2)->>'status' = 'ok', 'owner revokes member';
  assert jsonb_array_length(public.get_family_access(f1)->'invites') = 0, 'all old links revoked';
  assert jsonb_array_length(public.get_family_access(f1)->'members') = 1, 'member still in roster';
  perform set_config('request.jwt.claim.sub', u2::text, true);
  assert public.get_family_access(f1)->>'status' = 'forbidden', 'removed user reads';
  assert not public.user_belongs_to_family(f1), 'removed user retains RLS access';
  assert public.accept_family_invite('link-two')->>'status' = 'invalid', 'removed user rejoins';
  perform set_config('request.jwt.claim.sub', u3::text, true);
  assert jsonb_array_length(public.get_family_access(f2)->'invites') = 1, 'other family invite touched';
end;
$$;
reset role;
rollback;
