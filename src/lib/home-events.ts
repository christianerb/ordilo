/**
 * Calendar event occurrences for the Home dashboard — pure, testable
 * helpers that turn `calendar_events` rows into the "Heute" timeline and
 * the "Demnächst" preview.
 *
 * Recurring events do not carry their own list of dates: `eventOccursOn`
 * (lib/calendar.ts) expands a row onto any single day, exactly like the
 * digest email already does (lib/digest.ts). This module runs that same
 * expansion across a short horizon so Home can show "what's on today"
 * and "what's coming this week" without duplicating the recurrence math.
 */

import { eventOccursOn, type CalendarEvent, type EventOccurrenceSource } from "@/lib/calendar";
import { toLocalDateStr, type HomeTask } from "@/lib/home-utils";

/** How many days ahead Home looks for events — matches the task horizon
    (HEUTE_WICHTIG_DAYS) so "diese Woche" means the same thing everywhere. */
export const HOME_EVENTS_HORIZON_DAYS = 7;

/**
 * A `calendar_events` row plus its attendees' names — everything Home
 * needs to expand and render occurrences. Deliberately narrower than
 * `CalendarEvent`: Home only displays events and offers "create a new
 * one", it never edits an existing row from these fields.
 */
export interface HomeEventRow extends EventOccurrenceSource {
  id: string;
  title: string;
  all_day: boolean;
  starts_time: string | null;
  ends_time: string | null;
  location: string | null;
  responsible_member_id: string | null;
  attendee_names: string[];
}

/** One occurrence of an event on a specific day (a recurring row can
    produce several within the horizon). */
export interface HomeEventOccurrence {
  id: string;
  title: string;
  /** ISO date (yyyy-mm-dd) of this occurrence. */
  date: string;
  /** HH:MM, or null for all-day / recurring-without-time entries. */
  starts_time: string | null;
  all_day: boolean;
  location: string | null;
  attendee_names: string[];
}

/**
 * Expand every row onto its occurrences within
 * [referenceDate, referenceDate + horizonDays].
 */
export function expandHomeEventOccurrences(
  rows: HomeEventRow[],
  referenceDate: Date = new Date(),
  horizonDays: number = HOME_EVENTS_HORIZON_DAYS,
): HomeEventOccurrence[] {
  const occurrences: HomeEventOccurrence[] = [];
  for (let offset = 0; offset <= horizonDays; offset++) {
    const day = toLocalDateStr(
      new Date(
        referenceDate.getFullYear(),
        referenceDate.getMonth(),
        referenceDate.getDate() + offset,
      ),
    );
    for (const row of rows) {
      if (!eventOccursOn(row, day)) continue;
      occurrences.push({
        id: row.id,
        title: row.title,
        date: day,
        starts_time: row.all_day ? null : row.starts_time,
        all_day: row.all_day,
        location: row.location,
        attendee_names: row.attendee_names,
      });
    }
  }
  return occurrences;
}

/** All-day entries lead, timed entries follow in chronological order —
    mirrors the digest email's convention (lib/digest.ts). */
export function sortEventOccurrencesForDay(
  occurrences: HomeEventOccurrence[],
): HomeEventOccurrence[] {
  return [...occurrences].sort((a, b) => {
    if (a.starts_time === null && b.starts_time === null) return 0;
    if (a.starts_time === null) return -1;
    if (b.starts_time === null) return 1;
    return a.starts_time.localeCompare(b.starts_time);
  });
}

/** Occurrences that fall exactly on `today`, sorted for display. */
export function filterTodayOccurrences(
  occurrences: HomeEventOccurrence[],
  today: string,
): HomeEventOccurrence[] {
  return sortEventOccurrencesForDay(
    occurrences.filter((occurrence) => occurrence.date === today),
  );
}

/** Occurrences strictly after `today` (the "Demnächst" horizon never
    repeats what "Heute" already shows), sorted soonest first. */
export function filterUpcomingOccurrences(
  occurrences: HomeEventOccurrence[],
  today: string,
): HomeEventOccurrence[] {
  return occurrences
    .filter((occurrence) => occurrence.date > today)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// "Heute" timeline — today's fixed appointments, then today's open tasks
// ---------------------------------------------------------------------------

/** One row in the "Heute" timeline. */
export type HomeTimelineItem =
  | { kind: "event"; id: string; occurrence: HomeEventOccurrence }
  | { kind: "task"; id: string; task: HomeTask };

/**
 * Build today's timeline: timed appointments first (chronological),
 * then all-day appointments, then tasks due today. Tasks have no
 * time-of-day, so they read as "sometime today" rather than competing
 * with an appointment's actual clock time.
 */
export function buildTodayTimeline(
  todayEvents: HomeEventOccurrence[],
  todayTasks: HomeTask[],
): HomeTimelineItem[] {
  const eventItems: HomeTimelineItem[] = sortEventOccurrencesForDay(
    todayEvents,
  ).map((occurrence) => ({
    kind: "event",
    id: `event-${occurrence.id}`,
    occurrence,
  }));
  const taskItems: HomeTimelineItem[] = todayTasks.map((task) => ({
    kind: "task",
    id: `task-${task.id}`,
    task,
  }));
  return [...eventItems, ...taskItems];
}

// ---------------------------------------------------------------------------
// "Demnächst" preview — what's coming later this week
// ---------------------------------------------------------------------------

/** One entry in the "Demnächst" preview — just enough to name it and
    place it on the timeline the tap lands on. */
export interface UpcomingPreviewItem {
  id: string;
  title: string;
  date: string;
}

/**
 * Combine tasks due later this week with event occurrences later this
 * week into one soonest-first preview list. Both inputs are expected to
 * already exclude today (filterUpcomingOccurrences / the caller's task
 * filter) — "Demnächst" never repeats what "Heute" already answered.
 */
export function buildUpcomingPreview(
  upcomingTasks: HomeTask[],
  upcomingEvents: HomeEventOccurrence[],
): UpcomingPreviewItem[] {
  const items: UpcomingPreviewItem[] = [
    ...upcomingTasks
      .filter((task) => task.due_date !== null)
      .map((task) => ({
        id: `task-${task.id}`,
        title: task.title,
        date: task.due_date as string,
      })),
    ...upcomingEvents.map((occurrence) => ({
      id: `event-${occurrence.id}-${occurrence.date}`,
      title: occurrence.title,
      date: occurrence.date,
    })),
  ];
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Tasks due later this week (after today, within the horizon) — the task
 * half of "Demnächst". Excludes today (that's "Heute") and anything
 * beyond the horizon (that stays for /aufgaben to show).
 */
export function filterNext7DaysTasks(
  tasks: HomeTask[],
  referenceDate: Date = new Date(),
  horizonDays: number = HOME_EVENTS_HORIZON_DAYS,
): HomeTask[] {
  const today = toLocalDateStr(referenceDate);
  const horizon = toLocalDateStr(
    new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate() + horizonDays,
    ),
  );
  return tasks
    .filter(
      (task) =>
        task.status === "open" &&
        task.confirmed &&
        task.due_date !== null &&
        task.due_date > today &&
        task.due_date <= horizon,
    )
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!));
}

/** Convert a Home event row into the shape EventSheet needs to check for
    double-bookings when creating a new event from Home. Attendee ids are
    not fetched for Home's lightweight rows, so the check falls back to
    the responsible member only — a smaller but still useful net. */
export function toConflictCheckEvent(row: HomeEventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    note: null,
    starts_on: row.starts_on,
    ends_on: row.ends_on,
    all_day: row.all_day,
    starts_time: row.starts_time,
    ends_time: row.ends_time,
    recurrence: row.recurrence,
    recurrence_until: row.recurrence_until,
    recurrence_exceptions: row.recurrence_exceptions,
    location: row.location,
    responsible_member_id: row.responsible_member_id,
    document_id: null,
    attendees: [],
  };
}
