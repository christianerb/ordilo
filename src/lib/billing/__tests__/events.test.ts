import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/admin";
import { recordBillingEvent } from "../events";

type AdminClient = ReturnType<typeof createClient>;

describe("recordBillingEvent", () => {
  it("hashes payloads and returns whether the ledger inserted", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    const client = { rpc } as unknown as AdminClient;
    const input = {
      provider: "example",
      providerEventId: "evt_1",
      eventType: "subscription.updated",
      rawPayload: '{"id":"evt_1"}',
    };

    await expect(recordBillingEvent(input, client)).resolves.toBe(true);
    await expect(recordBillingEvent(input, client)).resolves.toBe(false);
    expect(rpc).toHaveBeenCalledWith("record_billing_event", {
      p_provider: "example",
      p_provider_event_id: "evt_1",
      p_event_type: "subscription.updated",
      p_family_id: null,
      p_payload_sha256: createHash("sha256")
        .update(input.rawPayload)
        .digest("hex"),
      p_occurred_at: null,
    });
  });
});
