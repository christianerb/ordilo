import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

/**
 * Shared building blocks for "use server" action modules
 * (familie, sammlungen, onboarding, invite).
 *
 * NOTE: This module itself has no "use server" directive — it exports
 * types and constants, which server-action files import. Only files with
 * the directive are restricted to async-function exports.
 */

/** Result envelope for actions that return data. */
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/** Result envelope for actions without a payload. */
export type SimpleActionResult =
  | { success: true }
  | { success: false; error: string };

/** Friendly German error used for unexpected failures. */
export const FRIENDLY_ERROR =
  "Etwas ist schiefgelaufen. Bitte versuche es erneut.";

type FamilyRow = Database["public"]["Tables"]["families"]["Row"];
type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Fetch the authenticated user's family (RLS-scoped — only returns the
 * family created_by the current user).
 *
 * @returns The family row, or null if the user has no family. `error`
 *          carries FRIENDLY_ERROR when the query itself failed.
 */
export async function getUserFamily(
  supabase: ServerClient,
): Promise<{
  data: Pick<FamilyRow, "id" | "name"> | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("families")
    .select("id, name")
    .limit(1)
    .maybeSingle();

  if (error) {
    return { data: null, error: FRIENDLY_ERROR };
  }
  return { data, error: null };
}
