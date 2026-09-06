import { describe, it, expect, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PushDelivery } from "@/types/database";
import { deliverPushNotifications, isPushQuietTime, localPushClock, pushCopy } from "@/lib/push";

afterEach(() => vi.unstubAllGlobals());
const now = new Date("2026-09-06T08:00:00Z");
const delivery: PushDelivery = { id: "delivery", device_id: "device", user_id: "user", family_id: "family", event_key: "daily:family:2026-09-06", kind: "daily", document_id: null, task_id: null, state: "sending", attempts: 1, retry_at: now.toISOString(), receipt_id: null, created_at: now.toISOString() };

function clientFor({ member = true, quiet = false, attempts = 1, due = true, eventKey = delivery.event_key } = {}) {
  const updates: Record<string, unknown>[] = [];
  const deletions: string[] = [];
  const client = {
    rpc: vi.fn().mockResolvedValue({ data: [{ ...delivery, attempts, event_key: eventKey }], error: null }),
    from: vi.fn((table: string) => {
      let mutation = false;
      const chain = {
        select: vi.fn(() => chain), eq: vi.fn(() => chain), lte: vi.fn(() => chain), or: vi.fn(() => chain),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        update: vi.fn((patch: Record<string, unknown>) => { updates.push(patch); mutation = true; return chain; }),
        delete: vi.fn(() => { deletions.push(table); mutation = true; return chain; }),
        maybeSingle: vi.fn().mockResolvedValue({ data: table === "push_devices" ? { id: "device", user_id: "user", token: "ExpoPushToken[test]", timezone: quiet ? "Pacific/Honolulu" : "Europe/Berlin" } : member ? { user_id: "user" } : null, error: null }),
        then: (resolve: (value: unknown) => void) => resolve({ error: null, data: mutation ? null : [], count: table === "tasks" && due ? 1 : 0 }),
      };
      return chain;
    }),
  } as unknown as SupabaseClient<Database>;
  return { client, updates, deletions };
}

describe("durable private push delivery", () => {
  it("uses local days and quiet hours across summer/winter time", () => {
    expect(localPushClock(new Date("2026-09-06T22:30:00Z"), "Europe/Berlin")).toEqual({ day: "2026-09-07", hour: 0 });
    expect(isPushQuietTime(new Date("2026-01-06T06:59:00Z"), "Europe/Berlin")).toBe(true);
    expect(isPushQuietTime(new Date("2026-01-06T07:00:00Z"), "Europe/Berlin")).toBe(false);
    expect(isPushQuietTime(new Date("2026-09-06T18:00:00Z"), "Europe/Berlin")).toBe(true);
  });
  it("never includes private document or task contents in notification copy", () => {
    expect(pushCopy("document_ready")).toEqual({ title: "Ordilo", body: "Ein Dokument ist bereit. Schau kurz auf das Wichtige." });
    expect(pushCopy("task_accepted").body).toContain("übernommen");
  });
  it("checks current membership before sending a queued notification", async () => {
    const fixture = clientFor({ member: false });
    const send = vi.fn(); vi.stubGlobal("fetch", send);
    await deliverPushNotifications(fixture.client, now);
    expect(send).not.toHaveBeenCalled();
    expect(fixture.deletions).toContain("push_deliveries");
  });
  it("defers quiet-hour notifications without consuming retries", async () => {
    const fixture = clientFor({ quiet: true });
    const send = vi.fn(); vi.stubGlobal("fetch", send);
    const result = await deliverPushNotifications(fixture.client, now);
    expect(send).not.toHaveBeenCalled();
    expect(result.deferred).toBe(1);
    expect(fixture.updates[0]).toMatchObject({ state: "pending", attempts: 0 });
  });
  it("checkpoints provider tickets rather than claiming delivery to the phone", async () => {
    const fixture = clientFor();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { status: "ok", id: "ticket" } }) }));
    expect((await deliverPushNotifications(fixture.client, now)).accepted).toBe(1);
    expect(fixture.updates[0]).toMatchObject({ state: "ticket", receipt_id: "ticket" });
  });
  it("retries a network failure and terminates after the retry budget", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const retry = clientFor(); await deliverPushNotifications(retry.client, now);
    expect(retry.updates[0]).toMatchObject({ state: "pending" });
    const exhausted = clientFor({ attempts: 8 }); await deliverPushNotifications(exhausted.client, now);
    expect(exhausted.updates[0]).toMatchObject({ state: "failed" });
  });
  it("withdraws reminders after the plan is handled or the local day has passed", async () => {
    const send = vi.fn(); vi.stubGlobal("fetch", send);
    const handled = clientFor({ due: false });
    await deliverPushNotifications(handled.client, now);
    const expired = clientFor({ eventKey: "daily:family:2026-09-05" });
    await deliverPushNotifications(expired.client, now);
    expect(send).not.toHaveBeenCalled();
    expect(handled.deletions).toContain("push_deliveries");
    expect(expired.deletions).toContain("push_deliveries");
  });
  it("removes invalid device tokens", async () => {
    const fixture = clientFor();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { status: "error", details: { error: "DeviceNotRegistered" } } }) }));
    await deliverPushNotifications(fixture.client, now);
    expect(fixture.deletions).toContain("push_devices");
  });
});
