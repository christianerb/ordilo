import "server-only";

import { recordLiveConversationEnded } from "@/lib/analytics/api-usage";
import { LIVE_CONVERSATION_MAX_DURATION_MS } from "@/lib/billing/live-conversation";

const SERVER_HANGUP_HEADROOM_MS = 30_000;

function signingSecret(): string {
  const secret = process.env.OPENAI_API_KEY;
  if (!secret) throw new Error("Live session control is unavailable");
  return secret;
}

/** End a provider session without trusting the browser to deliver session.close. */
export async function hangupLiveSession(
  sessionId: string,
  apiKey = signingSecret(),
): Promise<void> {
  const response = await fetch(
    `https://api.openai.com/v1/live/sessions/${encodeURIComponent(sessionId)}/hangup`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  );
  // Already-closed/unknown sessions are terminal too; only retryable provider
  // failures mean the hard stop was not established.
  if (!response.ok && ![404, 409, 410].includes(response.status)) {
    throw new Error(`GPT Live hangup failed (${response.status})`);
  }
}

type DeadlineResult = "setup_cancelled" | "limit";

async function waitForDeadline(
  signal: AbortSignal,
  milliseconds: number,
): Promise<DeadlineResult> {
  if (signal.aborted) return "setup_cancelled";
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve("setup_cancelled");
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve("limit");
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Keep the provider-side cost envelope authoritative. `after()` calls this
 * after the HTTP response; headroom covers session creation plus the final
 * hangup request inside the route's 300-second serverless execution window.
 * The same task observes a disconnected setup request, so stopping while the
 * SDP exchange is in flight closes an already-accepted provider session.
 */
export async function enforceLiveSessionLimit(input: {
  apiKey: string;
  operationId: string;
  requestSignal: AbortSignal;
  sessionId: string;
  userId: string;
  onSetupCancelled: () => Promise<void>;
  waitForDeadline?: (
    signal: AbortSignal,
    milliseconds: number,
  ) => Promise<DeadlineResult>;
}): Promise<void> {
  const reason = await (input.waitForDeadline ?? waitForDeadline)(
    input.requestSignal,
    LIVE_CONVERSATION_MAX_DURATION_MS - SERVER_HANGUP_HEADROOM_MS,
  );
  await hangupLiveSession(input.sessionId, input.apiKey);
  if (reason === "setup_cancelled") {
    await input.onSetupCancelled();
  }
  await recordLiveConversationEnded({
    operationId: input.operationId,
    durationMillis:
      reason === "limit" ? LIVE_CONVERSATION_MAX_DURATION_MS : 0,
    userId: input.userId,
  });
}
