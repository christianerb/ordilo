import { apiJson } from "./api";

/**
 * Explicit consent for third-party AI processing (Apple App Review
 * Guideline 5.1.2(i)).
 *
 * Before Ordilo transmits content to OpenAI (analysis, answers, voice) or
 * Datalab (OCR), the user must have actively agreed. The decision is
 * stored server-side in `user_consents` and enforced by every AI route;
 * this client reads and records it. `null` means the user has never been
 * asked — the app shows the consent sheet before the first scan,
 * question, or dictation.
 */

export type AiDataSharingStatus = "granted" | "declined" | null;

/** Error code returned by AI routes when no consent is on record. */
export const AI_CONSENT_REQUIRED_CODE = "AI_CONSENT_REQUIRED";

interface AiConsentResponse {
  ai_data_sharing?: unknown;
}

/** Accept only the two recorded decisions; anything else is "not asked". */
export function parseAiDataSharingStatus(raw: unknown): AiDataSharingStatus {
  return raw === "granted" || raw === "declined" ? raw : null;
}

/** Read the current decision. Throws an ApiError on network failure. */
export async function fetchAiDataSharingStatus(): Promise<AiDataSharingStatus> {
  const response = await apiJson<AiConsentResponse>("/api/me/ai-consent");
  return parseAiDataSharingStatus(response?.ai_data_sharing);
}

/** Record (or change) the decision. Throws an ApiError on failure. */
export async function recordAiDataSharingDecision(
  decision: "granted" | "declined",
): Promise<AiDataSharingStatus> {
  const response = await apiJson<AiConsentResponse>("/api/me/ai-consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision }),
  });
  return parseAiDataSharingStatus(response?.ai_data_sharing) ?? decision;
}
