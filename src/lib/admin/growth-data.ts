import "server-only";
import { createClient } from "@/lib/supabase/admin";
import { parseStoredAttribution } from "@/lib/analytics/attribution";
import { listAllUsers } from "./platform-data";
import {
  summarizeGrowth,
  weekStart,
  type GrowthAccount,
  type GrowthEvent,
} from "./growth-metrics";

const DAY_MS = 24 * 60 * 60 * 1000;
const COHORT_WEEKS = 8;
const PAGE_SIZE = 1000;
const PAID_STATUSES = ["active", "past_due"];

async function listEventsSince(since: string): Promise<GrowthEvent[]> {
  const client = createClient();
  const events: GrowthEvent[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from("product_events")
      .select("user_id,event_name,occurred_at")
      .gte("occurred_at", since)
      .order("occurred_at")
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    events.push(...data);
    if (data.length < PAGE_SIZE) return events;
  }
}

/** Families that ever forwarded an email (with or without attachment). */
async function listForwardingFamilyIds(): Promise<Set<string>> {
  const client = createClient();
  const ids = new Set<string>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from("documents")
      .select("family_id")
      .eq("source", "email")
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data) ids.add(row.family_id);
    if (data.length < PAGE_SIZE) break;
  }
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from("inbound_emails")
      .select("family_id")
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data) ids.add(row.family_id);
    if (data.length < PAGE_SIZE) return ids;
  }
}

/**
 * Everything the "Wachstum" tab needs. Accounts, events, memberships and
 * entitlements are loaded once and summarized in growth-metrics.ts.
 */
export async function getGrowthOverview(days: 7 | 30 | 90) {
  const client = createClient();
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setUTCHours(0, 0, 0, 0);
  windowStart.setUTCDate(windowStart.getUTCDate() - days + 1);
  const cohortStart = new Date(weekStart(now.getTime()) - (COHORT_WEEKS - 1) * 7 * DAY_MS);
  const eventsSince = new Date(Math.min(windowStart.getTime(), cohortStart.getTime())).toISOString();

  const [users, events, memberships, entitlements, forwardingFamilies, familyCount] =
    await Promise.all([
      listAllUsers(),
      listEventsSince(eventsSince),
      client.from("family_memberships").select("family_id,user_id"),
      client.from("family_entitlements").select("family_id,status,plan_code,provider"),
      listForwardingFamilyIds(),
      client.from("families").select("id", { count: "exact", head: true }),
    ]);
  if (memberships.error) throw memberships.error;
  if (entitlements.error) throw entitlements.error;
  if (familyCount.error) throw familyCount.error;

  const paidFamilies = new Set<string>();
  const trialingFamilies = new Set<string>();
  for (const row of entitlements.data ?? []) {
    // Manual grants (e.g. 0090) have no provider and are not revenue.
    if (row.plan_code === "free" || !row.provider) continue;
    if (PAID_STATUSES.includes(row.status)) paidFamilies.add(row.family_id);
    else if (row.status === "trialing") trialingFamilies.add(row.family_id);
  }
  const payingUserIds = new Set(
    (memberships.data ?? [])
      .filter((membership) => paidFamilies.has(membership.family_id))
      .map((membership) => membership.user_id),
  );

  const accounts: GrowthAccount[] = users.map((user) => ({
    id: user.id,
    createdAt: user.created_at,
    attribution: parseStoredAttribution(user.user_metadata?.signup_attribution),
  }));

  return {
    ...summarizeGrowth({
      accounts,
      events,
      payingUserIds,
      since: windowStart.toISOString(),
      now,
      cohortWeeks: COHORT_WEEKS,
    }),
    familiesTotal: familyCount.count ?? 0,
    payingFamilies: paidFamilies.size,
    trialingFamilies: trialingFamilies.size,
    forwardingFamilies: forwardingFamilies.size,
  };
}
