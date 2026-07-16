-- Keep the tables read by user_belongs_to_family() outside FORCE RLS.
--
-- The helper is SECURITY DEFINER and is called by policies on both tables.
-- Forcing RLS would apply those policies while the helper reads them, causing
-- recursive policy evaluation for authenticated users.

alter table public.family_memberships no force row level security;
alter table public.families no force row level security;
