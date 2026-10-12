import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { recordProductEvent, productPlatformFromRequest } from "@/lib/analytics/product-events";

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
      properties: { step: "family_name", platform: "web" },
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


describe("product platform attribution", () => {
  it.each(["web", "ios", "android"] as const)("preserves explicit %s API attribution", (platform) => {
    expect(productPlatformFromRequest(new Request("https://ordilo.example/api", { headers: { "x-ordilo-platform": platform } }))).toBe(platform);
  });
  it("keeps old mobile clients and unsupported values unknown", () => {
    expect(productPlatformFromRequest(new Request("https://ordilo.example/api", { headers: { authorization: "Bearer test", "sec-fetch-site": "same-origin" } }))).toBe("unknown");
    expect(productPlatformFromRequest(new Request("https://ordilo.example/api", { headers: { "x-ordilo-platform": "device-name", "sec-fetch-site": "same-origin" } }))).toBe("unknown");
  });
  it("identifies browser requests without guessing an unmarked API client", () => {
    expect(productPlatformFromRequest(new Request("https://ordilo.example/api", { headers: { "sec-fetch-site": "same-origin" } }))).toBe("web");
    expect(productPlatformFromRequest(new Request("https://ordilo.example/api"))).toBe("unknown");
  });
  it("uses explicit server attribution and prevents property overrides", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient<Database>;
    await recordProductEvent(client, { userId: "user-1", eventName: "onboarding_started", platform: "ios", properties: { platform: "web", step: "start" } });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ properties: { platform: "ios", step: "start" } }));
  });
});
