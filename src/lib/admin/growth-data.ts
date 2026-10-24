import "server-only";
import { createClient } from "@/lib/supabase/admin";
import { parseStoredAttribution } from "@/lib/analytics/attribution";
import { startOfBerlinDayBefore } from "@/lib/berlin-date";
import { fetchAllRows } from "./paginate";
import { listAllUsers } from "./platform-data";
import { signupConfirmedAt } from "./signups";
import {
  cohortWeekStarts,
  summarizeFamilyBilling,
  summarizeGrowth,
  GROWTH_EVENT_NAMES,
  LONGEST_RATE_WINDOW_DAYS,
  parseGrowthEventDays,
  type GrowthAccount,
} from "./growth-metrics";

const COHORT_WEEKS = 8;
/** Family ids per `in` filter, so the request URL stays short. */
const FAMILY_ID_CHUNK = 100;

/** Accounts that belong to any of these families (chunks run in parallel). */
async function listMemberIds(familyIds: string[]): Promise<Set<string>> {
  const client = createClient();
  const chunks: string[][] = [];
  for (let index = 0; index < familyIds.length; index += FAMILY_ID_CHUNK) {
    chunks.push(familyIds.slice(index, index + FAMILY_ID_CHUNK));
  }
  const pages = await Promise.all(
    chunks.map((chunk) =>
      fetchAllRows<{ user_id: string }>((from, to) =>
        client
          .from("family_memberships")
          .select("user_id")
          .in("family_id", chunk)
          .order("id")
          .range(from, to),
      ),
    ),
  );
  return new Set(pages.flat().map((row) => row.user_id));
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
  // Period rates include accounts that signed up up to 14 days before the
  // period (their window ended in it), so their early events are needed.
  const ratePoolStart = startOfBerlinDayBefore(now.getTime(), days - 1 + LONGEST_RATE_WINDOW_DAYS);
  const eventsSince = new Date(Math.min(ratePoolStart, cohortStart)).toISOString();

  const [users, eventDays, billing, forwardingFamilies, familyCount, appOpensSince] =
    await Promise.all([
      listAllUsers(),
      // Aggregated per user, event and Berlin day in SQL and returned as
      // one JSON array — a fraction of the raw rows, in a single call.
      client.rpc("admin_growth_event_days", {
        p_since: eventsSince,
        p_event_names: GROWTH_EVENT_NAMES,
      }),
      // Billing, then the members of paying families — chained, so it runs
      // alongside the other requests instead of after all of them.
      fetchAllRows((from, to) =>
        client
          .from("family_entitlements")
          .select(
            "family_id,status,plan_code,provider,trial_ends_at,current_period_ends_at,grace_ends_at",
          )
          .order("family_id")
          .range(from, to),
      ).then(async (rows) => {
        const billing = summarizeFamilyBilling(rows, now);
        return { ...billing, payingUserIds: await listMemberIds([...billing.paidFamilies]) };
      }),
      // Families that ever forwarded an email, counted in SQL.
      client.rpc("admin_forwarding_family_count"),
      client.from("families").select("id", { count: "exact", head: true }),
      // The real start of app-open tracking, not the loaded window's start.
      client.rpc("admin_app_opens_tracked_since"),
    ]);
  if (appOpensSince.error) throw appOpensSince.error;
  if (eventDays.error) throw eventDays.error;
  if (forwardingFamilies.error) throw forwardingFamilies.error;
  if (familyCount.error) throw familyCount.error;
  const events = parseGrowthEventDays(eventDays.data);

  const { paidFamilies, trialingFamilies, payingUserIds } = billing;

  const accounts: GrowthAccount[] = users.flatMap((user) => {
    const confirmedAt = signupConfirmedAt(user);
    return confirmedAt
      ? [
          {
            id: user.id,
            createdAt: confirmedAt,
            attribution: parseStoredAttribution(user.user_metadata?.signup_attribution),
          },
        ]
      : [];
  });

  return {
    ...summarizeGrowth({
      accounts,
      events,
      payingUserIds,
      since: windowStart.toISOString(),
      appOpensSince: appOpensSince.data ?? null,
      now,
      cohortWeeks: COHORT_WEEKS,
    }),
    familiesTotal: familyCount.count ?? 0,
    payingFamilies: paidFamilies.size,
    trialingFamilies: trialingFamilies.size,
    forwardingFamilies: Number(forwardingFamilies.data ?? 0),
  };
}
