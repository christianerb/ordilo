import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Family resolution for the mobile app — a 1:1 port of
 * src/lib/supabase/resolve-user-family.ts from the web app. The rule must
 * stay identical on both platforms: owned family first (at most one row,
 * created_by is unique), otherwise the OLDEST membership (when the user
 * joined, not when the family was created).
 */

export interface ResolvedFamily {
  id: string;
  name: string;
  onboarding_completed_at: string | null;
  /** True when the user CREATED this family, false when they JOINED it. */
  isOwner: boolean;
  /**
   * When this member acknowledged the welcome intro; null = pending.
   * Always null for owners — read through needsWelcomeIntro.
   */
  introSeenAt: string | null;
}

const QUERY_ERROR_MESSAGE =
  "Etwas ist schiefgelaufen. Bitte versuche es erneut.";

/**
 * Whether the signed-in user may pass the onboarding gate.
 *
 * `onboarding_completed_at` records the CREATOR's setup run. Someone who
 * accepted an invite has nothing to set up — judging them by the creator's
 * marker would bounce them into a half-finished flow that is not theirs.
 */
export function isOnboardingComplete(family: ResolvedFamily | null): boolean {
  if (!family) return false;
  if (!family.isOwner) return true;
  return !!family.onboarding_completed_at;
}

/**
 * Whether to show the short welcome intro before the app itself.
 * Only invited members ever see it — creators met Ordilo during setup.
 */
export function needsWelcomeIntro(family: ResolvedFamily | null): boolean {
  if (!family) return false;
  if (family.isOwner) return false;
  return !family.introSeenAt;
}

/**
 * Resolve the signed-in user's family deterministically.
 *
 * @returns `{ data, error }` — `data` is null when the user has no family;
 *          `error` is a friendly German message on query failures.
 */
export async function resolveUserFamily(
  supabase: SupabaseClient,
  userId?: string,
): Promise<
  | { data: ResolvedFamily; error: null }
  | { data: null; error: string | null }
> {
  let uid = userId ?? null;
  if (!uid) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { data: null, error: null };
    }
    uid = user.id;
  }

  // Owned family first (at most one row — created_by is unique).
  const { data: owned, error: ownedError } = await supabase
    .from("families")
    .select("id, name, onboarding_completed_at")
    .eq("created_by", uid)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (ownedError) {
    return { data: null, error: QUERY_ERROR_MESSAGE };
  }
  if (owned) {
    // Owners never see the welcome intro, so its marker is not read here.
    return {
      data: { ...owned, isOwner: true, introSeenAt: null } as ResolvedFamily,
      error: null,
    };
  }

  // Invite-only account: oldest membership wins (when the user JOINED).
  const { data: membership, error: membershipError } = await supabase
    .from("family_memberships")
    .select("intro_seen_at, families(id, name, onboarding_completed_at)")
    .eq("user_id", uid)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return { data: null, error: QUERY_ERROR_MESSAGE };
  }

  // Many-to-one embed — a single object, guarded against the array shape
  // older postgrest-js typings produced.
  const embedded = (membership as { families?: unknown } | null)?.families ?? null;
  const family = (
    Array.isArray(embedded) ? (embedded[0] ?? null) : embedded
  ) as Pick<ResolvedFamily, "id" | "name" | "onboarding_completed_at"> | null;
  if (!family) {
    return { data: null, error: null };
  }

  return {
    data: {
      ...family,
      isOwner: false,
      introSeenAt:
        (membership as { intro_seen_at?: string | null } | null)
          ?.intro_seen_at ?? null,
    },
    error: null,
  };
}
