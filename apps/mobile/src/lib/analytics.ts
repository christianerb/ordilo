import { getProductPlatform } from "./event-platform";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

/**
 * First-party product events — same table and event names as the web app
 * (src/lib/analytics/product-events.ts). No document content, names,
 * filenames, or email addresses are ever sent.
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
      properties: { ...properties, platform: getProductPlatform() },
    });
  } catch {
    // Analytics must never block a user-facing action.
  }
}

/**
 * Quality signal for the scan pipeline: a failure the documents table can
 * never show, because a failed upload leaves no row. Stage, reason, and
 * source are coarse codes (`upload`/`ocr`/`analysis`, `network`/`server`/...,
 * `mobile_scan`) so the admin view can slice without a single byte of
 * document content. The source matches the one on the success event, so
 * the failure rate compares attempts from the same surface.
 *
 * Best effort; a retry or the failure screen never waits for analytics.
 */
export async function recordScanFailure({
  familyId,
  stage,
  reason,
}: {
  familyId: string | null;
  stage: string;
  reason: string;
}): Promise<void> {
  try {
    const client = getSupabase();
    const { data } = await client.auth.getUser();
    if (!data.user) return;
    await recordProductEvent(client, {
      userId: data.user.id,
      familyId,
      eventName: "document_upload_failed",
      properties: { stage, reason, source: "mobile_scan" },
    });
  } catch {
    // Analytics must never block a user-facing action.
  }
}

/**
 * Record the activation funnel start after a successful code login.
 *
 * Port of the web login form (src/app/(auth)/login/login-form.tsx) and
 * its getPostAuthDestination helper: a user with no visible `families`
 * row is first-time and enters onboarding. A query error counts as
 * first-time there (onboarding is the safe default) — same here.
 *
 * Only the plain login path calls this; invite joins are never
 * first-time (the web callback fixes isFirstTime=false for them).
 */
export async function recordOnboardingStartedIfFirstTime(
  client: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    const { data, error } = await client
      .from("families")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (error || !data) {
      await recordProductEvent(client, {
        userId,
        eventName: "onboarding_started",
      });
    }
  } catch {
    // Analytics must never block login.
  }
}

// In-memory only: the root layout calls this on every foreground, so skip
// the round trip once today's open was recorded for this user in this app
// session. Keyed by user so a sign-out and a different sign-in still
// record.
// The day key comes from this device's clock and the database decides the
// real day. A clock a few minutes off only delays the next day's record
// until the device's own midnight — the day still gets recorded.
let lastRecordedAppOpen: string | null = null;

// The mobile package cannot import the web's src/lib/berlin-date.ts; this
// day is only the memo key — the database index decides the real day.
let berlinDayFormatter: Intl.DateTimeFormat | null = null;

function berlinDay(now: Date): string {
  try {
    berlinDayFormatter ??= new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    // Built from parts: the joined format differs between engines.
    const parts: Record<string, string> = {};
    for (const part of berlinDayFormatter.formatToParts(now)) parts[part.type] = part.value;
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    // No time zone data: the memo key is only an optimization; the
    // database decides the real day.
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Record that the app was opened today. The record_app_open RPC and a
 * unique index keep it to one row per user and German calendar day (same
 * as the web, src/lib/analytics/product-events.ts). Never throws.
 */
export async function recordDailyAppOpen(
  familyId: string | null,
  now: Date = new Date(),
): Promise<void> {
  try {
    const client = getSupabase();
    // Reads the stored session — no network round trip.
    const {
      data: { session },
    } = await client.auth.getSession();
    const userId = session?.user.id;
    if (!userId) return;

    const key = `${userId}:${berlinDay(now)}`;
    if (lastRecordedAppOpen === key) return;
    const { data, error } = await client.rpc("record_app_open", {
      p_family_id: familyId,
      p_platform: getProductPlatform(),
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
