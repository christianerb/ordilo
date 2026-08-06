import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Resolve the signed-in user's family for server actions.
 *
 * Since migration 0024 the `families` SELECT policy exposes EVERY family
 * the user belongs to (owned or via family_memberships), so the previous
 * `.limit(1).maybeSingle()` lookup picked an arbitrary row for accounts
 * with multiple memberships — and mutations like addFamilyMember could
 * silently land in the wrong family.
 *
 * The app UI is single-family (there is no family switcher), so this
 * helper applies a deterministic rule instead of an arbitrary one:
 *   1. The OLDEST family the user owns (created_by = user) — this
 *      preserves the pre-memberships behavior for family creators.
 *   2. Otherwise the oldest family they are a member of (invite-only
 *      accounts).
 *
 * Callers that already know the active family (e.g. the chat route, which
 * authorizes a client-supplied family_id per request) must NOT use this
 * helper — they should bind writes to that explicit family id instead.
 *
 * @returns `{ data, error }` — `data` is null when the user has no family
 *          (or no session); `error` is a friendly German message on
 *          unexpected query failures.
 */
export async function resolveUserFamily(
  supabase: SupabaseClient<Database>,
): Promise<
  | { data: Pick<Database["public"]["Tables"]["families"]["Row"], "id" | "name">; error: null }
  | { data: null; error: string | null }
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: null };
  }

  const { data: families, error } = await supabase
    .from("families")
    .select("id, name, created_by, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return {
      data: null,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    };
  }

  const owned = (families ?? []).find((f) => f.created_by === user.id);
  const family = owned ?? families?.[0] ?? null;
  if (!family) {
    return { data: null, error: null };
  }

  return { data: { id: family.id, name: family.name }, error: null };
}
