-- Standalone PostgreSQL integration test. Run only against a disposable database:
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/invite_acceptance.sql <connection>
--
-- Contract of 0085: the invite that was actually redeemed carries
-- accepted_at / accepted_by — never the oldest open one. Multi-use links
-- keep working and keep the first redeemer as the accepted_by record.
begin;
create schema auth;
create role authenticated;
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
\ir ../migrations/0083_invite_status_and_notification_prefs.sql
\ir ../migrations/0085_exact_invite_acceptance.sql
-- Applying twice must not fail.
\ir ../migrations/0085_exact_invite_acceptance.sql
insert into auth.users values
 ('00000000-0000-0000-0000-000000000001', 'owner@example.test'),
 ('00000000-0000-0000-0000-000000000002', 'bob@example.test'),
 ('00000000-0000-0000-0000-000000000003', 'carol@example.test'),
 ('00000000-0000-0000-0000-000000000004', 'dave@example.test');
insert into public.families values
 ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Family One');
insert into public.family_memberships (family_id, user_id, role) values
 ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner');
-- Two open links: Alice's is the older one, Bob's the newer. Explicit
-- timestamps make the old "oldest open invite" guess deterministic prey.
insert into public.family_invites (id, family_id, token, label, created_at) values
 ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'link-alice', 'Für Alice', '2026-09-01T10:00:00Z'),
 ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'link-bob', 'Für Bob', '2026-09-02T10:00:00Z');
do $$
declare
  f1 uuid := '10000000-0000-0000-0000-000000000001';
  u1 uuid := '00000000-0000-0000-0000-000000000001';
  u2 uuid := '00000000-0000-0000-0000-000000000002';
  u3 uuid := '00000000-0000-0000-0000-000000000003';
  u4 uuid := '00000000-0000-0000-0000-000000000004';
  alice uuid := '20000000-0000-0000-0000-000000000001';
  bob uuid := '20000000-0000-0000-0000-000000000002';
  invites jsonb;
begin
  -- Bob redeems his own (newer) link: exactly that row is stamped.
  perform set_config('request.jwt.claim.sub', u2::text, true);
  assert public.accept_family_invite('link-bob')->>'status' = 'joined', 'bob joins';
  assert (select accepted_by from public.family_invites where id = bob) = u2, 'redeemed link stamped';
  assert (select accepted_at from public.family_invites where id = bob) is not null, 'redeemed link dated';
  assert (select accepted_at from public.family_invites where id = alice) is null, 'older link untouched';
  assert (select accepted_by from public.family_invites where id = alice) is null, 'older link unassigned';

  -- The link stays multi-use: Carol redeems it too, the first redeemer
  -- remains the acceptance record.
  perform set_config('request.jwt.claim.sub', u3::text, true);
  assert public.accept_family_invite('link-bob')->>'status' = 'joined', 'carol joins via same link';
  assert (select accepted_by from public.family_invites where id = bob) = u2, 'first redeemer kept';
  assert (select accepted_at from public.family_invites where id = alice) is null, 'still no guessing';

  -- A membership written by another path (merge flows, admin tooling)
  -- no longer stamps any invite: the guessing trigger is gone.
  insert into public.family_memberships (family_id, user_id, role)
  values (f1, u4, 'adult');
  assert (select accepted_at from public.family_invites where id = alice) is null, 'direct membership stamps nothing';

  -- The owner sees the acceptance on the exact invite, with its label.
  perform set_config('request.jwt.claim.sub', u1::text, true);
  invites := public.get_family_access(f1)->'invites';
  assert (select count(*) from jsonb_array_elements(invites) i
    where i->>'id' = bob::text and i->>'label' = 'Für Bob'
      and i->>'accepted_by' = u2::text and i->>'accepted_at' is not null) = 1,
    'owner sees bob acceptance';
  assert (select count(*) from jsonb_array_elements(invites) i
    where i->>'id' = alice::text and i->>'accepted_at' is null) = 1,
    'owner sees alice link still open';
end;
$$;
reset role;
rollback;
