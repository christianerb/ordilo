import { fetchAllRows } from "./collections";
import { getSupabase } from "./supabase";
import type { FamilyMemberOption } from "./tasks";

export type CalendarRecurrence =
  | "none"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "yearly";

export interface PlannerEvent {
  id: string;
  title: string;
  note: string | null;
  starts_on: string;
  ends_on: string;
  all_day: boolean;
  starts_time: string | null;
  ends_time: string | null;
  recurrence: CalendarRecurrence;
  recurrence_until: string | null;
  recurrence_exceptions: string[];
  location: string | null;
  responsible_member_id: string | null;
  attendee_ids: string[];
}

const eventSelect =
  "id, title, note, starts_on, ends_on, all_day, starts_time, ends_time, recurrence, recurrence_until, recurrence_exceptions, location, responsible_member_id";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Local calendar date, never UTC, so a Sunday night stays Sunday on-device. */
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

/** Six complete Monday-first weeks keep a month grid from jumping in height. */
export function calendarDays(month: Date): Date[] {
  const first = monthStart(month);
  const mondayOffset = (first.getDay() + 6) % 7;
  const visibleStart = new Date(
    first.getFullYear(),
    first.getMonth(),
    first.getDate() - mondayOffset,
  );
  return Array.from(
    { length: 42 },
    (_, index) =>
      new Date(
        visibleStart.getFullYear(),
        visibleStart.getMonth(),
        visibleStart.getDate() + index,
      ),
  );
}

/**
 * Whether one event occurs on one local calendar day. This is the native
 * equivalent of src/lib/calendar.ts, including recurrence exceptions.
 */
export function eventOccursOn(event: PlannerEvent, date: string): boolean {
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
  if (current < start) return false;
  const durationDays = Math.round(
    (new Date(`${event.ends_on}T12:00:00`).getTime() - start.getTime()) /
      86_400_000,
  );

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

export function eventsForDay(
  events: PlannerEvent[],
  date: Date,
): PlannerEvent[] {
  const target = toCalendarDate(date);
  return events
    .filter((event) => eventOccursOn(event, target))
    .sort((a, b) => {
      if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
      return (a.starts_time ?? "").localeCompare(b.starts_time ?? "");
    });
}

export function formatEventWhen(event: PlannerEvent): string {
  if (event.all_day) return "Ganztägig";
  const start = event.starts_time?.slice(0, 5);
  const end = event.ends_time?.slice(0, 5);
  return start && end ? `${start}–${end} Uhr` : "Uhrzeit offen";
}

export function formatEventPeople(
  event: PlannerEvent,
  members: FamilyMemberOption[],
): string | null {
  const names = new Map(members.map((member) => [member.id, member.name]));
  const attendeeNames = event.attendee_ids
    .map((id) => names.get(id))
    .filter((name): name is string => Boolean(name));
  const responsible = event.responsible_member_id
    ? names.get(event.responsible_member_id)
    : null;
  if (responsible && attendeeNames.length > 0) {
    return `Für ${attendeeNames.join(", ")} · ${responsible} kümmert sich`;
  }
  if (responsible) return `Für ${responsible}`;
  return attendeeNames.length > 0 ? `Für ${attendeeNames.join(", ")}` : null;
}

/** RLS-scoped calendar read plus its separately stored attendee relation. */
export async function fetchPlannerEvents(
  familyId: string,
): Promise<PlannerEvent[]> {
  const rows = await fetchAllRows(async (from, to) => {
    const { data, error } = await getSupabase()
      .from("calendar_events")
      .select(eventSelect)
      .eq("family_id", familyId)
      .order("starts_on", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as Omit<PlannerEvent, "attendee_ids">[];
  });
  const ids = rows.map((event) => event.id);
  if (ids.length === 0) return [];
  const { data: attendees, error } = await getSupabase()
    .from("calendar_event_attendees")
    .select("event_id, family_member_id")
    .in("event_id", ids);
  if (error) throw error;

  const attendeeIdsByEvent = new Map<string, string[]>();
  for (const attendee of attendees ?? []) {
    const current = attendeeIdsByEvent.get(attendee.event_id) ?? [];
    current.push(attendee.family_member_id);
    attendeeIdsByEvent.set(attendee.event_id, current);
  }
  return rows.map((event) => ({
    ...event,
    recurrence: event.recurrence as CalendarRecurrence,
    recurrence_exceptions: event.recurrence_exceptions ?? [],
    attendee_ids: attendeeIdsByEvent.get(event.id) ?? [],
  }));
}
