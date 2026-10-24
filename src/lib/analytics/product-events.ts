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
// The day key comes from this device's clock; the database answers with
// the day it actually recorded, and the memo is only set when both agree.
let lastRecordedAppOpen: string | null = null;

/**
 * The memo's day. Without time zone data (some older engines) fall back to
 * the UTC day — the memo only saves round trips; the database decides the
 * real day, so the open is still recorded.
 */
function memoDay(now: Date): string {
  try {
    return berlinDay(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Record that the user opened the app today, so "aktiv" also counts
 * visits that trigger no other action (reading Heute, checking a date).
 * The record_app_open RPC and a unique index keep it to one row per user
 * and German calendar day, even with concurrent tabs. Resolves to whether
 * today's open is known to be recorded. Never throws.
 */
export async function recordDailyAppOpen(
  client: SupabaseClient<Database>,
  {
    familyId = null,
    platform = typeof window === "undefined" ? "unknown" : "web",
    now = new Date(),
  }: { familyId?: string | null; platform?: ProductPlatform; now?: Date } = {},
): Promise<boolean> {
  try {
    // Reads the local session — no network round trip.
    const {
      data: { session },
    } = await client.auth.getSession();
    const userId = session?.user.id;
    if (!userId) return false;

    const day = memoDay(now);
    const key = `${userId}:${day}`;
    if (lastRecordedAppOpen === key) return true;
    const { data, error } = await client.rpc("record_app_open", {
      p_family_id: familyId,
      p_platform: platform,
    });
    // Remember only when the database recorded *this device's* day. null
    // (setup not finished) or another day (clock skew around midnight)
    // means: ask again on the next open.
    if (!error && data === day) {
      lastRecordedAppOpen = key;
      return true;
    }
    return false;
  } catch {
    // Analytics must never block a user-facing action.
    return false;
  }
}

/** Test hook: forget the in-memory "already recorded today" marker. */
export function resetDailyAppOpenForTests(): void {
  lastRecordedAppOpen = null;
}
