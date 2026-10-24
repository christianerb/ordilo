import { beforeEach, describe, expect, it, vi } from "vitest";
import * as berlinDate from "@/lib/berlin-date";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  parseProductPlatform,
  recordDailyAppOpen,
  recordProductEvent,
  productPlatformFromRequest,
  resetDailyAppOpenForTests,
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
  beforeEach(() => resetDailyAppOpenForTests());

  /** The RPC answers with the Berlin day it recorded (or null). */
  function makeClient(
    serverDay: { current: string | null } = { current: null },
    error: { message: string } | null = null,
    userId: string | null = "user-1",
  ) {
    const session = { current: userId };
    const rpc = vi.fn().mockImplementation(async () => ({ data: serverDay.current, error }));
    const client = {
      rpc,
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: session.current ? { user: { id: session.current } } : null },
        })),
      },
    } as unknown as SupabaseClient<Database>;
    return { client, rpc, session, serverDay };
  }

  it("records the open through the deduplicating RPC", async () => {
    const { client, rpc } = makeClient({ current: "2026-10-22" });
    await recordDailyAppOpen(client, { familyId: "family-1", now: new Date("2026-10-22T08:00:00Z") });
    expect(rpc).toHaveBeenCalledWith("record_app_open", {
      p_family_id: "family-1",
      p_platform: "web",
    });
  });

  it("skips the round trip for the rest of the Berlin day", async () => {
    const { client, rpc } = makeClient({ current: "2026-10-22" });
    await recordDailyAppOpen(client, { now: new Date("2026-10-22T08:00:00Z") });
    await recordDailyAppOpen(client, { now: new Date("2026-10-22T21:50:00Z") });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("asks again right away on a new Berlin day", async () => {
    const serverDay = { current: "2026-10-22" };
    const { client, rpc } = makeClient(serverDay);
    await recordDailyAppOpen(client, { now: new Date("2026-10-22T21:50:00Z") });
    serverDay.current = "2026-10-23";
    // 22:05 UTC is already the next day in Berlin (CEST).
    await recordDailyAppOpen(client, { now: new Date("2026-10-22T22:05:00Z") });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("keeps asking while a fast device clock is ahead of the server's day", async () => {
    // Device already says 23 Oct, the server still recorded 22 Oct.
    const serverDay = { current: "2026-10-22" };
    const { client, rpc } = makeClient(serverDay);
    await recordDailyAppOpen(client, { now: new Date("2026-10-22T22:00:30Z") });
    await recordDailyAppOpen(client, { now: new Date("2026-10-22T22:01:00Z") });
    expect(rpc).toHaveBeenCalledTimes(2);
    // Once the server agrees, the day is recorded and remembered.
    serverDay.current = "2026-10-23";
    await recordDailyAppOpen(client, { now: new Date("2026-10-22T22:02:00Z") });
    await recordDailyAppOpen(client, { now: new Date("2026-10-22T22:03:00Z") });
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it("still records a different person signing in on the same day", async () => {
    const { client, rpc, session } = makeClient({ current: "2026-10-22" });
    const now = new Date("2026-10-22T08:00:00Z");
    await recordDailyAppOpen(client, { now });
    session.current = "user-2";
    await recordDailyAppOpen(client, { now });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("asks again while setup is not finished (the RPC answers null)", async () => {
    const { client, rpc } = makeClient({ current: null });
    await recordDailyAppOpen(client);
    await recordDailyAppOpen(client);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("records nothing without a session", async () => {
    const { client, rpc } = makeClient({ current: "2026-10-22" }, null, null);
    await recordDailyAppOpen(client);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("retries later when the RPC failed", async () => {
    const { client, rpc } = makeClient({ current: null }, { message: "offline" });
    await recordDailyAppOpen(client);
    await recordDailyAppOpen(client);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("still records on engines without time zone data", async () => {
    const spy = vi.spyOn(berlinDate, "berlinDay").mockImplementation(() => {
      throw new RangeError("Invalid time zone specified: Europe/Berlin");
    });
    try {
      const { client, rpc } = makeClient({ current: "2026-10-22" });
      await recordDailyAppOpen(client);
      expect(rpc).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("never throws", async () => {
    const client = {
      auth: { getSession: vi.fn().mockRejectedValue(new Error("offline")) },
    } as unknown as SupabaseClient<Database>;
    await expect(recordDailyAppOpen(client)).resolves.toBeUndefined();
  });
});

describe("parseProductPlatform", () => {
  it("accepts only known platforms", () => {
    expect(parseProductPlatform("ios")).toBe("ios");
    expect(parseProductPlatform("android")).toBe("android");
    expect(parseProductPlatform("web")).toBe("web");
    expect(parseProductPlatform("macos")).toBe("unknown");
    expect(parseProductPlatform(null)).toBe("unknown");
  });
});
