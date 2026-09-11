import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getEntitlement: vi.fn() }));

vi.mock("../entitlements", () => ({
  getEffectiveEntitlement: (...args: unknown[]) =>
    mocks.getEntitlement(...args),
}));

import {
  hasLiveConversationAccess,
  LIVE_CONVERSATION_MAX_DURATION_MS,
  LIVE_CONVERSATION_MONTHLY_LIMIT,
} from "../live-conversation";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("live conversation entitlement", () => {
  it("keeps free families out and paid plans in", async () => {
    mocks.getEntitlement.mockResolvedValueOnce({ plan: "free" });
    await expect(hasLiveConversationAccess("family-1")).resolves.toBe(false);

    mocks.getEntitlement.mockResolvedValueOnce({ plan: "founding" });
    await expect(hasLiveConversationAccess("family-1")).resolves.toBe(true);
  });

  it("supports a server-only local preview override", async () => {
    vi.stubEnv("LIVE_CONVERSATION_PREVIEW", "1");
    await expect(hasLiveConversationAccess("family-1")).resolves.toBe(true);
    expect(mocks.getEntitlement).not.toHaveBeenCalled();
  });

  it("keeps the first cost envelope explicit", () => {
    expect(LIVE_CONVERSATION_MONTHLY_LIMIT).toBe(10);
    expect(LIVE_CONVERSATION_MAX_DURATION_MS).toBe(300_000);
  });
});
