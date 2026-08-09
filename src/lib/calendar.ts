export interface CalendarEvent {
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
  /** Family member who owns the logistics ("Wer kümmert sich?"). */
  responsible_member_id: string | null;
  /** Source document when the event came from a scanned/uploaded document. */
  document_id: string | null;
  document_title?: string | null;
  /** Auth user who created the event (null for legacy rows). */
  created_by?: string | null;
  /** True when someone else added this and the current user hasn't seen it. */
  is_new?: boolean;
  attendees: Array<{ id: string; name: string }>;
}

/** German labels for the recurrence rhythms, shared across planner UIs. */
export const RECURRENCE_LABELS: Record<CalendarEvent["recurrence"], string> = {
  none: "",
  weekly: "Wöchentlich",
  biweekly: "Alle 14 Tage",
  monthly: "Monatlich",
  yearly: "Jährlich",
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function toCalendarDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function shiftMonth(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function calendarDays(month: Date): Date[] {
  const first = monthStart(month);
  const startsOnMonday = (first.getDay() + 6) % 7;
  const firstVisible = new Date(
    first.getFullYear(),
    first.getMonth(),
    first.getDate() - startsOnMonday,
  );

  return Array.from(
    { length: 42 },
    (_, index) =>
      new Date(
        firstVisible.getFullYear(),
        firstVisible.getMonth(),
        firstVisible.getDate() + index,
      ),
  );
}

export function eventsForDay(
  events: CalendarEvent[],
  date: Date,
): CalendarEvent[] {
  const dateString = toCalendarDate(date);
  return events.filter((event) => eventOccursOn(event, dateString));
}

/** The fields occurrence expansion actually needs — callers with bare DB
    rows (digest, home) don't have to fake a full CalendarEvent. */
export type EventOccurrenceSource = Pick<
  CalendarEvent,
  | "starts_on"
  | "ends_on"
  | "recurrence"
  | "recurrence_until"
  | "recurrence_exceptions"
>;

export function eventOccursOn(
  event: EventOccurrenceSource,
  date: string,
): boolean {
  if (
    !DATE_PATTERN.test(event.starts_on) ||
    !DATE_PATTERN.test(event.ends_on) ||
    !DATE_PATTERN.test(date) ||
    event.starts_on > date ||
    (event.recurrence_until && date > event.recurrence_until) ||
    event.recurrence_exceptions.includes(date)
  ) {
    return false;
  }

  if (event.recurrence === "none") return date <= event.ends_on;

  const start = new Date(`${event.starts_on}T12:00:00`);
  const current = new Date(`${date}T12:00:00`);
  const durationDays = Math.round(
    (new Date(`${event.ends_on}T12:00:00`).getTime() - start.getTime()) /
      86_400_000,
  );

  if (current.getTime() < start.getTime()) return false;

  if (event.recurrence === "weekly" || event.recurrence === "biweekly") {
    const cycle = event.recurrence === "weekly" ? 7 : 14;
    const dayDelta = Math.round(
      (current.getTime() - start.getTime()) / 86_400_000,
    );
    return dayDelta % cycle >= 0 && dayDelta % cycle <= durationDays;
  }

  if (event.recurrence === "monthly") {
    const monthDelta =
      (current.getFullYear() - start.getFullYear()) * 12 +
      current.getMonth() -
      start.getMonth();
    const occurrenceStart = new Date(
      start.getFullYear(),
      start.getMonth() + monthDelta,
      start.getDate(),
      12,
    );
    const occurrenceEnd = new Date(
      occurrenceStart.getFullYear(),
      occurrenceStart.getMonth(),
      occurrenceStart.getDate() + durationDays,
      12,
    );
    return current >= occurrenceStart && current <= occurrenceEnd;
  }

  const occurrenceStart = new Date(
    current.getFullYear(),
    start.getMonth(),
    start.getDate(),
    12,
  );
  const occurrenceEnd = new Date(
    occurrenceStart.getFullYear(),
    occurrenceStart.getMonth(),
    occurrenceStart.getDate() + durationDays,
    12,
  );
  return current >= occurrenceStart && current <= occurrenceEnd;
}

/** A draft being checked for schedule conflicts before saving. */
export interface ConflictDraft {
  /** Event id when editing (excluded from the check), null when creating. */
  id: string | null;
  starts_on: string;
  all_day: boolean;
  /** HH:MM */
  starts_time: string | null;
  /** HH:MM */
  ends_time: string | null;
  /** Everyone involved: attendees plus the responsible member. */
  memberIds: string[];
}

export interface ScheduleConflict {
  event: CalendarEvent;
  /** The involved members who are double-booked. */
  memberIds: string[];
}

/** People involved in an event: attendees plus the responsible member. */
function involvedMemberIds(event: CalendarEvent): string[] {
  const ids = event.attendees.map((attendee) => attendee.id);
  if (
    event.responsible_member_id &&
    !ids.includes(event.responsible_member_id)
  ) {
    ids.push(event.responsible_member_id);
  }
  return ids;
}

/**
 * Finds double-bookings for a timed draft: existing timed events on the
 * same day (recurring occurrences included) whose time range overlaps and
 * that share at least one involved person. All-day entries (holidays,
 * "Kita zu") are deliberately not conflicts — they coexist with anything.
 */
export function findScheduleConflicts(
  events: CalendarEvent[],
  draft: ConflictDraft,
): ScheduleConflict[] {
  if (
    draft.all_day ||
    !draft.starts_time ||
    !draft.ends_time ||
    draft.memberIds.length === 0 ||
    !DATE_PATTERN.test(draft.starts_on)
  ) {
    return [];
  }

  const conflicts: ScheduleConflict[] = [];
  for (const event of events) {
    if (event.id === draft.id) continue;
    if (event.all_day || !event.starts_time || !event.ends_time) continue;
    if (!eventOccursOn(event, draft.starts_on)) continue;

    // HH:MM strings compare correctly as strings.
    const eventStart = event.starts_time.slice(0, 5);
    const eventEnd = event.ends_time.slice(0, 5);
    const overlaps = eventStart < draft.ends_time && draft.starts_time < eventEnd;
    if (!overlaps) continue;

    const involved = new Set(involvedMemberIds(event));
    const shared = draft.memberIds.filter((id) => involved.has(id));
    if (shared.length > 0) {
      conflicts.push({ event, memberIds: shared });
    }
  }
  return conflicts;
}

export function isSameCalendarDay(a: Date, b: Date): boolean {
  return toCalendarDate(a) === toCalendarDate(b);
}

export function isSameCalendarMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}
