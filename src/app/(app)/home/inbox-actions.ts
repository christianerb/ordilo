"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordProductEvent } from "@/lib/analytics/product-events";
import { FRIENDLY_ERROR, type SimpleActionResult } from "@/lib/actions/result";

/**
 * Deciding on what Ordilo found in an email.
 *
 * All three write through security-definer RPCs rather than table updates:
 * the proposal the family saw is the one that gets created, and membership is
 * checked inside the same transaction as the write.
 */

/** Accept a proposal — creates the calendar entry or the task. */
export async function acceptInboundSuggestion(
  suggestionId: string,
): Promise<SimpleActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Bitte melde dich an." };

  const { data: suggestion } = await supabase
    .from("inbound_suggestions")
    .select("kind, family_id")
    .eq("id", suggestionId)
    .maybeSingle();

  const { error } = await supabase.rpc("accept_inbound_suggestion", {
    p_suggestion_id: suggestionId,
  });
  if (error) return { success: false, error: FRIENDLY_ERROR };

  if (suggestion) {
    await recordProductEvent(supabase, {
      userId: user.id,
      familyId: suggestion.family_id,
      eventName:
        suggestion.kind === "calendar_event"
          ? "calendar_event_created"
          : "task_created",
      properties: { source: "inbound_email" },
    });
  }

  revalidatePath("/home");
  revalidatePath("/aufgaben");
  return { success: true };
}

/** Decline a proposal — it disappears and nothing is created. */
export async function dismissInboundSuggestion(
  suggestionId: string,
): Promise<SimpleActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("dismiss_inbound_suggestion", {
    p_suggestion_id: suggestionId,
  });
  if (error) return { success: false, error: FRIENDLY_ERROR };

  revalidatePath("/home");
  return { success: true };
}

/**
 * Answer "behalten oder löschen?". On delete, the stored copy of the email —
 * text, subject and sender — is erased in the same statement; anything the
 * family already accepted stays.
 */
export async function decideInboundEmailRetention(
  inboundEmailId: string,
  keep: boolean,
): Promise<SimpleActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_inbound_email_retention", {
    p_inbound_email_id: inboundEmailId,
    p_keep: keep,
  });
  if (error) return { success: false, error: FRIENDLY_ERROR };

  revalidatePath("/home");
  return { success: true };
}
