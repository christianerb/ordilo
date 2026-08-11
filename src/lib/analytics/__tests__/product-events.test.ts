import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { recordProductEvent } from "@/lib/analytics/product-events";

describe("recordProductEvent", () => {
  it("writes metadata-only product events", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn(() => ({ insert })),
    } as unknown as SupabaseClient<Database>;

    await recordProductEvent(client, {
      userId: "user-1",
      familyId: "family-1",
      eventName: "onboarding_step_completed",
      properties: { step: "family_name" },
    });

    expect(client.from).toHaveBeenCalledWith("product_events");
    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1",
      family_id: "family-1",
      event_name: "onboarding_step_completed",
      properties: { step: "family_name" },
    });
  });

  it("does not interrupt the product flow when event collection fails", async () => {
    const client = {
      from: vi.fn(() => {
        throw new Error("database unavailable");
      }),
    } as unknown as SupabaseClient<Database>;

    await expect(
      recordProductEvent(client, {
        userId: "user-1",
        eventName: "onboarding_started",
      }),
    ).resolves.toBeUndefined();
  });
});
