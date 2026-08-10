import { resolveUserFamily } from "@/lib/supabase/resolve-user-family";

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

/**
 * Fetch the authenticated user's family using the app-wide deterministic
 * resolution rule: owned family first, then the oldest membership.
 *
 * @returns The family row, or null if the user has no family. `error`
 *          carries FRIENDLY_ERROR when a lookup fails.
 */
export async function getUserFamily(
  supabase: Parameters<typeof resolveUserFamily>[0],
) {
  return resolveUserFamily(supabase);
}
