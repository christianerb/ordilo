import "server-only";
import { createClient } from "@/lib/supabase/admin";
import { parseStoredAttribution } from "@/lib/analytics/stored-attribution";
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

/**
 * First touch as stored at signup (signup_attributions, one row per
 * account); user metadata itself stays editable by its owner and is not
 * trusted here. Paged directly — far fewer requests than id filters, and
 * independent of the user list, so both load in parallel.
 */
async function listAttributions(since: string): Promise<Map<string, unknown>> {
  const client = createClient();
  const rows = await fetchAllRows<{ user_id: string; attribution: unknown }>((from, to) =>
    client
      .from("signup_attributions")
      .select("user_id,attribution")
      // Rows are last written at confirmation, so older rows belong to
      // accounts that can never reach the window, a pool or a cohort.
      .gte("updated_at", since)
      .order("user_id")
      .range(from, to),
  );
  return new Map(rows.map((row) => [row.user_id, row.attribution]));
}

/** Owners of these families, queried in chunks (paying families are few). */
async function listOwnerIds(familyIds: string[]): Promise<Set<string>> {
  const client = createClient();
  const owners = new Set<string>();
  for (let index = 0; index < familyIds.length; index += FAMILY_ID_CHUNK) {
    const chunk = familyIds.slice(index, index + FAMILY_ID_CHUNK);
    const rows = await fetchAllRows<{ user_id: string }>((from, to) =>
      client
        .from("family_memberships")
        .select("user_id")
        .in("family_id", chunk)
        // The owner pays; invited relatives joining a paying family are
        // not a new paying conversion of their channel.
        .eq("role", "owner")
        .order("id")
        .range(from, to),
    );
    for (const row of rows) owners.add(row.user_id);
  }
  return owners;
}

/**
 * Everything the "Wachstum" tab needs. Accounts, aggregated events and
 * entitlements are loaded once (owners only for paying families) and
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
  // One extra day: the pools count 14×24 h, which a DST change can stretch
  // past 14 calendar days by an hour.
  const ratePoolStart = startOfBerlinDayBefore(now.getTime(), days + LONGEST_RATE_WINDOW_DAYS);
  const eventsSince = new Date(Math.min(ratePoolStart, cohortStart)).toISOString();

  const [users, allAttributions, eventDays, billing, forwardingFamilies, familyCount, appOpensSince] =
    await Promise.all([
      listAllUsers(),
      // signup_attributions is one row per account; loaded alongside the
      // users and narrowed to the relevant accounts below.
      listAttributions(eventsSince),
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
        return { ...billing, payingUserIds: await listOwnerIds([...billing.paidFamilies]) };
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

  // Only accounts confirmed since the earliest loaded event can reach the
  // window, a rate pool or a cohort; older ones are never classified.
  const eventsSinceMs = Date.parse(eventsSince);
  const accounts: GrowthAccount[] = users.flatMap((user) => {
    const confirmedAt = signupConfirmedAt(user);
    return confirmedAt && Date.parse(confirmedAt) >= eventsSinceMs
      ? [
          {
            id: user.id,
            createdAt: confirmedAt,
            attribution: parseStoredAttribution(allAttributions.get(user.id)),
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
