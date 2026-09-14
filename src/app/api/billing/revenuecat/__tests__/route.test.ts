import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyRevenueCatSignature } from "@/lib/billing/revenuecat-webhook";

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
