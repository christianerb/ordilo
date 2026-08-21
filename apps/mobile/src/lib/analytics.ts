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
