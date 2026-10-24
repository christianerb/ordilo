import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { berlinDay } from "@/lib/berlin-date";

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
  | "task_completed";
// invite_created, invite_accepted and app_opened are written only by the
// database (triggers and record_app_open), never inserted by a client.

export type ProductPlatform = "web" | "ios" | "android" | "unknown";

/** The x-ordilo-platform header value, narrowed to a known platform. */
export function parseProductPlatform(value: string | null): ProductPlatform {
  return value === "web" || value === "ios" || value === "android" ? value : "unknown";
}

/** Self-reported measurement metadata, never an authentication signal. */
export function productPlatformFromRequest(request: Request): ProductPlatform {
  const value = request.headers.get("x-ordilo-platform");
  if (value !== null) return parseProductPlatform(value);
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

// In-memory only (no browser storage): skips the round trip after the
// first successful call of the day for this user within one page session.
// Keyed by user so a sign-out and a different sign-in still record.
// The day key comes from this device's clock and the database decides the
// real day. A clock a few minutes off only delays the next day's record
// until the device's own midnight — the day still gets recorded.
let lastRecordedAppOpen: string | null = null;

/**
 * Record that the user opened the app today, so "aktiv" also counts
 * visits that trigger no other action (reading Heute, checking a date).
 * The record_app_open RPC and a unique index keep it to one row per user
 * and German calendar day, even with concurrent tabs. Never throws.
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
    // Reads the local session — no network round trip.
    const {
      data: { session },
    } = await client.auth.getSession();
    const userId = session?.user.id;
    if (!userId) return;

    const key = `${userId}:${berlinDay(now)}`;
    if (lastRecordedAppOpen === key) return;
    const { data, error } = await client.rpc("record_app_open", {
      p_family_id: familyId,
      p_platform: platform,
    });
    // false: setup not finished yet — ask again on the next open.
    if (!error && data === true) lastRecordedAppOpen = key;
  } catch {
    // Analytics must never block a user-facing action.
  }
}

/** Test hook: forget the in-memory "already recorded today" marker. */
export function resetDailyAppOpenForTests(): void {
  lastRecordedAppOpen = null;
}
