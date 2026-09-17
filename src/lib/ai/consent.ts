import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient as createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

/**
 * Explicit consent for third-party AI processing (Apple App Review
 * Guideline 5.1.2(i)).
 *
 * Before Ordilo transmits user content to OpenAI (analysis, chat, voice,
 * live conversation, embeddings) or Datalab (OCR), the user must have
 * actively agreed. The decision lives in `user_consents` (migration 0086);
 * every API route and every background job that would otherwise call a
 * third-party AI checks it here.
 *
 * Fail closed: when the lookup itself errors, no external AI call is made
 * and the route answers 503 — the same posture as the billing entitlement
 * check.
 */

export const AI_CONSENT_REQUIRED_CODE = "AI_CONSENT_REQUIRED";
export const AI_CONSENT_CHECK_UNAVAILABLE_CODE =
  "AI_CONSENT_CHECK_UNAVAILABLE";

export const AI_CONSENT_REQUIRED_MESSAGE =
  "Ordilo darf Inhalte erst an KI-Dienste (OpenAI, Datalab) übertragen, wenn du ausdrücklich zugestimmt hast.";

export const AI_CONSENT_CHECK_UNAVAILABLE_MESSAGE =
  "Deine Einwilligung konnte gerade nicht geprüft werden. Bitte versuch es gleich noch einmal.";

export type AiDataSharingStatus = "granted" | "declined" | null;

type ConsentClient = SupabaseClient<Database>;

/**
 * Read the recorded decision. `null` means the user has never been asked.
 * Throws on database errors — callers decide how to fail.
 */
export async function getAiDataSharingStatus(
  userId: string,
  client?: ConsentClient,
): Promise<AiDataSharingStatus> {
  const supabase = client ?? createAdminClient();
  const { data, error } = await supabase
    .from("user_consents")
    .select("ai_data_sharing")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.ai_data_sharing ?? null;
}

/**
 * Boolean variant for background contexts (job worker, inbound email)
 * where there is no HTTP response to shape. Fails closed: an unreadable
 * consent row means no third-party AI call.
 */
export async function hasAiDataSharingConsent(
  userId: string,
  client?: ConsentClient,
): Promise<boolean> {
  try {
    return (await getAiDataSharingStatus(userId, client)) === "granted";
  } catch (err) {
    console.error("[consent] KI-Einwilligung konnte nicht geprüft werden:", err);
    return false;
  }
}

/**
 * Guard for API routes. Returns `null` when the user has explicitly
 * granted consent; otherwise the Response the route must return
 * immediately — 403 AI_CONSENT_REQUIRED when the decision is missing or
 * declined (clients then show the consent sheet), 503 when the lookup
 * itself failed.
 */
export async function refuseWithoutAiConsent(
  userId: string,
): Promise<Response | null> {
  let status: AiDataSharingStatus;
  try {
    status = await getAiDataSharingStatus(userId);
  } catch (err) {
    console.error("[consent] KI-Einwilligung konnte nicht geprüft werden:", err);
    return Response.json(
      {
        error: AI_CONSENT_CHECK_UNAVAILABLE_MESSAGE,
        code: AI_CONSENT_CHECK_UNAVAILABLE_CODE,
      },
      { status: 503 },
    );
  }
  if (status === "granted") return null;
  return Response.json(
    { error: AI_CONSENT_REQUIRED_MESSAGE, code: AI_CONSENT_REQUIRED_CODE },
    { status: 403 },
  );
}
