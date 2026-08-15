"use server";

import { createClient } from "@/lib/supabase/server";
import type { SimpleActionResult } from "@/lib/actions/result";

/**
 * Server action for the welcome intro (`/willkommen`).
 *
 * NOTE: "use server" modules may only export async functions.
 */

/**
 * Record that the signed-in member acknowledged the welcome intro.
 *
 * Writes through the `mark_family_intro_seen` RPC rather than an UPDATE on
 * `family_memberships`: the table's UPDATE policy is owner-only on purpose,
 * and widening it so members could write this column would also let them
 * rewrite their own `role`. The RPC touches one column on the caller's own
 * rows and nothing else.
 *
 * Idempotent — a repeat call keeps the original timestamp.
 */
export async function markWelcomeIntroSeen(): Promise<SimpleActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_family_intro_seen");

  if (error) {
    console.error("[welcome] mark intro seen RPC failed:", error);
    return {
      success: false,
      error: "Das hat gerade nicht geklappt. Bitte versuch es nochmal.",
    };
  }

  const status = (data as { status?: string } | null)?.status;
  if (status === "unauthenticated") {
    return {
      success: false,
      error: "Deine Anmeldung ist abgelaufen. Bitte lade die Seite neu.",
    };
  }

  return { success: true };
}
