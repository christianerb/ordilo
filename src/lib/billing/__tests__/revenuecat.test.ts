import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createClient: () => ({
    from: () => ({ upsert: mocks.upsert }),
    rpc: vi.fn(),
  }),
}));

import { syncRevenueCatEntitlement } from "../revenuecat";

const familyId = "10000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("REVENUECAT_SECRET_API_KEY", "secret");
  vi.stubEnv("REVENUECAT_ENTITLEMENT_ID", "plus");
  mocks.upsert.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("syncRevenueCatEntitlement", () => {
  it("stores an active family subscription from RevenueCat", async () => {
    const expires = new Date(Date.now() + 86_400_000).toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          subscriber: {
            entitlements: {
              plus: {
                expires_date: expires,
                grace_period_expires_date: null,
                product_identifier: "ordilo_plus_yearly",
              },
            },
            original_app_user_id: familyId,
            subscriptions: {
              ordilo_plus_yearly: {
                billing_issues_detected_at: null,
                expires_date: expires,
                grace_period_expires_date: null,
                period_type: "normal",
                store_transaction_id: "transaction-1",
                unsubscribe_detected_at: null,
              },
            },
          },
        }),
      ),
    );

    await expect(syncRevenueCatEntitlement(familyId)).resolves.toMatchObject({
      active: true,
      status: "active",
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        family_id: familyId,
        plan_code: "plus",
        provider: "revenuecat",
        provider_subscription_id: "transaction-1",
        status: "active",
      }),
      { onConflict: "family_id" },
    );
  });

  it("downgrades an expired entitlement without deleting family data", async () => {
    const expires = new Date(Date.now() - 86_400_000).toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          subscriber: {
            entitlements: {
              plus: {
                expires_date: expires,
                product_identifier: "ordilo_plus_monthly",
              },
            },
            original_app_user_id: familyId,
            subscriptions: {
              ordilo_plus_monthly: {
                expires_date: expires,
                period_type: "normal",
              },
            },
          },
        }),
      ),
    );

    await expect(syncRevenueCatEntitlement(familyId)).resolves.toMatchObject({
      active: false,
      status: "expired",
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ plan_code: "free", status: "expired" }),
      { onConflict: "family_id" },
    );
  });
});
