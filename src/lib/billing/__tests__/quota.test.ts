import { describe, expect, it, vi } from "vitest";
import {
  billingEntitlementsEnabled,
  releaseMonthlyUsage,
  reserveMonthlyUsage,
} from "../quota";
import { createClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createClient>;
const familyId = "10000000-0000-4000-a000-000000000001";

describe("reserveMonthlyUsage", () => {
  it("passes a stable operation key and returns boundary decisions", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        allowed: false,
        duplicate: false,
        plan: "free",
        metric: "chat_answer",
        used: 10,
        limit: 10,
        period_start: "2026-09-01",
        period_end: "2026-10-01",
      },
      error: null,
    });
    const client = { rpc } as unknown as AdminClient;

    await expect(
      reserveMonthlyUsage(
        {
          familyId,
          metric: "chat_answer",
          operationKey: "conversation:message",
          at: new Date("2026-09-08T12:00:00Z"),
        },
        client,
      ),
    ).resolves.toMatchObject({ allowed: false, used: 10, limit: 10 });
    expect(rpc).toHaveBeenCalledWith("reserve_family_usage", {
      p_family_id: familyId,
      p_metric_code: "chat_answer",
      p_amount: 1,
      p_operation_key: "conversation:message",
      p_at: "2026-09-08T12:00:00.000Z",
    });
  });

  it("preserves the database idempotency result", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        allowed: true,
        duplicate: true,
        plan: "plus",
        metric: "document_processing",
        used: 4,
        limit: null,
        period_start: "2026-09-01",
        period_end: "2026-10-01",
      },
      error: null,
    });
    const client = { rpc } as unknown as AdminClient;
    await expect(
      reserveMonthlyUsage(
        {
          familyId,
          metric: "document_processing",
          operationKey: "upload-key",
        },
        client,
      ),
    ).resolves.toMatchObject({ allowed: true, duplicate: true, limit: null });
  });

  it("releases failed operations through the atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const client = { rpc } as unknown as AdminClient;
    await expect(
      releaseMonthlyUsage(
        {
          familyId,
          metric: "chat_answer",
          operationKey: "chat-operation",
          at: new Date("2026-09-08T12:00:00Z"),
        },
        client,
      ),
    ).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("release_family_usage", {
      p_family_id: familyId,
      p_metric_code: "chat_answer",
      p_operation_key: "chat-operation",
      p_at: "2026-09-08T12:00:00.000Z",
    });
  });

  it("only enables enforcement for the exact server flag value", () => {
    const previous = process.env.BILLING_ENTITLEMENTS_ENABLED;
    process.env.BILLING_ENTITLEMENTS_ENABLED = "1";
    expect(billingEntitlementsEnabled()).toBe(true);
    process.env.BILLING_ENTITLEMENTS_ENABLED = "true";
    expect(billingEntitlementsEnabled()).toBe(false);
    process.env.BILLING_ENTITLEMENTS_ENABLED = previous;
  });
});
