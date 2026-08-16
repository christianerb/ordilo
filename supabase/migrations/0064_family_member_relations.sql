-- Multiple relationships per family member.
--
-- Until now a member had exactly ONE role ("Mutter") plus ONE free-text
-- relationship label pointing at a set of other members ("Elternteil" von
-- Emma und Hanna). Real families do not fit that: Karina is "Mutter von
-- Emma und Hanna" AND "Partnerin von Christian" at the same time. A single
-- role chip cannot say that, and the separate "Beziehung zu" field could
-- only ever hold one label.
--
-- This migration introduces `family_member_relations`: one row per
-- "<member> ist <role> von <related member>". A role without a target
-- (related_member_id is null) is allowed — that is the plain "Mutter" for
-- a family where nobody else has been added yet.
--
-- `family_members.role` is KEPT as the denormalized primary role (the role
-- of the first relation). Filters (Erwachsene/Kinder), the chat tools and
-- the task assignment sheet keep reading it, so they need no change.
--
-- `family_members.related_member_ids` and `family_members.relationship_label`
-- (migrations 0022/0042) are superseded by this table. Their content is
-- backfilled below; the columns stay in place for one release so an older
-- deployment reading them does not break, and are no longer written to.
--
-- Idempotent: create ... if not exists, drop policy if exists, and the
-- backfill uses `on conflict do nothing` against the unique indexes.

create table if not exists public.family_member_relations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  -- null = a role without a counterpart ("Mutter", nobody to point at yet).
  related_member_id uuid references public.family_members (id) on delete cascade,
  role text not null check (char_length(btrim(role)) between 1 and 50),
  -- Display order of the relations of one member.
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint family_member_relations_not_self
    check (related_member_id is null or related_member_id <> member_id)
);

comment on table public.family_member_relations is
  'One row per "<member> ist <role> von <related member>". A null '
  'related_member_id is a role without a counterpart.';

comment on column public.family_members.related_member_ids is
  'Deprecated since migration 0064 — superseded by family_member_relations.';
comment on column public.family_members.relationship_label is
  'Deprecated since migration 0064 — superseded by family_member_relations.';
comment on column public.family_members.role is
  'Denormalized primary role: the role of the member''s first relation in '
  'family_member_relations. Kept for filters, chat tools and task assignment.';

create index if not exists family_member_relations_member_idx
  on public.family_member_relations (member_id, sort_order);
create index if not exists family_member_relations_related_idx
  on public.family_member_relations (related_member_id);
create index if not exists family_member_relations_family_idx
  on public.family_member_relations (family_id);

-- The same role towards the same person is stored once. Two partial
-- indexes because a null related_member_id never conflicts in a plain
-- unique index.
create unique index if not exists family_member_relations_unique_target_idx
  on public.family_member_relations (member_id, lower(role), related_member_id)
  where related_member_id is not null;
create unique index if not exists family_member_relations_unique_solo_idx
  on public.family_member_relations (member_id, lower(role))
  where related_member_id is null;

alter table public.family_member_relations enable row level security;
alter table public.family_member_relations force row level security;

drop policy if exists "family_member_relations_select" on public.family_member_relations;
drop policy if exists "family_member_relations_insert" on public.family_member_relations;
drop policy if exists "family_member_relations_update" on public.family_member_relations;
drop policy if exists "family_member_relations_delete" on public.family_member_relations;

create policy "family_member_relations_select" on public.family_member_relations
  for select using (public.user_belongs_to_family(family_id));
create policy "family_member_relations_insert" on public.family_member_relations
  for insert with check (public.user_belongs_to_family(family_id));
create policy "family_member_relations_update" on public.family_member_relations
  for update using (public.user_belongs_to_family(family_id))
  with check (public.user_belongs_to_family(family_id));
create policy "family_member_relations_delete" on public.family_member_relations
  for delete using (public.user_belongs_to_family(family_id));

-- ---------------------------------------------------------------------------
-- Backfill from the old single-role / single-label model
-- ---------------------------------------------------------------------------

-- 1. The plain role becomes a relation without a counterpart — unless the
--    old relationship label already says the same thing with targets
--    ("Mutter" + "Mutter von Emma" would otherwise be listed twice).
insert into public.family_member_relations (family_id, member_id, related_member_id, role, sort_order)
select m.family_id, m.id, null, btrim(m.role), 0
from public.family_members m
where m.role is not null
  and btrim(m.role) <> ''
  and char_length(btrim(m.role)) <= 50
  and (
    m.relationship_label is null
    or btrim(m.relationship_label) = ''
    or coalesce(array_length(m.related_member_ids, 1), 0) = 0
    or lower(btrim(m.relationship_label)) <> lower(btrim(m.role))
  )
on conflict do nothing;

-- 2. The labelled relationship becomes one row per related member.
insert into public.family_member_relations (family_id, member_id, related_member_id, role, sort_order)
select m.family_id, m.id, related.id, btrim(m.relationship_label), 1
from public.family_members m
cross join lateral unnest(m.related_member_ids) as related(id)
where m.relationship_label is not null
  and btrim(m.relationship_label) <> ''
  and char_length(btrim(m.relationship_label)) <= 50
  and related.id <> m.id
  -- A related id can be stale (an array column has no FK).
  and exists (select 1 from public.family_members t where t.id = related.id)
on conflict do nothing;
