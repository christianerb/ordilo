/**
 * Calendar math in German time (Europe/Berlin), safe for browser and
 * server. Product days and weeks follow the family's clock, not UTC: the
 * app_opened index, the admin cohorts and email suggestions all use it.
 *
 * Only the long-supported `timeZone` option of Intl is used (no offset
 * names), so older Safari versions on family iPads load this fine.
 */

const TIME_ZONE = "Europe/Berlin";
const DAY_MS = 24 * 60 * 60 * 1000;

// Created on first use, not at import: an engine without time zone data
// would otherwise throw while loading every page that imports this module,
// instead of inside the (guarded) caller.
let dayFormatter: Intl.DateTimeFormat | null = null;
let wallClockFormatter: Intl.DateTimeFormat | null = null;

function getDayFormatter(): Intl.DateTimeFormat {
  dayFormatter ??= new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dayFormatter;
}

function getWallClockFormatter(): Intl.DateTimeFormat {
  wallClockFormatter ??= new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });
  return wallClockFormatter;
}

/** The Berlin calendar day as YYYY-MM-DD. */
export function berlinDay(now: Date = new Date()): string {
  return getDayFormatter().format(now);
}

/**
 * Berlin's UTC offset at an instant (CET +1h, CEST +2h), derived from the
 * Berlin wall-clock time rather than a parsed offset name.
 */
function berlinOffsetMs(time: number): number {
  const parts: Record<string, number> = {};
  for (const part of getWallClockFormatter().formatToParts(new Date(time))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  const wallClock = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour % 24, // some engines print midnight as 24
    parts.minute,
    parts.second,
  );
  return wallClock - Math.floor(time / 1000) * 1000;
}

/** UTC instant of 00:00 Berlin time on the Berlin day containing `time`. */
export function startOfBerlinDay(time: number): number {
  const [year, month, day] = berlinDay(new Date(time)).split("-").map(Number);
  const wallMidnight = Date.UTC(year, month - 1, day);
  // Resolve twice so a DST change between the guess and midnight settles.
  let start = wallMidnight - berlinOffsetMs(wallMidnight);
  start = wallMidnight - berlinOffsetMs(start);
  return start;
}

/** UTC instant of Monday 00:00 Berlin time of the week containing `time`. */
export function startOfBerlinWeek(time: number): number {
  const dayStart = startOfBerlinDay(time);
  const [year, month, day] = berlinDay(new Date(time)).split("-").map(Number);
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  // Step back by whole days, re-anchoring on midnight in case DST moved.
  return startOfBerlinDay(dayStart - weekday * DAY_MS + DAY_MS / 2);
}

/** UTC instant of the next 00:00 Berlin time after `time`. */
export function nextBerlinMidnight(time: number): number {
  return startOfBerlinDay(startOfBerlinDay(time) + DAY_MS + DAY_MS / 2);
}

/**
 * UTC instant of 00:00 Berlin time `days` calendar days before the day of
 * `time` (0 = today). Steps from midday so DST cannot skip a day.
 */
export function startOfBerlinDayBefore(time: number, days: number): number {
  return startOfBerlinDay(startOfBerlinDay(time) + DAY_MS / 2 - days * DAY_MS);
}
