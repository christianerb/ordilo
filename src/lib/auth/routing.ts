import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Determine the post-authentication destination for a user.
 *
 * A "first-time" user has no `families` row (RLS-scoped to the
 * authenticated user). They are routed to onboarding. A returning user
 * (one or more `families` rows) is routed to `/home`.
 *
 * @returns `/onboarding` for first-time users, `/home` for returning users.
 */
export async function getPostAuthDestination(
  supabase: SupabaseClient<Database>,
): Promise<{ destination: "/onboarding" | "/home"; isFirstTime: boolean }> {
  const { data, error } = await supabase
    .from("families")
    .select("id")
    .limit(1)
    .maybeSingle();

  // On error, treat as first-time so the user is not blocked — onboarding
  // is the safe default and will surface the issue if it persists.
  if (error || !data) {
    return { destination: "/onboarding", isFirstTime: true };
  }

  return { destination: "/home", isFirstTime: false };
}
