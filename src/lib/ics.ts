/**
 * iCalendar (RFC 5545) feed generation for the family calendar.
 *
 * Pure string building so it can be unit-tested without a database. The
 * feed uses floating local times (no TZID): the planner stores wall-clock
 * times for a family living in one place, and floating times keep "16:00"
 * meaning 16:00 in every calendar app without a timezone database.
 */

export interface IcsEvent {
  id: string;
  title: string;
  note: string | null;
  starts_on: string;
  ends_on: string;
  all_day: boolean;
  starts_time: string | null;
  ends_time: string | null;
  recurrence: "none" | "weekly" | "biweekly" | "monthly" | "yearly";
  recurrence_until: string | null;
  recurrence_exceptions: string[];
  location: string | null;
  created_at: string;
}

const RRULE_BY_RECURRENCE: Record<
  Exclude<IcsEvent["recurrence"], "none">,
  string
> = {
  weekly: "FREQ=WEEKLY",
  biweekly: "FREQ=WEEKLY;INTERVAL=2",
  monthly: "FREQ=MONTHLY",
  yearly: "FREQ=YEARLY",
};

/** Escapes TEXT values per RFC 5545 §3.3.11. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** `2026-08-15` → `20260815` */
function toBasicDate(isoDate: string): string {
  return isoDate.replaceAll("-", "");
}

/** `16:30` or `16:30:00` → `163000` */
function toBasicTime(time: string): string {
  const [hours = "00", minutes = "00", seconds = "00"] = time.split(":");
  return `${hours}${minutes}${seconds}`.slice(0, 6);
}

/** ISO date plus n days, staying in date-only arithmetic. */
function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Timestamp in UTC basic format for DTSTAMP. */
function toUtcStamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "19700101T000000Z";
  return `${date.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;
}

/**
 * Folds a content line at 75 octets per RFC 5545 §3.1, continuation lines
 * indented with one space. Splits on character boundaries and counts
 * UTF-8 octets so multi-byte characters are never cut in half.
 */
function foldLine(line: string): string[] {
  const encoder = new TextEncoder();
  const folded: string[] = [];
  let current = "";
  let currentBytes = 0;
  // Continuation lines start with a space, so their budget is 74 octets.
  let budget = 75;

  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    if (currentBytes + charBytes > budget) {
      folded.push(current);
      current = " ";
      currentBytes = 1;
      budget = 75;
    }
    current += char;
    currentBytes += charBytes;
  }
  folded.push(current);
  return folded;
}

function eventLines(event: IcsEvent): string[] {
  const lines: string[] = ["BEGIN:VEVENT"];
  lines.push(`UID:${event.id}@ordilo`);
  lines.push(`DTSTAMP:${toUtcStamp(event.created_at)}`);
  lines.push(`SUMMARY:${escapeText(event.title)}`);

  if (event.all_day || !event.starts_time) {
    lines.push(`DTSTART;VALUE=DATE:${toBasicDate(event.starts_on)}`);
    // DTEND is exclusive for date values: the day after the last day.
    lines.push(`DTEND;VALUE=DATE:${toBasicDate(addDays(event.ends_on, 1))}`);
  } else {
    lines.push(
      `DTSTART:${toBasicDate(event.starts_on)}T${toBasicTime(event.starts_time)}`,
    );
    const endTime = event.ends_time ?? event.starts_time;
    lines.push(
      `DTEND:${toBasicDate(event.ends_on)}T${toBasicTime(endTime)}`,
    );
  }

  if (event.recurrence !== "none") {
    let rrule = RRULE_BY_RECURRENCE[event.recurrence];
    if (event.recurrence_until) {
      const until =
        event.all_day || !event.starts_time
          ? toBasicDate(event.recurrence_until)
          : `${toBasicDate(event.recurrence_until)}T235959`;
      rrule += `;UNTIL=${until}`;
    }
    lines.push(`RRULE:${rrule}`);

    for (const exception of event.recurrence_exceptions) {
      if (event.all_day || !event.starts_time) {
        lines.push(`EXDATE;VALUE=DATE:${toBasicDate(exception)}`);
      } else {
        lines.push(
          `EXDATE:${toBasicDate(exception)}T${toBasicTime(event.starts_time)}`,
        );
      }
    }
  }

  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.note) lines.push(`DESCRIPTION:${escapeText(event.note)}`);
  lines.push("END:VEVENT");
  return lines;
}

/** Builds the complete VCALENDAR document (CRLF line endings, folded). */
export function buildFamilyCalendar(
  events: IcsEvent[],
  options: { calendarName?: string } = {},
): string {
  const name = options.calendarName ?? "Ordilo Familienkalender";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ordilo//Familienplaner//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    ...events.flatMap(eventLines),
    "END:VCALENDAR",
  ];
  return lines.flatMap(foldLine).join("\r\n") + "\r\n";
}
