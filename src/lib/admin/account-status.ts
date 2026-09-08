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
