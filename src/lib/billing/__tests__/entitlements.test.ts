import { describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/admin";
import {
  getEffectiveEntitlement,
  resolveEffectivePlan,
  type StoredEntitlement,
} from "../entitlements";

type AdminClient = ReturnType<typeof createClient>;
const now = new Date("2026-09-08T12:00:00.000Z");
const base: StoredEntitlement = {
  plan: "plus",
  status: "active",
  trialEndsAt: null,
  currentPeriodEndsAt: null,
  graceEndsAt: null,
};

describe("resolveEffectivePlan", () => {
  it("resolves live trials to their paid plan and expired trials to free", () => {
    expect(
      resolveEffectivePlan(
        {
          ...base,
          status: "trialing",
          trialEndsAt: new Date("2026-09-09T00:00:00Z"),
        },
        now,
      ),
    ).toBe("plus");
    expect(
      resolveEffectivePlan(
        {
          ...base,
          status: "trialing",
          trialEndsAt: new Date("2026-09-08T12:00:00Z"),
        },
        now,
      ),
    ).toBe("free");
  });

  it("supports founding and time-bounded active subscriptions", () => {
    expect(
      resolveEffectivePlan(
        {
          ...base,
          plan: "founding",
          currentPeriodEndsAt: new Date("2026-10-01T00:00:00Z"),
        },
        now,
      ),
    ).toBe("founding");
    expect(
      resolveEffectivePlan(
        {
          ...base,
          currentPeriodEndsAt: new Date("2026-09-01T00:00:00Z"),
        },
        now,
      ),
    ).toBe("free");
  });

  it("never grants paid access to a malformed free-plan paid state", () => {
    expect(
      resolveEffectivePlan(
        {
          ...base,
          plan: "free",
          currentPeriodEndsAt: new Date("2026-10-01T00:00:00Z"),
        },
        now,
      ),
    ).toBe("free");
  });

  it("only keeps past-due access during an explicit grace period", () => {
    expect(
      resolveEffectivePlan(
        {
          ...base,
          status: "past_due",
          graceEndsAt: new Date("2026-09-09T00:00:00Z"),
        },
        now,
      ),
    ).toBe("plus");
    expect(
      resolveEffectivePlan({ ...base, status: "past_due" }, now),
    ).toBe("free");
  });

  it.each(["free", "canceled", "expired"] as const)(
    "resolves %s state to free",
    (status) => {
      expect(resolveEffectivePlan({ ...base, status }, now)).toBe("free");
    },
  );
});

describe("getEffectiveEntitlement", () => {
  it("uses the service-only resolver that does not depend on auth.uid", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        family_id: "10000000-0000-4000-a000-000000000001",
        plan: "free",
        status: "free",
        access_ends_at: null,
        limits: { document_processing: 10, chat_answer: 10 },
      },
      error: null,
    });
    const client = { rpc } as unknown as AdminClient;

    await expect(
      getEffectiveEntitlement(
        "10000000-0000-4000-a000-000000000001",
        now,
        client,
      ),
    ).resolves.toMatchObject({ plan: "free", limits: { chat_answer: 10 } });
    expect(rpc).toHaveBeenCalledWith("get_family_entitlement_admin", {
      p_family_id: "10000000-0000-4000-a000-000000000001",
      p_at: now.toISOString(),
    });
  });
});
