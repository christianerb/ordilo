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

/**
 * Several consent providers can be mounted at once — the app root plus a
 * native-modal flow like the scan sheet. A decision recorded in one must
 * reach the others, or the next AI action after leaving the modal asks
 * again despite the consent stored on the server. Module scope, because
 * every provider shares the same server truth.
 */
const statusListeners = new Set<(status: AiDataSharingStatus) => void>();

/** Subscribe to consent statuses recorded by any mounted provider. */
export function subscribeAiConsentStatus(
  listener: (status: AiDataSharingStatus) => void,
): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

/** Broadcast a status change to every mounted consent provider. */
export function publishAiConsentStatus(status: AiDataSharingStatus): void {
  for (const listener of statusListeners) listener(status);
}

interface AiConsentResponse {
  ai_data_sharing?: unknown;
}

/** A slow consent read must never turn an AI action into a dead button. */
const AI_CONSENT_READ_TIMEOUT_MS = 5_000;

async function withReadTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("AI consent status read timed out")),
          AI_CONSENT_READ_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Accept only the two recorded decisions; anything else is "not asked". */
export function parseAiDataSharingStatus(raw: unknown): AiDataSharingStatus {
  return raw === "granted" || raw === "declined" ? raw : null;
}

/** Read the current decision. Throws an ApiError on network failure. */
export async function fetchAiDataSharingStatus(): Promise<AiDataSharingStatus> {
  const response = await withReadTimeout(
    apiJson<AiConsentResponse>("/api/me/ai-consent", {
      signal: AbortSignal.timeout(AI_CONSENT_READ_TIMEOUT_MS),
    }),
  );
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
