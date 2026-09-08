/**
 * Classifies accounts by recency of use for the admin user list.
 * Pure module so the thresholds stay testable.
 *
 * - aktiv: Produktnutzung oder Login in den letzten 7 Tagen
 * - inaktiv: zuletzt vor 8 bis 30 Tagen
 * - lange_nicht_da: über 30 Tage ohne Nutzung (oder nie)
 *
 * New accounts fall back to their signup date so someone who joined
 * yesterday is not immediately marked as long gone.
 */
export type AccountActivityStatus = "aktiv" | "inaktiv" | "lange_nicht_da";

const DAY_MS = 24 * 60 * 60 * 1000;

export const ACCOUNT_STATUS_LABELS: Record<AccountActivityStatus, string> = {
  aktiv: "Aktiv",
  inaktiv: "Inaktiv",
  lange_nicht_da: "Lange nicht da",
};

export function classifyAccountActivity(
  timestamps: {
    lastSignInAt?: string | null;
    lastActivityAt?: string | null;
    createdAt?: string | null;
  },
  now: Date = new Date(),
): AccountActivityStatus {
  const candidates = [
    timestamps.lastSignInAt,
    timestamps.lastActivityAt,
    timestamps.createdAt,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((time) => !Number.isNaN(time));

  if (!candidates.length) return "lange_nicht_da";

  const daysSince = (now.getTime() - Math.max(...candidates)) / DAY_MS;
  if (daysSince <= 7) return "aktiv";
  if (daysSince <= 30) return "inaktiv";
  return "lange_nicht_da";
}

type AccountTimestamps = {
  createdAt: string;
  lastSignInAt: string | null;
  lastActivityAt: string | null;
};

function lastUseTime(account: AccountTimestamps): number | null {
  const times = [account.lastSignInAt, account.lastActivityAt]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((time) => !Number.isNaN(time));
  return times.length ? Math.max(...times) : null;
}

/**
 * Wiederkehr-Quote: of all accounts old enough to have left (signed up
 * more than 7 days ago), how many used the product in the last 7 days.
 */
export function summarizeRetention(
  accounts: AccountTimestamps[],
  now: Date = new Date(),
): { eligible: number; returned: number; rate: number | null } {
  const eligible = accounts.filter(
    (account) => now.getTime() - new Date(account.createdAt).getTime() > 7 * DAY_MS,
  );
  const returned = eligible.filter((account) => {
    const lastUse = lastUseTime(account);
    return lastUse !== null && now.getTime() - lastUse <= 7 * DAY_MS;
  });
  return {
    eligible: eligible.length,
    returned: returned.length,
    rate: eligible.length === 0 ? null : returned.length / eligible.length,
  };
}

/**
 * Stickiness: average daily active accounts over the chart window as a
 * share of accounts active in the last 30 days (DAU/MAU-style).
 */
export function summarizeStickiness(
  accounts: AccountTimestamps[],
  dailyActive: number[],
  now: Date = new Date(),
): { averageDailyActive: number; active30Days: number; ratio: number | null } {
  const active30Days = accounts.filter((account) => {
    const lastUse = lastUseTime(account);
    return lastUse !== null && now.getTime() - lastUse <= 30 * DAY_MS;
  }).length;
  const averageDailyActive = dailyActive.length
    ? dailyActive.reduce((sum, value) => sum + value, 0) / dailyActive.length
    : 0;
  return {
    averageDailyActive,
    active30Days,
    ratio: active30Days === 0 ? null : averageDailyActive / active30Days,
  };
}
