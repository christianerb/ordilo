-- 0024_family_memberships.sql
--
-- Family memberships: allow multiple users to share one family.
--
-- Until now, family access was tied exclusively to `families.created_by`,
-- so only the account that created a family could see any of its data.
-- This migration introduces a proper membership model:
--
--   1. `family_memberships` table (user ↔ family with a role)
--   2. Backfill: every existing family creator becomes an 'owner' member
--   3. Trigger: creating a family automatically creates its owner membership
--   4. `user_belongs_to_family()` (the helper every RLS policy uses) now
--      checks memberships, with a created_by fallback for safety
--   5. The `families` SELECT policy and the inline `created_by` policies
--      from 0018 (task_documents) and 0020 (family_inventory_items) are
--      recreated to go through `user_belongs_to_family()`
--
-- Invited members get full read/write access to family data (all existing
-- family-scoped policies use `user_belongs_to_family`). Destructive
-- operations on the family itself (update/delete) remain owner-only.
--
-- NOTE: `families.created_by` keeps its unique index (0010) — a user can
-- still only CREATE one family, but can now be a MEMBER of others.

-- ============================================================================
-- 1. Table
-- ============================================================================

create table if not exists public.family_memberships (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid references public.families (id) on delete cascade not null,
  user_id    uuid references auth.users (id) on delete cascade not null,
  role       text not null default 'adult'
             check (role in ('owner', 'adult', 'viewer')),
  created_at timestamptz not null default now(),
  unique (family_id, user_id)
);

create index if not exists family_memberships_user_id_idx
  on public.family_memberships (user_id);
create index if not exists family_memberships_family_id_idx
  on public.family_memberships (family_id);

-- ============================================================================
-- 2. Backfill: creators become owner members
-- ============================================================================

insert into public.family_memberships (family_id, user_id, role)
select f.id, f.created_by, 'owner'
from public.families f
where f.created_by is not null
on conflict (family_id, user_id) do nothing;

-- ============================================================================
-- 3. Trigger: auto-create the owner membership on family insert
-- ============================================================================

create or replace function public.handle_family_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.family_memberships (family_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict (family_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_family_created on public.families;
create trigger on_family_created
  after insert on public.families
  for each row execute function public.handle_family_created();

-- ============================================================================
-- 4. user_belongs_to_family: membership-based (created_by fallback)
-- ============================================================================

create or replace function public.user_belongs_to_family(fam_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.family_memberships m
    where m.family_id = fam_id
      and m.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.families f
    where f.id = fam_id
      and f.created_by = auth.uid()
  );
$$;

-- ============================================================================
-- 5. RLS for family_memberships
-- ============================================================================
--
-- - Members can see who else is in their family.
-- - Only the family owner (creator) can add/update/remove memberships.
--   (Invite flows go through the owner; self-service joins come later.)
-- - A member may delete their OWN membership (leave the family).
--
-- `user_belongs_to_family` is SECURITY DEFINER, so using it inside these
-- policies does not recurse into the memberships policies themselves.

alter table public.family_memberships enable row level security;

create policy "family_memberships_select" on public.family_memberships
  for select using (public.user_belongs_to_family(family_id));

create policy "family_memberships_insert" on public.family_memberships
  for insert with check (
    exists (
      select 1 from public.families f
      where f.id = family_id and f.created_by = auth.uid()
    )
  );

create policy "family_memberships_update" on public.family_memberships
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

create policy "family_memberships_delete" on public.family_memberships
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from public.families f
      where f.id = family_id and f.created_by = auth.uid()
    )
  );

-- ============================================================================
-- 6. families: members may SELECT (mutations stay owner-only)
-- ============================================================================

drop policy if exists "families_owner_select" on public.families;
create policy "families_member_select" on public.families
  for select using (
    created_by = auth.uid()
    or exists (
      select 1 from public.family_memberships m
      where m.family_id = id and m.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 7. Recreate inline created_by policies through user_belongs_to_family
-- ============================================================================

-- task_documents (0018)
drop policy if exists "task_documents family select" on public.task_documents;
drop policy if exists "task_documents family insert" on public.task_documents;
drop policy if exists "task_documents family delete" on public.task_documents;

create policy "task_documents family select"
  on public.task_documents for select
  using (public.user_belongs_to_family(family_id));
create policy "task_documents family insert"
  on public.task_documents for insert
  with check (public.user_belongs_to_family(family_id));
create policy "task_documents family delete"
  on public.task_documents for delete
  using (public.user_belongs_to_family(family_id));

-- family_inventory_items (0020)
drop policy if exists "inventory_items_select" on public.family_inventory_items;
drop policy if exists "inventory_items_insert" on public.family_inventory_items;
drop policy if exists "inventory_items_update" on public.family_inventory_items;
drop policy if exists "inventory_items_delete" on public.family_inventory_items;

create policy "inventory_items_select" on public.family_inventory_items
  for select using (public.user_belongs_to_family(family_id));
create policy "inventory_items_insert" on public.family_inventory_items
  for insert with check (public.user_belongs_to_family(family_id));
create policy "inventory_items_update" on public.family_inventory_items
  for update using (public.user_belongs_to_family(family_id))
  with check (public.user_belongs_to_family(family_id));
create policy "inventory_items_delete" on public.family_inventory_items
  for delete using (public.user_belongs_to_family(family_id));
