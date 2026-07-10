import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Shared, client-agnostic Supabase helpers.
 *
 * These helpers encapsulate small query patterns that are repeated across
 * client components and server modules (e.g. resolving the current user's
 * family). They accept a {@link SupabaseClient} so they work with both the
 * browser client (`@/lib/supabase/client`) and the server client
 * (`@/lib/supabase/server`).
 */

/**
 * Resolve the family ID for the current user.
 *
 * Queries the `families` table for a single row (RLS scopes the query to
 * the current user's family) and returns its `id`, or `null` when the
 * user has no family, the query errors, or no row is found.
 *
 * @param client - A Supabase client (browser or server).
 * @returns The family ID, or null.
 */
export async function getFamilyId(
  client: SupabaseClient<Database>,
): Promise<string | null> {
  const { data, error } = await client
    .from("families")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data.id;
}
