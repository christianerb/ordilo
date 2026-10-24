import "server-only";
import { createClient } from "@/lib/supabase/admin";
import { parseStoredAttribution } from "@/lib/analytics/attribution";
import { startOfBerlinDayBefore } from "@/lib/berlin-date";
import { fetchAllRows } from "./paginate";
import { listAllUsers } from "./platform-data";
import {
  cohortWeekStarts,
  summarizeFamilyBilling,
  summarizeGrowth,
  GROWTH_EVENT_NAMES,
  parseGrowthEventDays,
  type GrowthAccount,
} from "./growth-metrics";

const COHORT_WEEKS = 8;
/** Family ids per `in` filter, so the request URL stays short. */
const FAMILY_ID_CHUNK = 100;

/** Accounts that belong to any of these families. */
async function listMemberIds(familyIds: string[]): Promise<Set<string>> {
  const client = createClient();
  const userIds = new Set<string>();
  for (let index = 0; index < familyIds.length; index += FAMILY_ID_CHUNK) {
    const chunk = familyIds.slice(index, index + FAMILY_ID_CHUNK);
    const rows = await fetchAllRows<{ user_id: string }>((from, to) =>
      client
        .from("family_memberships")
        .select("user_id")
        .in("family_id", chunk)
        .order("id")
        .range(from, to),
    );
    for (const row of rows) userIds.add(row.user_id);
  }
  return userIds;
}

/**
 * Everything the "Wachstum" tab needs. Accounts, aggregated events and
 * entitlements are loaded once (memberships only for paying families) and
 * summarized in growth-metrics.ts.
 */
export async function getGrowthOverview(days: 7 | 30 | 90) {
  const client = createClient();
  const now = new Date();
  // Berlin calendar days, like the cohorts and the app_opened index.
  const windowStart = new Date(startOfBerlinDayBefore(now.getTime(), days - 1));
  const cohortStart = cohortWeekStarts(now.getTime(), COHORT_WEEKS)[0];
  const eventsSince = new Date(Math.min(windowStart.getTime(), cohortStart)).toISOString();

  const [users, eventDays, entitlements, forwardingFamilies, familyCount] =
    await Promise.all([
      listAllUsers(),
      // Aggregated per user, event and Berlin day in SQL and returned as
      // one JSON array — a fraction of the raw rows, in a single call.
      client.rpc("admin_growth_event_days", {
        p_since: eventsSince,
        p_event_names: GROWTH_EVENT_NAMES,
      }),
      fetchAllRows((from, to) =>
        client
          .from("family_entitlements")
          .select(
            "family_id,status,plan_code,provider,trial_ends_at,current_period_ends_at,grace_ends_at",
          )
          .order("family_id")
          .range(from, to),
      ),
      // Families that ever forwarded an email, counted in SQL.
      client.rpc("admin_forwarding_family_count"),
      client.from("families").select("id", { count: "exact", head: true }),
    ]);
  if (eventDays.error) throw eventDays.error;
  if (forwardingFamilies.error) throw forwardingFamilies.error;
  if (familyCount.error) throw familyCount.error;
  const events = parseGrowthEventDays(eventDays.data);

  const { paidFamilies, trialingFamilies } = summarizeFamilyBilling(entitlements, now);
  const payingUserIds = await listMemberIds([...paidFamilies]);

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
    forwardingFamilies: Number(forwardingFamilies.data ?? 0),
  };
}
