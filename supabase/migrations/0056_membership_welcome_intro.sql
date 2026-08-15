-- Remember, per person, that an invited member saw the welcome intro.
--
-- Someone who CREATES a family learns what Ordilo is by walking through
-- setup. Someone who accepts an invite is dropped straight into a document
-- list — often without having chosen the product at all. They get a short,
-- passive intro (no forms, always skippable) exactly once.
--
-- "Exactly once" has to survive a new phone, a second browser and cleared
-- site data, so the marker belongs in the database rather than in
-- localStorage. `family_memberships` is its natural home: the fact is about
-- one PERSON in one FAMILY, which is precisely what a membership row is.

alter table public.family_memberships
  add column if not exists intro_seen_at timestamptz;

comment on column public.family_memberships.intro_seen_at is
  'When this member acknowledged the welcome intro. NULL = not shown yet. '
  'Only ever set for invited members; family creators never see the intro.';

-- Writing the marker goes through an RPC, NOT a widened UPDATE policy.
--
-- The family_memberships UPDATE policy (0024) is deliberately owner-only.
-- Adding "a member may update their own row" so they could write this one
-- column would also let them rewrite their own `role` — a viewer could
-- promote themselves to owner. This function is the whole permitted write:
-- it touches one column, on the caller's own rows, and cannot be pointed at
-- anyone else's membership.
create or replace function public.mark_family_intro_seen()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated integer;
begin
  if v_user_id is null then
    return jsonb_build_object('status', 'unauthenticated');
  end if;

  -- Idempotent: a second call (double tap, retry) finds nothing to update
  -- and keeps the original timestamp.
  update public.family_memberships
  set intro_seen_at = now()
  where user_id = v_user_id
    and intro_seen_at is null;

  get diagnostics v_updated = row_count;

  return jsonb_build_object('status', 'ok', 'updated', v_updated);
end;
$$;

revoke all on function public.mark_family_intro_seen() from public;
grant execute on function public.mark_family_intro_seen() to authenticated;

-- Deliberately NOT backfilled.
--
-- Marking every existing membership as "seen" would ship the intro dark:
-- the only invited members today joined during the broken-invite window and
-- are exactly the people who never got an explanation. Leaving the column
-- NULL shows them the intro once on their next visit. The cost of being
-- wrong is three skippable cards; the cost of backfilling is a feature that
-- reaches nobody. Revisit once there is a real invited-member base.
