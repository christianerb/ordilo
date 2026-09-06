import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PushDelivery } from "@/types/database";
import { eventOccursOn, type CalendarEvent } from "@/lib/calendar";

type Client = SupabaseClient<Database>;
const SEND_URL = "https://exp.host/--/api/v2/push/send";
const RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

export function pushCopy(kind: PushDelivery["kind"]): { title: string; body: string } {
  const bodies: Record<PushDelivery["kind"], string> = {
    document_ready: "Ein Dokument ist bereit. Schau kurz auf das Wichtige.",
    document_failed: "Ein Dokument konnte noch nicht gelesen werden. In Ordilo kannst du es erneut versuchen.",
    task_assigned: "Eine Aufgabe wartet auf deine Übernahme. Schau kurz in euren Plan.",
    task_accepted: "Jemand aus deiner Familie hat eine Aufgabe übernommen.",
    daily: "In eurem Plan steht etwas an. Schau kurz nach Aufgaben und Terminen.",
  };
  return { title: "Ordilo", body: bodies[kind] };
}

export function localPushClock(date: Date, timezone: string): { day: string; hour: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(date);
  } catch { return localPushClock(date, "Europe/Berlin"); }
  const value = (key: string) => parts.find((part) => part.type === key)!.value;
  return { day: `${value("year")}-${value("month")}-${value("day")}`, hour: Number(value("hour")) };
}

/** Quiet nights; recomputed on every attempt so daylight saving changes remain correct. */
export function isPushQuietTime(date: Date, timezone: string): boolean {
  const { hour } = localPushClock(date, timezone);
  return hour < 8 || hour >= 20;
}

function headers(): HeadersInit {
  return { "Content-Type": "application/json", ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) };
}

/** Durable delivery is at-least-once; OS/provider acceptance is not a read receipt. */
export async function deliverPushNotifications(client: Client, now = new Date()) {
  const summary = { accepted: 0, failed: 0, deferred: 0, receipts: 0 };
  const { data: tickets, error: ticketError } = await client.from("push_deliveries").select("*")
    .eq("state", "ticket").lte("retry_at", now.toISOString()).limit(100);
  if (ticketError) throw new Error("Push receipts unavailable");
  if (tickets?.length) {
    const response = await fetch(RECEIPTS_URL, { method: "POST", headers: headers(), body: JSON.stringify({ ids: tickets.map((ticket) => ticket.receipt_id) }), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error("Push receipt provider unavailable");
    const result = await response.json() as { data?: Record<string, { status: string; details?: { error?: string } }> };
    for (const ticket of tickets) {
      const receipt = result.data?.[ticket.receipt_id ?? ""];
      if (!receipt) {
        // Receipt IDs expire at the provider; never leave a ticket pending forever.
        await client.from("push_deliveries").update({ state: now.getTime() - Date.parse(ticket.created_at) > 86_400_000 ? "failed" : "ticket", retry_at: new Date(now.getTime() + 900_000).toISOString() }).eq("id", ticket.id);
        continue;
      }
      if (receipt.details?.error === "DeviceNotRegistered") await client.from("push_devices").delete().eq("id", ticket.device_id).eq("user_id", ticket.user_id);
      const update = await client.from("push_deliveries").update({ state: receipt.status === "ok" ? "sent" : ticket.attempts >= 8 ? "failed" : "pending", receipt_id: null, retry_at: new Date(now.getTime() + 300_000).toISOString() }).eq("id", ticket.id);
      if (update.error) throw new Error("Push receipt checkpoint failed");
      summary.receipts++;
    }
  }
  const { data: deliveries, error } = await client.rpc("claim_push_deliveries", { p_limit: 10 });
  if (error) throw new Error("Push queue unavailable");
  for (const delivery of deliveries ?? []) {
    try {
      const [{ data: device, error: deviceError }, { data: membership, error: membershipError }] = await Promise.all([
        client.from("push_devices").select("*").eq("id", delivery.device_id).eq("user_id", delivery.user_id).maybeSingle(),
        client.from("family_memberships").select("user_id").eq("family_id", delivery.family_id).eq("user_id", delivery.user_id).maybeSingle(),
      ]);
      if (deviceError || membershipError) throw new Error("Push authorization lookup failed");
      if (!device || !membership) {
        await client.from("push_deliveries").delete().eq("id", delivery.id);
        continue;
      }
      if (isPushQuietTime(now, device.timezone)) {
        await client.from("push_deliveries").update({ state: "pending", attempts: Math.max(0, delivery.attempts - 1), retry_at: new Date(now.getTime() + 1_800_000).toISOString() }).eq("id", delivery.id);
        summary.deferred++;
        continue;
      }
      if (delivery.kind === "daily") {
        const { day } = localPushClock(now, device.timezone);
        if (delivery.event_key !== `daily:${delivery.family_id}:${day}` || !await familyNeedsReminder(client, delivery.family_id, day)) {
          await client.from("push_deliveries").delete().eq("id", delivery.id);
          continue;
        }
      }
      // Withdraw notifications whose subject was already handled or reassigned.
      if (delivery.document_id) {
        const { data: doc, error } = await client.from("documents").select("status").eq("id", delivery.document_id).eq("family_id", delivery.family_id).maybeSingle();
        if (error) throw error;
        const expected = delivery.kind === "document_ready" ? "analyzed" : "failed";
        if (!doc || doc.status !== expected) { await client.from("push_deliveries").delete().eq("id", delivery.id); continue; }
      }
      if (delivery.task_id) {
        const { data: task, error } = await client.from("tasks").select("status, assigned_to").eq("id", delivery.task_id).eq("family_id", delivery.family_id).maybeSingle();
        if (error) throw error;
        if (!task || task.status !== "open") { await client.from("push_deliveries").delete().eq("id", delivery.id); continue; }
        if (delivery.kind === "task_accepted") {
          const { data: acceptance, error } = await client.from("task_acceptances").select("member_id").eq("task_id", delivery.task_id).maybeSingle();
          if (error) throw error;
          if (!acceptance || acceptance.member_id !== task.assigned_to) { await client.from("push_deliveries").delete().eq("id", delivery.id); continue; }
        }
        if (delivery.kind === "task_assigned") {
          const { data: person, error } = await client.from("family_members").select("id").eq("id", task.assigned_to ?? "00000000-0000-0000-0000-000000000000").eq("linked_user_id", delivery.user_id).maybeSingle();
          if (error) throw error;
          if (!person) { await client.from("push_deliveries").delete().eq("id", delivery.id); continue; }
        }
      }
      const response = await fetch(SEND_URL, { method: "POST", headers: headers(), signal: AbortSignal.timeout(15_000), body: JSON.stringify({
        to: device.token, ...pushCopy(delivery.kind), sound: null, channelId: "default", ttl: 86_400,
        data: { familyId: delivery.family_id, documentId: delivery.document_id, taskId: delivery.task_id, notificationId: delivery.id },
      }) });
      if (!response.ok) throw new Error("Push provider unavailable");
      const result = await response.json() as { data?: { status: string; id?: string; details?: { error?: string } } };
      if (result.data?.details?.error === "DeviceNotRegistered") {
        await client.from("push_devices").delete().eq("id", device.id).eq("user_id", delivery.user_id);
        summary.failed++;
        continue;
      }
      if (result.data?.status !== "ok" || !result.data.id) throw new Error("Push rejected");
      const checkpoint = await client.from("push_deliveries").update({ state: "ticket", receipt_id: result.data.id, retry_at: new Date(now.getTime() + 900_000).toISOString() }).eq("id", delivery.id);
      if (checkpoint.error) throw new Error("Push checkpoint failed");
      summary.accepted++;
    } catch {
      const result = await client.from("push_deliveries").update({ state: delivery.attempts >= 8 ? "failed" : "pending", retry_at: new Date(now.getTime() + Math.min(3600, 30 * 2 ** delivery.attempts) * 1000).toISOString() }).eq("id", delivery.id);
      if (result.error) throw new Error("Push retry checkpoint failed");
      summary.failed++;
    }
  }
  return summary;
}

/** A single useful morning reminder per family/device/local day, including recurring events. */
export async function queueDailyPushNotifications(client: Client, now = new Date()): Promise<number> {
  let queued = 0;
  for (let offset = 0; ; offset += 500) {
    const { data: devices, error } = await client.from("push_devices").select("*").order("id").range(offset, offset + 499);
    if (error) throw new Error("Device query failed");
    for (const device of devices ?? []) {
      const { day, hour } = localPushClock(now, device.timezone);
      if (hour < 8 || hour >= 20) continue;
      const { data: memberships, error } = await client.from("family_memberships").select("family_id").eq("user_id", device.user_id);
      if (error) throw new Error("Membership query failed");
      for (const membership of memberships ?? []) {
        if (!await familyNeedsReminder(client, membership.family_id, day)) continue;
        const result = await client.from("push_deliveries").upsert({ device_id: device.id, user_id: device.user_id, family_id: membership.family_id, event_key: `daily:${membership.family_id}:${day}`, kind: "daily" }, { onConflict: "device_id,event_key", ignoreDuplicates: true });
        if (result.error) throw new Error("Reminder enqueue failed");
        queued++;
      }
    }
    if (!devices || devices.length < 500) break;
  }
  return queued;
}

async function familyNeedsReminder(client: Client, familyId: string, day: string): Promise<boolean> {
  const tomorrow = new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const [{ count, error: tasksError }, { data: events, error: eventsError }] = await Promise.all([
    client.from("tasks").select("id", { count: "exact", head: true }).eq("family_id", familyId).eq("confirmed", true).eq("status", "open").lte("due_date", tomorrow),
    client.from("calendar_events").select("*").eq("family_id", familyId).lte("starts_on", tomorrow).or(`ends_on.gte.${day},recurrence.neq.none`),
  ]);
  if (tasksError || eventsError) throw new Error("Reminder query failed");
  return Boolean(count) || (events ?? []).some((event) => [day, tomorrow].some((date) => eventOccursOn({ ...event, recurrence: event.recurrence as CalendarEvent["recurrence"] }, date)));
}
