-- ============================================================================
-- Onboarding completion marker (families.onboarding_completed_at)
-- ============================================================================
--
-- Adds a durable `onboarding_completed_at` column to the families table so
-- the auth middleware can distinguish "onboarding completed" from raw member
-- count. Previously the middleware treated "has >=1 family member" as
-- "onboarding complete", which broke VAL-ONBOARD-026 / VAL-FAMILY-004: a
-- fully-onboarded user who removed their LAST member was redirected back to
-- /onboarding instead of seeing the zero-member empty state on /familie.
--
-- With this marker, the middleware redirects to /onboarding ONLY when the
-- family exists AND onboarding_completed_at IS NULL (mid-onboarding). Once
-- the marker is set (when the user finishes the onboarding flow), the user
-- can reach /familie (and the rest of the app) even with zero members.
--
-- Backfill: existing families that already have >=1 member are considered
-- onboarded (their onboarding_completed_at is set to COALESCE(created_at,
-- now())). Families with zero members keep onboarding_completed_at NULL so
-- the mid-onboarding bypass stays closed for them.

-- ---------------------------------------------------------------------------
-- Step 1: Add the column (nullable — NULL means onboarding not yet completed).
-- ---------------------------------------------------------------------------

alter table public.families
  add column if not exists onboarding_completed_at timestamptz;

-- ---------------------------------------------------------------------------
-- Step 2: Backfill existing families that have >=1 member.
--
-- A family is considered "onboarded" if it has at least one family_member.
-- We use COALESCE(created_at, now()) so the marker reflects when the family
-- was created (a reasonable proxy for when onboarding was completed for
-- existing data) rather than the migration timestamp.
-- ---------------------------------------------------------------------------

update public.families f
  set onboarding_completed_at = coalesce(f.created_at, now())
  where f.onboarding_completed_at is null
    and exists (
      select 1
      from public.family_members fm
      where fm.family_id = f.id
    );

-- ---------------------------------------------------------------------------
-- Step 3: The existing RLS policies on families already allow the owner to
-- UPDATE their own row, so the completeOnboarding server action can set
-- onboarding_completed_at without additional policy changes.
-- ---------------------------------------------------------------------------
