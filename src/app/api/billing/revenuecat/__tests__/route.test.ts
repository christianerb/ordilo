import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/billing/events", () => ({
  recordBillingEvent: vi.fn(),
}));
vi.mock("@/lib/billing/revenuecat", () => ({
  syncRevenueCatEntitlement: vi.fn(),
}));

import { POST } from "@/app/api/billing/revenuecat/route";
import { recordBillingEvent } from "@/lib/billing/events";
import { syncRevenueCatEntitlement } from "@/lib/billing/revenuecat";
import { verifyRevenueCatSignature } from "@/lib/billing/revenuecat-webhook";
import { createClient as createAdminClient } from "@/lib/supabase/admin";

const SECRET = "webhook-secret";
const FAMILY_ID = "660e8400-e29b-41d4-a716-446655440001";

function signedRequest(payload: unknown): Request {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", SECRET)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return new Request("https://app.ordilo.de/api/billing/revenuecat", {
    method: "POST",
    headers: { "x-revenuecat-webhook-signature": `t=${timestamp},v1=${signature}` },
    body,
  });
}

function eventPayload(type = "RENEWAL") {
  return {
    api_version: "1.0",
    event: {
      id: "event-1",
      type,
      app_user_id: FAMILY_ID,
      event_timestamp_ms: Date.now(),
    },
  };
}

function mockFamilyLookup(result: { data: unknown; error: unknown }) {
  vi.mocked(createAdminClient).mockReturnValue({
    from: () => ({
      select: () => ({
        in: () => Promise.resolve(result),
      }),
    }),
  } as never);
}

describe("POST /api/billing/revenuecat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("REVENUECAT_WEBHOOK_SIGNING_SECRET", SECRET);
    vi.mocked(recordBillingEvent).mockResolvedValue(true);
    vi.mocked(syncRevenueCatEntitlement).mockResolvedValue({
      active: true,
      familyId: FAMILY_ID,
      status: "active",
    });
  });

  it("syncs the matched family after a valid signed event", async () => {
    mockFamilyLookup({ data: [{ id: FAMILY_ID }], error: null });

    const response = await POST(signedRequest(eventPayload()));

    expect(response.status).toBe(200);
    expect(recordBillingEvent).toHaveBeenCalledOnce();
    expect(syncRevenueCatEntitlement).toHaveBeenCalledWith(FAMILY_ID);
  });

  it("answers 503 without recording when the family lookup fails", async () => {
    // A transient Supabase error must stay retryable: recording the event
    // first would acknowledge it and the retry would be deduped away.
    mockFamilyLookup({ data: null, error: { code: "57014" } });

    const response = await POST(signedRequest(eventPayload()));

    expect(response.status).toBe(503);
    expect(recordBillingEvent).not.toHaveBeenCalled();
    expect(syncRevenueCatEntitlement).not.toHaveBeenCalled();
  });

  it("records TEST events without touching entitlements", async () => {
    mockFamilyLookup({ data: [{ id: FAMILY_ID }], error: null });

    const response = await POST(signedRequest(eventPayload("TEST")));

    expect(response.status).toBe(200);
    expect(recordBillingEvent).toHaveBeenCalledOnce();
    expect(syncRevenueCatEntitlement).not.toHaveBeenCalled();
  });
});

describe("verifyRevenueCatSignature", () => {
  it("accepts an untampered recent payload", () => {
    const body = '{"event":{"id":"event-1"}}';
    const secret = "webhook-secret";
    const timestamp = "1700000000";
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${body}`)
      .digest("hex");

    expect(
      verifyRevenueCatSignature(
        body,
        `t=${timestamp},v1=${signature}`,
        secret,
        1700000000,
      ),
    ).toBe(true);
  });

  it("rejects tampering and stale deliveries", () => {
    const secret = "webhook-secret";
    const timestamp = "1700000000";
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.original`)
      .digest("hex");

    expect(
      verifyRevenueCatSignature(
        "changed",
        `t=${timestamp},v1=${signature}`,
        secret,
        1700000000,
      ),
    ).toBe(false);
    expect(
      verifyRevenueCatSignature(
        "original",
        `t=${timestamp},v1=${signature}`,
        secret,
        1700000400,
      ),
    ).toBe(false);
  });
});
