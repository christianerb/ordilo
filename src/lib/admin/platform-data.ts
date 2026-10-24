import "server-only";

import type { User } from "@supabase/supabase-js";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { createBerlinDayCache, startOfBerlinDayBefore } from "@/lib/berlin-date";
import { fetchAllRows } from "./paginate";
import { signupConfirmedAt } from "./signups";
import { eventNameList, NOT_PRODUCT_USE_EVENTS } from "./event-filters";

const DAY_MS = 24 * 60 * 60 * 1000;
const AUTH_PAGE_SIZE = 1_000;
const EVENT_RETENTION_DAYS = 365;

export type PlatformAccount = {
  id: string;
  email: string;
  createdAt: string;
  /** When the login code was first confirmed; null for abandoned signups. */
  confirmedAt: string | null;
  lastSignInAt: string | null;
  lastActivityAt: string | null;
  familyCount: number;
};

export type DailyPlatformMetric = {
  date: string;
  registrations: number;
  activeAccounts: number;
  uploads: number;
};

export type PlatformOverview = {
  accountsTotal: number;
  accountsNew: number;
  accountsActive: number;
  familiesTotal: number;
  averageAccountsPerFamily: number;
  averageMembersPerFamily: number;
  documentsTotal: number;
  accounts: PlatformAccount[];
  /** Confirmed accounts only, with createdAt = confirmation (see signups). */
  signupAccounts: PlatformAccount[];
  dailyMetrics: DailyPlatformMetric[];
};

// Days follow German time, like the Wachstum tab, so "7/30/90 Tage" means
// the same hours on every admin tab.

export async function listAllUsers(): Promise<User[]> {
  const admin = createAdminClient();
  const users: User[] = [];
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE,
    });
    if (error) throw error;

    users.push(...data.users);
    if (data.users.length < AUTH_PAGE_SIZE) return users;
    page += 1;
  }
}

/**
 * Maps auth user IDs to their email address for admin views that only
 * need the lookup (activity feed, cost tab) without the full overview.
 */
export async function listAccountEmailMap(): Promise<Map<string, string>> {
  const users = await listAllUsers();
  return new Map(users.map((user) => [user.id, user.email ?? "Ohne E-Mail"]));
}

/**
 * Product use for the overview's "aktiv" numbers. The database-written
 * app_opened and invite_accepted rows are left out on purpose: these
 * numbers mean real use, as before those events existed; the Wachstum tab
 * shows opening and using separately.
 */
async function listProductActivitySince(since: string) {
  const admin = createAdminClient();
  return fetchAllRows<{ user_id: string; occurred_at: string }>((from, to) =>
    admin
      .from("product_events")
      .select("user_id, occurred_at")
      .gte("occurred_at", since)
      .not("event_name", "in", eventNameList(NOT_PRODUCT_USE_EVENTS))
      .order("occurred_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
}

export async function getPlatformOverview(windowDays: 7 | 30 | 90): Promise<PlatformOverview> {
  const admin = createAdminClient();
  // Per request, so the cache never outlives one overview.
  const dateKey = createBerlinDayCache();
  const now = new Date();
  const windowStart = new Date(startOfBerlinDayBefore(now.getTime(), windowDays - 1));
  const retentionStart = new Date(now.getTime() - EVENT_RETENTION_DAYS * DAY_MS).toISOString();

  const [users, activityRows, familiesResult, memberCountResult, memberships, documentCountResult, recentDocuments] =
    await Promise.all([
      listAllUsers(),
      listProductActivitySince(retentionStart),
      admin.from("families").select("id", { count: "exact", head: true }),
      admin.from("family_members").select("id", { count: "exact", head: true }),
      fetchAllRows<{ user_id: string }>((from, to) =>
        admin.from("family_memberships").select("user_id").order("id").range(from, to),
      ),
      admin.from("documents").select("id", { count: "exact", head: true }),
      // Uploads pro Tag fuer das 30-Tage-Chart. Manuell angelegte Notizen
      // (source = "manual") haben keine hochgeladene Datei und zaehlen nicht.
      fetchAllRows<{ created_at: string }>((from, to) =>
        admin
          .from("documents")
          .select("created_at")
          .gte("created_at", new Date(startOfBerlinDayBefore(now.getTime(), 29)).toISOString())
          .neq("source", "manual")
          .order("id")
          .range(from, to),
      ),
    ]);

  if (familiesResult.error) throw familiesResult.error;
  if (memberCountResult.error) throw memberCountResult.error;
  if (documentCountResult.error) throw documentCountResult.error;

  const familyCountByUser = new Map<string, number>();
  for (const membership of memberships) {
    familyCountByUser.set(
      membership.user_id,
      (familyCountByUser.get(membership.user_id) ?? 0) + 1,
    );
  }

  const lastActivityByUser = new Map<string, string>();
  for (const activity of activityRows) {
    if (!lastActivityByUser.has(activity.user_id)) {
      lastActivityByUser.set(activity.user_id, activity.occurred_at);
    }
  }

  const accounts = users
    .map((user) => ({
      id: user.id,
      email: user.email ?? "Ohne E-Mail",
      createdAt: user.created_at,
      confirmedAt: signupConfirmedAt(user),
      lastSignInAt: user.last_sign_in_at ?? null,
      lastActivityAt: lastActivityByUser.get(user.id) ?? null,
      familyCount: familyCountByUser.get(user.id) ?? 0,
    }))
    .sort(
      (left, right) =>
        new Date(right.lastActivityAt ?? right.lastSignInAt ?? right.createdAt).getTime() -
        new Date(left.lastActivityAt ?? left.lastSignInAt ?? left.createdAt).getTime(),
    );

  const activeAccountIds = new Set<string>();
  for (const account of accounts) {
    const lastSignIn = account.lastSignInAt ? new Date(account.lastSignInAt) : null;
    const lastActivity = account.lastActivityAt ? new Date(account.lastActivityAt) : null;
    if (
      (lastSignIn && lastSignIn >= windowStart) ||
      (lastActivity && lastActivity >= windowStart)
    ) {
      activeAccountIds.add(account.id);
    }
  }

  const days = 30;
  const metricsByDate = new Map<string, { registrations: number; active: Set<string>; uploads: number }>();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(startOfBerlinDayBefore(now.getTime(), offset));
    metricsByDate.set(dateKey(day), { registrations: 0, active: new Set(), uploads: 0 });
  }
  // Only rows inside the chart can land in a bucket; skip the rest before
  // the (Intl-based) day formatting.
  const chartStart = startOfBerlinDayBefore(now.getTime(), days - 1);
  const inChart = (iso: string) => new Date(iso).getTime() >= chartStart;
  for (const account of accounts) {
    // A signup counts once its login code was confirmed (as on Wachstum);
    // requesting a code alone already creates the auth user.
    if (account.confirmedAt && inChart(account.confirmedAt)) {
      const bucket = metricsByDate.get(dateKey(new Date(account.confirmedAt)));
      if (bucket) bucket.registrations += 1;
    }
    if (account.lastSignInAt && inChart(account.lastSignInAt)) {
      const activeBucket = metricsByDate.get(dateKey(new Date(account.lastSignInAt)));
      activeBucket?.active.add(account.id);
    }
  }
  for (const activity of activityRows) {
    // Newest first: everything after the first older row is older too.
    if (!inChart(activity.occurred_at)) break;
    const bucket = metricsByDate.get(dateKey(new Date(activity.occurred_at)));
    bucket?.active.add(activity.user_id);
  }
  for (const document of recentDocuments) {
    const bucket = metricsByDate.get(dateKey(new Date(document.created_at)));
    if (bucket) bucket.uploads += 1;
  }

  const familiesTotal = familiesResult.count ?? 0;
  return {
    accountsTotal: accounts.filter((account) => account.confirmedAt).length,
    accountsNew: accounts.filter(
      (account) => account.confirmedAt && new Date(account.confirmedAt) >= windowStart,
    ).length,
    accountsActive: activeAccountIds.size,
    familiesTotal,
    averageAccountsPerFamily:
      familiesTotal === 0
        ? 0
        : Math.round((memberships.length / familiesTotal) * 10) / 10,
    averageMembersPerFamily:
      familiesTotal === 0
        ? 0
        : Math.round(((memberCountResult.count ?? 0) / familiesTotal) * 10) / 10,
    documentsTotal: documentCountResult.count ?? 0,
    accounts,
    signupAccounts: accounts.flatMap((account) =>
      account.confirmedAt ? [{ ...account, createdAt: account.confirmedAt }] : [],
    ),
    dailyMetrics: [...metricsByDate.entries()].map(([date, metric]) => ({
      date,
      registrations: metric.registrations,
      activeAccounts: metric.active.size,
      uploads: metric.uploads,
    })),
  };
}
