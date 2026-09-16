import type { AiDataSharingStatus } from "@/lib/ai/consent";

/**
 * Browser counterpart of `src/lib/ai/consent.ts`.
 *
 * Explicit consent for third-party AI processing (Apple App Review
 * Guideline 5.1.2(i)): before Ordilo transmits content to OpenAI
 * (analysis, answers, voice) or Datalab (OCR), the user must have
 * actively agreed. The decision lives server-side in `user_consents`
 * and is enforced by every AI route; these helpers read and record it.
 * `null` means the user has never been asked — the app shows the
 * consent dialog before the first scan, question, or dictation.
 */

export type { AiDataSharingStatus };

/** Error code returned by AI routes when no consent is on record. */
export const AI_CONSENT_REQUIRED_CODE = "AI_CONSENT_REQUIRED";

/** Accept only the two recorded decisions; anything else is "not asked". */
export function parseAiDataSharingStatus(raw: unknown): AiDataSharingStatus {
  return raw === "granted" || raw === "declined" ? raw : null;
}

/** True when an API error body carries the consent-refusal code. */
export function isAiConsentRequiredBody(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { code?: unknown }).code === AI_CONSENT_REQUIRED_CODE
  );
}

interface AiConsentResponse {
  ai_data_sharing?: unknown;
}

/** Read the current decision. Throws an Error with a German message. */
export async function fetchAiDataSharingStatus(): Promise<AiDataSharingStatus> {
  const response = await fetch("/api/me/ai-consent", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      "Deine Einstellung konnte nicht geladen werden. Bitte versuch es nochmal.",
    );
  }
  const body = (await response.json().catch(() => null)) as AiConsentResponse | null;
  return parseAiDataSharingStatus(body?.ai_data_sharing);
}

/** Record (or change) the decision. Throws an Error with a German message. */
export async function recordAiDataSharingDecision(
  decision: "granted" | "declined",
): Promise<AiDataSharingStatus> {
  const response = await fetch("/api/me/ai-consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision }),
  });
  if (!response.ok) {
    throw new Error(
      "Deine Einstellung konnte nicht gespeichert werden. Bitte versuch es nochmal.",
    );
  }
  const body = (await response.json().catch(() => null)) as AiConsentResponse | null;
  return parseAiDataSharingStatus(body?.ai_data_sharing) ?? decision;
}
