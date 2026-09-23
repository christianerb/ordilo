-- New users could not create a family.
--
-- Web and mobile onboarding both run
--
--   insert into families (name, created_by) ... returning id, name
--
-- (supabase-js `.insert(...).select().single()`). RETURNING makes Postgres
-- check the new row against the SELECT policy as well. Since 0057 that
-- policy is only `public.user_belongs_to_family(id)`, a STABLE SQL function:
-- it runs on the statement's snapshot, which does not contain the row being
-- inserted, and the owner membership is only written by the AFTER INSERT
-- trigger. The helper therefore returns false for the new family, and the
-- insert fails with "new row violates row-level security policy for table
-- families" (42501). Every first-time sign-up stopped at step 1 of
-- onboarding; existing families were unaffected.
--
-- Checking created_by directly on the row restores the creator path without
-- a snapshot lookup. The helper keeps covering invited members.

drop policy if exists "families_member_select" on public.families;
create policy "families_member_select" on public.families
  for select using (
    created_by = auth.uid()
    or public.user_belongs_to_family(id)
  );
