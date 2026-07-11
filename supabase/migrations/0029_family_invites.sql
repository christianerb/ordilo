-- 0029_family_invites.sql
--
-- Shareable family invite links.
--
-- The family owner creates an invite (a random token, valid 14 days,
-- multi-use so one link covers both grandparents). Anyone who opens
-- /invite/<token> and signs in joins the family as a member via the
-- `accept_family_invite` RPC (security definer — the joining user cannot
-- see the invite row through RLS, so the function performs the check).
--
-- Constraint: a user belongs to at most ONE family for now (the whole app
-- resolves "my family" as a single row). accept_family_invite therefore
-- rejects users who already belong to a different family.

create table if not exists public.family_invites (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid references public.families (id) on delete cascade not null,
  -- 64 hex chars from two random UUIDs (~244 bits of entropy) — avoids a
  -- dependency on pgcrypto's gen_random_bytes.
  token      text not null unique
             default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  role       text not null default 'adult' check (role in ('adult', 'viewer')),
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists family_invites_family_id_idx
  on public.family_invites (family_id);

alter table public.family_invites enable row level security;

-- Members can see their family's invites; only the owner manages them.
drop policy if exists "family_invites_select" on public.family_invites;
create policy "family_invites_select" on public.family_invites
  for select using (public.user_belongs_to_family(family_id));

drop policy if exists "family_invites_insert" on public.family_invites;
create policy "family_invites_insert" on public.family_invites
  for insert with check (
    exists (
      select 1 from public.families f
      where f.id = family_id and f.created_by = auth.uid()
    )
  );

drop policy if exists "family_invites_update" on public.family_invites;
create policy "family_invites_update" on public.family_invites
  for update using (
    exists (
      select 1 from public.families f
      where f.id = family_id and f.created_by = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.families f
      where f.id = family_id and f.created_by = auth.uid()
    )
  );

drop policy if exists "family_invites_delete" on public.family_invites;
create policy "family_invites_delete" on public.family_invites
  for delete using (
    exists (
      select 1 from public.families f
      where f.id = family_id and f.created_by = auth.uid()
    )
  );

-- ============================================================================
-- Invite info (landing page, works for signed-out visitors)
-- ============================================================================
--
-- Returns only the family name for a VALID token — holding the token IS the
-- authorization. Invalid/expired/revoked tokens return {"status":"invalid"}.

create or replace function public.get_family_invite_info(p_token text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_family_name text;
begin
  select f.name into v_family_name
  from public.family_invites i
  join public.families f on f.id = i.family_id
  where i.token = p_token
    and i.revoked_at is null
    and i.expires_at > now();

  if v_family_name is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  return jsonb_build_object('status', 'valid', 'family_name', v_family_name);
end;
$$;

revoke all on function public.get_family_invite_info(text) from public;
grant execute on function public.get_family_invite_info(text) to anon, authenticated;

-- ============================================================================
-- Accept invite (authenticated)
-- ============================================================================

create or replace function public.accept_family_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite  public.family_invites%rowtype;
  v_user_id uuid := auth.uid();
  v_family_name text;
  v_other_family uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('status', 'unauthenticated');
  end if;

  select * into v_invite
  from public.family_invites
  where token = p_token
    and revoked_at is null
    and expires_at > now();

  if v_invite.id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Already a member of THIS family → idempotent success.
  if exists (
    select 1 from public.family_memberships
    where family_id = v_invite.family_id and user_id = v_user_id
  ) then
    select name into v_family_name from public.families where id = v_invite.family_id;
    return jsonb_build_object(
      'status', 'joined', 'family_id', v_invite.family_id,
      'family_name', v_family_name
    );
  end if;

  -- The app resolves "my family" as a single row, so a user may belong to
  -- at most one family. Reject if they already have a different one
  -- (own created family or another membership).
  select m.family_id into v_other_family
  from public.family_memberships m
  where m.user_id = v_user_id
  limit 1;

  if v_other_family is null then
    select f.id into v_other_family
    from public.families f
    where f.created_by = v_user_id
    limit 1;
  end if;

  if v_other_family is not null and v_other_family <> v_invite.family_id then
    return jsonb_build_object('status', 'already_in_family');
  end if;

  insert into public.family_memberships (family_id, user_id, role)
  values (v_invite.family_id, v_user_id, v_invite.role)
  on conflict (family_id, user_id) do nothing;

  select name into v_family_name from public.families where id = v_invite.family_id;

  return jsonb_build_object(
    'status', 'joined', 'family_id', v_invite.family_id,
    'family_name', v_family_name
  );
end;
$$;

revoke all on function public.accept_family_invite(text) from public;
grant execute on function public.accept_family_invite(text) to authenticated;
