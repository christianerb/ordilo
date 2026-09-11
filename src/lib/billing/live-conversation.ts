import "server-only";

import { getEffectiveEntitlement } from "./entitlements";

export const LIVE_CONVERSATION_MONTHLY_LIMIT = 10;
export const LIVE_CONVERSATION_MAX_DURATION_MS = 5 * 60 * 1_000;

/**
 * GPT Live is deliberately paid-only. The preview flag exists for local
 * device testing before a payment provider can create a real entitlement.
 * It is server-only and never trusts a client-supplied plan.
 */
export function isLiveConversationPreview(): boolean {
  return process.env.LIVE_CONVERSATION_PREVIEW === "1";
}

export async function hasLiveConversationAccess(
  familyId: string,
): Promise<boolean> {
  if (isLiveConversationPreview()) return true;
  const entitlement = await getEffectiveEntitlement(familyId);
  return entitlement !== null && entitlement.plan !== "free";
}
