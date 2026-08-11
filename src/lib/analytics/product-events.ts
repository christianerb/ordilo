import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * First-party product events used to measure activation without sending
 * document content, names, filenames, or email addresses to an external
 * analytics provider.
 */
export type ProductEventName =
  | "onboarding_started"
  | "onboarding_step_completed"
  | "onboarding_completed"
  | "onboarding_scan_started"
  | "document_upload_succeeded"
  | "document_confirmed"
  | "search_completed"
  | "chat_question_sent"
  | "task_created"
  | "task_completed"
  | "calendar_event_created";

export async function recordProductEvent(
  client: SupabaseClient<Database>,
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
