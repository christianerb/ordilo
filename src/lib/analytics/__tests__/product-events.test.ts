import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  recordDailyAppOpen,
  recordProductEvent,
  productPlatformFromRequest,
} from "@/lib/analytics/product-events";

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

describe("recordDailyAppOpen", () => {
  function makeClient({
    userId = "user-1",
    alreadyToday = false,
    lookupError = null,
  }: {
    userId?: string | null;
    alreadyToday?: boolean;
    lookupError?: { message: string } | null;
  } = {}) {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const lookup: Record<string, ReturnType<typeof vi.fn>> = {};
    lookup.select = vi.fn(() => lookup);
    lookup.eq = vi.fn(() => lookup);
    lookup.gte = vi.fn(() => lookup);
    lookup.limit = vi.fn(async () => ({
      data: alreadyToday ? [{ id: "event-1" }] : [],
      error: lookupError,
    }));
    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: userId ? { user: { id: userId } } : null },
        })),
      },
      from: vi.fn(() => ({ ...lookup, insert })),
    } as unknown as SupabaseClient<Database>;
    return { client, insert, lookup };
  }

  it("records the first open of the UTC day", async () => {
    const { client, insert, lookup } = makeClient();
    await recordDailyAppOpen(client, {
      familyId: "family-1",
      now: new Date("2026-10-22T09:30:00Z"),
    });
    expect(lookup.gte).toHaveBeenCalledWith("occurred_at", "2026-10-22T00:00:00.000Z");
    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1",
      family_id: "family-1",
      event_name: "app_opened",
      properties: { platform: "web" },
    });
  });

  it("writes nothing when today's open is already recorded", async () => {
    const { client, insert } = makeClient({ alreadyToday: true });
    await recordDailyAppOpen(client, { familyId: "family-1" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("writes nothing without a session or when the lookup fails", async () => {
    const signedOut = makeClient({ userId: null });
    await recordDailyAppOpen(signedOut.client);
    expect(signedOut.insert).not.toHaveBeenCalled();

    const failing = makeClient({ lookupError: { message: "boom" } });
    await recordDailyAppOpen(failing.client);
    expect(failing.insert).not.toHaveBeenCalled();
  });

  it("never throws", async () => {
    const client = {
      auth: { getSession: vi.fn().mockRejectedValue(new Error("offline")) },
    } as unknown as SupabaseClient<Database>;
    await expect(recordDailyAppOpen(client)).resolves.toBeUndefined();
  });
});
