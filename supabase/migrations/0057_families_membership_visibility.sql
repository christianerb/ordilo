-- Invited members could not SEE their own family row.
--
-- The families SELECT policy from 0024 carried this membership arm:
--
--   or exists (
--     select 1 from public.family_memberships m
--     where m.family_id = id and m.user_id = auth.uid()
--   )
--
-- Inside a subquery an unqualified column resolves against the INNERMOST
-- scope first — and family_memberships has an `id` column of its own. The
-- condition therefore compared m.family_id = m.id, which is false for every
-- row, so the membership arm never matched anything. Creators kept passing
-- through `created_by = auth.uid()`, which is why the bug stayed invisible:
-- until the invite flow was repaired there was nobody who was a member
-- WITHOUT being the creator.
--
-- For a freshly joined member the world then looked like this: the
-- membership row was visible (its policy goes through
-- user_belongs_to_family, which is written with qualified references), but
-- the `families(...)` embed on it came back NULL. resolveUserFamily read
-- that as "no family", and the routing gate sent a person who had JUST
-- joined a family into onboarding to found a new one.
--
-- The fix routes the policy through user_belongs_to_family(id) — the same
-- helper every other family-scoped table already uses. As a function
-- argument, `id` unambiguously means families.id; the helper also covers
-- the created_by fallback, so the policy needs no second arm. No recursion:
-- the helper is SECURITY DEFINER, and 0032 keeps families and
-- family_memberships out of FORCE RLS precisely so it can read them freely.

drop policy if exists "families_member_select" on public.families;
create policy "families_member_select" on public.families
  for select using (public.user_belongs_to_family(id));
