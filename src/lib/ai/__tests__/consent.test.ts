import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createClient: () => ({
    from: vi.fn((table: string) => {
      if (table !== "user_consents") {
        throw new Error(`unexpected table: ${table}`);
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn((column: string, value: string) => {
            expect(column).toBe("user_id");
            expect(typeof value).toBe("string");
            return { maybeSingle: mocks.maybeSingle };
          }),
        })),
      };
    }),
  }),
}));

import {
  AI_CONSENT_CHECK_UNAVAILABLE_CODE,
  AI_CONSENT_REQUIRED_CODE,
  AI_CONSENT_REQUIRED_MESSAGE,
  getAiDataSharingStatus,
  hasAiDataSharingConsent,
  refuseWithoutAiConsent,
} from "@/lib/ai/consent";

const USER_ID = "user-1";

describe("AI data-sharing consent (Apple 5.1.2(i))", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns null from the route guard when consent was granted", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { ai_data_sharing: "granted" },
      error: null,
    });

    await expect(refuseWithoutAiConsent(USER_ID)).resolves.toBeNull();
    await expect(getAiDataSharingStatus(USER_ID)).resolves.toBe("granted");
    await expect(hasAiDataSharingConsent(USER_ID)).resolves.toBe(true);
  });

  it("refuses with 403 AI_CONSENT_REQUIRED when consent was declined", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { ai_data_sharing: "declined" },
      error: null,
    });

    const refusal = await refuseWithoutAiConsent(USER_ID);
    expect(refusal).not.toBeNull();
    expect(refusal!.status).toBe(403);
    expect(await refusal!.json()).toEqual({
      error: AI_CONSENT_REQUIRED_MESSAGE,
      code: AI_CONSENT_REQUIRED_CODE,
    });
    await expect(hasAiDataSharingConsent(USER_ID)).resolves.toBe(false);
  });

  it("refuses when the user was never asked (no row)", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    const refusal = await refuseWithoutAiConsent(USER_ID);
    expect(refusal!.status).toBe(403);
    expect((await refusal!.json()).code).toBe(AI_CONSENT_REQUIRED_CODE);
    await expect(getAiDataSharingStatus(USER_ID)).resolves.toBeNull();
  });

  it("fails closed with 503 when the consent lookup itself fails", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "db down" },
    });

    const refusal = await refuseWithoutAiConsent(USER_ID);
    expect(refusal!.status).toBe(503);
    expect((await refusal!.json()).code).toBe(
      AI_CONSENT_CHECK_UNAVAILABLE_CODE,
    );
    // The boolean background variant must fail closed as well.
    await expect(hasAiDataSharingConsent(USER_ID)).resolves.toBe(false);
  });
});
