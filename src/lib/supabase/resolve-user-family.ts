import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type FamilyRow = Database["public"]["Tables"]["families"]["Row"];

/** The family fields callers need (the middleware also reads the onboarding marker). */
export type ResolvedFamily = Pick<
  FamilyRow,
  "id" | "name" | "onboarding_completed_at"
>;

const QUERY_ERROR_MESSAGE =
  "Etwas ist schiefgelaufen. Bitte versuche es erneut.";

/**
 * Resolve the signed-in user's family deterministically.
 *
 * Since migration 0024 the `families` SELECT policy exposes EVERY family
 * the user belongs to (owned or via family_memberships), so the previous
 * `.limit(1).maybeSingle()` lookup picked an arbitrary row for accounts
 * with multiple memberships — and mutations like addFamilyMember could
 * silently land in the wrong family.
 *
 * The app UI is single-family (there is no family switcher), so this
 * helper applies a deterministic rule instead of an arbitrary one:
 *   1. The family the user OWNS (created_by = user). A unique index on
 *      families.created_by means there is at most one — this preserves
 *      the pre-memberships behavior for family creators.
 *   2. Otherwise the OLDEST MEMBERSHIP (family_memberships.created_at =
 *      when the user JOINED, not when the family was created) for
 *      invite-only accounts.
 *
 * Every read path that decides which family to DISPLAY must use the same
 * rule (the middleware and the page fallbacks do), otherwise the UI can
 * show one family while mutations land in another.
 *
 * Callers that already know the active family (e.g. the chat route, which
 * authorizes a client-supplied family_id per request) must NOT use this
 * helper — they should bind writes to that explicit family id instead.
 *
 * @param userId Pass the already-resolved user id to skip the internal
 *               `auth.getUser()` round-trip (e.g. in the middleware).
 * @returns `{ data, error }` — `data` is null when the user has no family
 *          (or no session); `error` is a friendly German message on
 *          unexpected query failures.
 */
export async function resolveUserFamily(
  supabase: SupabaseClient<Database>,
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
    return { data: owned, error: null };
  }

  // Invite-only account: oldest membership wins. Ordered by the
  // membership's created_at (when the user joined) — ordering
  // families.created_at instead would pick the family that has existed
  // longest, regardless of when the user became a member.
  const { data: membership, error: membershipError } = await supabase
    .from("family_memberships")
    .select("families(id, name, onboarding_completed_at)")
    .eq("user_id", uid)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return { data: null, error: QUERY_ERROR_MESSAGE };
  }

  // Many-to-one embed — a single object, guarded against the array shape
  // older postgrest-js typings produced.
  const embedded = membership?.families ?? null;
  const family = Array.isArray(embedded) ? (embedded[0] ?? null) : embedded;
  if (!family) {
    return { data: null, error: null };
  }

  return { data: family, error: null };
}
