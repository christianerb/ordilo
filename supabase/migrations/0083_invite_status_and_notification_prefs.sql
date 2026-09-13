-- 0083_invite_status_and_notification_prefs.sql
--
-- 1. Invite bookkeeping: an optional label (so the owner remembers who a
--    link was for) plus accepted_at / accepted_by, stamped automatically.
-- 2. Trigger: when a membership appears, the oldest still-open invite of
--    that family counts as accepted by the joining user.
-- 3. get_family_access: invite rows now also carry label / accepted_at /
--    accepted_by (all existing fields unchanged).
-- 4. notification_preferences: per-user, per-family switches for the four
--    notification categories.

-- ============================================================================
-- 1. family_invites columns
-- ============================================================================

alter table public.family_invites
  add column if not exists label text;

alter table public.family_invites
  add column if not exists accepted_at timestamptz;

alter table public.family_invites
  add column if not exists accepted_by uuid references auth.users (id) on delete set null;

-- ============================================================================
-- 2. Mark the oldest open invite as accepted on membership insert
-- ============================================================================
--
-- The join itself happens in accept_family_invite (security definer), but a
-- membership can also come from merge flows — a trigger covers every writer.
-- family_memberships is the account-join table; family_members holds person
-- profiles without a user_id and is not involved here.

create or replace function public.family_invites_mark_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.family_invites
  set accepted_at = now(),
      accepted_by = new.user_id
  where id = (
    select i.id
    from public.family_invites i
    where i.family_id = new.family_id
      and i.accepted_at is null
    order by i.created_at asc
    limit 1
  );
  return new;
end;
$$;

revoke all on function public.family_invites_mark_accepted() from public;

drop trigger if exists family_invites_mark_accepted on public.family_memberships;
create trigger family_invites_mark_accepted
  after insert on public.family_memberships
  for each row execute function public.family_invites_mark_accepted();

-- ============================================================================
-- 3. get_family_access: invites carry label / accepted_at / accepted_by
-- ============================================================================

create or replace function public.get_family_access(p_family_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null or not public.user_belongs_to_family(p_family_id) then
    return jsonb_build_object('status', 'forbidden');
  end if;
  select created_by into v_owner from public.families where id = p_family_id;
  return jsonb_build_object(
    'status', 'ok',
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', u.id,
        'email', u.email,
        'is_owner', u.id = v_owner,
        'is_self', u.id = auth.uid()
      ) order by u.id = v_owner desc, m.created_at)
      from public.family_memberships m join auth.users u on u.id = m.user_id
      where m.family_id = p_family_id
    ), '[]'::jsonb),
    'invites', case when auth.uid() = v_owner then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'expires_at', i.expires_at,
        'label', i.label,
        'accepted_at', i.accepted_at,
        'accepted_by', i.accepted_by
      ) order by i.created_at desc)
      from public.family_invites i
      where i.family_id = p_family_id and i.revoked_at is null and i.expires_at > now()
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;
revoke all on function public.get_family_access(uuid) from public;
grant execute on function public.get_family_access(uuid) to authenticated;

-- ============================================================================
-- 4. notification_preferences
-- ============================================================================
--
-- One row per (user, family, category); a missing row means "default"
-- (enabled). Writes are limited to the user's own rows.

create table if not exists public.notification_preferences (
  user_id   uuid not null references auth.users (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  category  text not null
            check (category in ('deadlines', 'handoffs', 'processing', 'family')),
  enabled   boolean not null default true,
  primary key (user_id, family_id, category)
);

alter table public.notification_preferences enable row level security;
alter table public.notification_preferences force row level security;

drop policy if exists "notification_preferences_select" on public.notification_preferences;
create policy "notification_preferences_select" on public.notification_preferences
  for select using (user_id = auth.uid());

drop policy if exists "notification_preferences_insert" on public.notification_preferences;
create policy "notification_preferences_insert" on public.notification_preferences
  for insert with check (user_id = auth.uid());

drop policy if exists "notification_preferences_update" on public.notification_preferences;
create policy "notification_preferences_update" on public.notification_preferences
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "notification_preferences_delete" on public.notification_preferences;
create policy "notification_preferences_delete" on public.notification_preferences
  for delete using (user_id = auth.uid());
