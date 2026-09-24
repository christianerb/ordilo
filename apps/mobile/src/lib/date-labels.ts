const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "Di., 8. Sept." for a day this year, "Fr., 1. Jan. 2027" for any other
 * year — without the year, a date next January reads like one that passed.
 */
export function formatShortDate(date: Date, now: Date = new Date()): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
  };
  if (date.getFullYear() !== now.getFullYear()) options.year = "numeric";
  return new Intl.DateTimeFormat("de-DE", options).format(date);
}

/** An ISO "YYYY-MM-DD" at local noon, so no timezone can shift the day. */
export function parseIsoDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!ISO_DATE.test(trimmed)) return null;
  const date = new Date(`${trimmed}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** formatShortDate for an ISO date string, or null when it is not one. */
export function formatShortIsoDate(value: string, now: Date = new Date()): string | null {
  const date = parseIsoDate(value);
  return date ? formatShortDate(date, now) : null;
}
