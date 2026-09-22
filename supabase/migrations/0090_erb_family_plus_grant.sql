-- Comp the operating family to Plus without a payment provider, so the
-- operator can exercise paid features (live conversation, unlimited
-- processing) on the real product. `active` with no period end grants
-- indefinite access; the provider pair stays null, which the entitlement
-- constraints allow.
--
-- The family is targeted by its stable UUID. Family names are user-
-- controlled and non-unique, so a name match could comp an unrelated
-- family whose name merely contains the same substring.
--
-- The `where status = 'free'` guard keeps the grant a one-way upgrade:
-- reapplying the migration is a no-op, and a row that later carries a real
-- RevenueCat subscription (or any non-free state) is never overwritten.
insert into public.family_entitlements (
  family_id,
  plan_code,
  status,
  trial_ends_at,
  current_period_ends_at,
  grace_ends_at,
  cancel_at_period_end,
  updated_at
)
select id, 'plus', 'active', null, null, null, false, now()
from public.families
where id = '71b7f002-0329-419d-b149-0a6a12e6cfad'
on conflict (family_id) do update
set plan_code = excluded.plan_code,
    status = excluded.status,
    trial_ends_at = excluded.trial_ends_at,
    current_period_ends_at = excluded.current_period_ends_at,
    grace_ends_at = excluded.grace_ends_at,
    cancel_at_period_end = excluded.cancel_at_period_end,
    updated_at = excluded.updated_at
where public.family_entitlements.status = 'free';
