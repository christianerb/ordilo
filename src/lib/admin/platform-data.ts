import "server-only";

import type { User } from "@supabase/supabase-js";
import { createClient as createAdminClient } from "@/lib/supabase/admin";

const DAY_MS = 24 * 60 * 60 * 1000;
const AUTH_PAGE_SIZE = 1_000;
const EVENT_RETENTION_DAYS = 365;

export type PlatformAccount = {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  lastActivityAt: string | null;
  familyCount: number;
};

export type DailyPlatformMetric = {
  date: string;
  registrations: number;
  activeAccounts: number;
};

export type PlatformOverview = {
  accountsTotal: number;
  accountsNew: number;
  accountsActive: number;
  familiesTotal: number;
  averageAccountsPerFamily: number;
  averageMembersPerFamily: number;
  accounts: PlatformAccount[];
  dailyMetrics: DailyPlatformMetric[];
};

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function listAllUsers(): Promise<User[]> {
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

async function listProductActivitySince(since: string) {
  const admin = createAdminClient();
  const rows: Array<{ user_id: string; occurred_at: string }> = [];
  const pageSize = 1_000;
  let from = 0;

  while (true) {
    const { data, error } = await admin
      .from("product_events")
      .select("user_id, occurred_at")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;

    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) return rows;
    from += pageSize;
  }
}

export async function getPlatformOverview(windowDays: 7 | 30 | 90): Promise<PlatformOverview> {
  const admin = createAdminClient();
  const now = new Date();
  const windowStart = startOfDay(new Date(now.getTime() - (windowDays - 1) * DAY_MS));
  const retentionStart = new Date(now.getTime() - EVENT_RETENTION_DAYS * DAY_MS).toISOString();

  const [users, activityRows, familiesResult, memberCountResult, membershipsResult] =
    await Promise.all([
      listAllUsers(),
      listProductActivitySince(retentionStart),
      admin.from("families").select("id", { count: "exact", head: true }),
      admin.from("family_members").select("id", { count: "exact", head: true }),
      admin.from("family_memberships").select("user_id"),
    ]);

  if (familiesResult.error) throw familiesResult.error;
  if (memberCountResult.error) throw memberCountResult.error;
  if (membershipsResult.error) throw membershipsResult.error;

  const familyCountByUser = new Map<string, number>();
  for (const membership of membershipsResult.data ?? []) {
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
  const metricsByDate = new Map<string, { registrations: number; active: Set<string> }>();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = startOfDay(new Date(now.getTime() - offset * DAY_MS));
    metricsByDate.set(dateKey(day), { registrations: 0, active: new Set() });
  }
  for (const account of accounts) {
    const bucket = metricsByDate.get(dateKey(new Date(account.createdAt)));
    if (bucket) bucket.registrations += 1;
    if (account.lastSignInAt) {
      const activeBucket = metricsByDate.get(dateKey(new Date(account.lastSignInAt)));
      activeBucket?.active.add(account.id);
    }
  }
  for (const activity of activityRows) {
    const bucket = metricsByDate.get(dateKey(new Date(activity.occurred_at)));
    bucket?.active.add(activity.user_id);
  }

  const familiesTotal = familiesResult.count ?? 0;
  return {
    accountsTotal: accounts.length,
    accountsNew: accounts.filter((account) => new Date(account.createdAt) >= windowStart).length,
    accountsActive: activeAccountIds.size,
    familiesTotal,
    averageAccountsPerFamily:
      familiesTotal === 0
        ? 0
        : Math.round(((membershipsResult.data?.length ?? 0) / familiesTotal) * 10) / 10,
    averageMembersPerFamily:
      familiesTotal === 0
        ? 0
        : Math.round(((memberCountResult.count ?? 0) / familiesTotal) * 10) / 10,
    accounts,
    dailyMetrics: [...metricsByDate.entries()].map(([date, metric]) => ({
      date,
      registrations: metric.registrations,
      activeAccounts: metric.active.size,
    })),
  };
}
