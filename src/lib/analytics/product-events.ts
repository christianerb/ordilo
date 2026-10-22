import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * First-party product events used to measure activation without sending
 * document content, names, filenames, or email addresses to an external
 * analytics provider.
 */
export type ProductEventName =
  | "onboarding_entry_selected"
  | "document_result_viewed"
  | "document_next_step_selected"
  | "onboarding_started"
  | "onboarding_step_completed"
  | "onboarding_completed"
  | "onboarding_scan_started"
  | "document_upload_succeeded"
  | "document_upload_failed"
  | "document_confirmed"
  | "calendar_event_created"
  | "chat_answer_repair_started"
  | "chat_question_sent"
  | "live_conversation_ended"
  | "search_completed"
  | "task_created"
  | "task_completed"
  | "invite_created"
  | "invite_accepted"
  | "app_opened";

export type ProductPlatform = "web" | "ios" | "android" | "unknown";

/** Self-reported measurement metadata, never an authentication signal. */
export function productPlatformFromRequest(request: Request): ProductPlatform {
  const value = request.headers.get("x-ordilo-platform");
  if (value !== null) {
    return value === "web" || value === "ios" || value === "android" ? value : "unknown";
  }
  // Older native clients have a bearer token but no platform header.
  if (request.headers.has("authorization")) return "unknown";
  return request.headers.has("sec-fetch-site") ? "web" : "unknown";
}

export async function recordProductEvent(
  client: SupabaseClient<Database>,
  {
    userId,
    familyId = null,
    eventName,
    properties = {},
    platform = typeof window === "undefined" ? "unknown" : "web",
  }: {
    platform?: ProductPlatform;
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
      properties: { ...properties, platform },
    });
  } catch {
    // Analytics must never block a user-facing action.
  }
}

/**
 * Record that the user opened the app today — at most one event per user
 * and UTC day, so "aktiv" can count visits that trigger no other action
 * (reading Heute, checking a due date). Best effort, never throws.
 */
export async function recordDailyAppOpen(
  client: SupabaseClient<Database>,
  {
    familyId = null,
    platform = typeof window === "undefined" ? "unknown" : "web",
    now = new Date(),
  }: { familyId?: string | null; platform?: ProductPlatform; now?: Date } = {},
): Promise<void> {
  try {
    const {
      data: { session },
    } = await client.auth.getSession();
    const userId = session?.user.id;
    if (!userId) return;

    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const { data, error } = await client
      .from("product_events")
      .select("id")
      .eq("user_id", userId)
      .eq("event_name", "app_opened")
      .gte("occurred_at", dayStart.toISOString())
      .limit(1);
    if (error || (data && data.length > 0)) return;

    await recordProductEvent(client, {
      userId,
      familyId,
      eventName: "app_opened",
      platform,
    });
  } catch {
    // Analytics must never block a user-facing action.
  }
}
