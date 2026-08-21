import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * First-party product events — same table and event names as the web app
 * (src/lib/analytics/product-events.ts). No document content, names,
 * filenames, or email addresses are ever sent.
 */
export type ProductEventName =
  | "onboarding_started"
  | "onboarding_step_completed"
  | "onboarding_completed"
  | "onboarding_scan_started"
  | "document_upload_succeeded"
  | "document_confirmed"
  | "calendar_event_created"
  | "chat_question_sent"
  | "search_completed"
  | "task_created"
  | "task_completed";

export async function recordProductEvent(
  client: SupabaseClient,
  {
    userId,
    familyId = null,
    eventName,
    properties = {},
  }: {
    userId: string;
    familyId?: string | null;
    eventName: ProductEventName;
    properties?: Record<string, string | number | boolean | null>;
  },
): Promise<void> {
  try {
    await client.from("product_events").insert({
      user_id: userId,
      family_id: familyId,
      event_name: eventName,
      properties,
    });
  } catch {
    // Analytics must never block a user-facing action.
  }
}
