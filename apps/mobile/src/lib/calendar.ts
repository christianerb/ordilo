import { fetchAllRows } from "./collections";
import { getSupabase } from "./supabase";
import type { FamilyMemberOption } from "./tasks";
import { z } from "zod";

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
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const GERMAN_DATE_PATTERN = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

/** Local calendar date, never UTC, so a Sunday night stays Sunday on-device. */
export function toCalendarDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Human-readable form value for an ISO calendar date. */
export function formatEventDateInput(value: string): string {
  if (!DATE_PATTERN.test(value)) return value;
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

/** Convert a German date field (DD.MM.YYYY) to a real ISO calendar date. */
export function parseEventDateInput(value: string): string | null {
  const match = GERMAN_DATE_PATTERN.exec(value.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${iso}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && toCalendarDate(parsed) === iso
    ? iso
    : null;
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

/** Keeps the Plan screen focused on appointments that can still occur. */
export function upcomingPlannerEvents(
  events: PlannerEvent[],
  today: string,
): PlannerEvent[] {
  const upcoming = events.flatMap((event) => {
    if (event.recurrence === "none") {
      return event.ends_on >= today ? [event] : [];
    }

    const nextDate = nextEventOccurrence(event, today);
    if (!nextDate) return [];
    const durationDays = Math.max(
      0,
      Math.round(
        (new Date(`${event.ends_on}T12:00:00`).getTime() -
          new Date(`${event.starts_on}T12:00:00`).getTime()) /
          86_400_000,
      ),
    );
    return [{
      ...event,
      starts_on: nextDate,
      ends_on: shiftIsoDate(nextDate, durationDays),
    }];
  });

  return upcoming
    .sort(
      (a, b) =>
        a.starts_on.localeCompare(b.starts_on) ||
        (a.starts_time ?? "").localeCompare(b.starts_time ?? "") ||
        a.id.localeCompare(b.id),
    );
}

function shiftIsoDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toCalendarDate(date);
}

function nextEventOccurrence(
  event: PlannerEvent,
  today: string,
): string | null {
  const occurrenceStart = (date: string): string | null => {
    if (!eventOccursOn(event, date)) return null;
    const durationDays = Math.max(
      0,
      Math.round(
        (new Date(`${event.ends_on}T12:00:00`).getTime() -
          new Date(`${event.starts_on}T12:00:00`).getTime()) /
          86_400_000,
      ),
    );
    let start = date;
    for (let offset = 0; offset < durationDays; offset += 1) {
      const previous = shiftIsoDate(start, -1);
      if (previous < event.starts_on || !eventOccursOn(event, previous)) break;
      start = previous;
    }
    return start;
  };

  const currentOccurrence = occurrenceStart(today);
  if (currentOccurrence) return currentOccurrence;

  let candidate = event.starts_on > today
    ? event.starts_on
    : shiftIsoDate(today, 1);
  const searchLimit = event.recurrence_until ?? shiftIsoDate(today, 740);
  while (candidate <= searchLimit) {
    const start = occurrenceStart(candidate);
    if (start) return start;
    candidate = shiftIsoDate(candidate, 1);
  }
  return null;
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

const plannerEventInputSchema = z.object({
  title: z.string().trim().min(1, "Bitte gib einen Titel ein.").max(160),
  date: z.string().refine(
    (value) => DATE_PATTERN.test(value) &&
      toCalendarDate(new Date(`${value}T12:00:00`)) === value,
    "Bitte gib ein gültiges Datum ein.",
  ),
  allDay: z.boolean(),
  startsTime: z.string(),
  endsTime: z.string(),
  location: z.string().trim().max(300),
  note: z.string().trim().max(2000),
  attendeeIds: z.array(z.string()),
});

export interface PlannerEventInput {
  title: string;
  date: string;
  allDay: boolean;
  startsTime: string;
  endsTime: string;
  location: string;
  note: string;
  attendeeIds: string[];
}

export function validatePlannerEventInput(
  input: PlannerEventInput,
): { success: true; data: PlannerEventInput } | { success: false; error: string } {
  const parsed = plannerEventInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Bitte prüfe deine Angaben.",
    };
  }
  if (!parsed.data.allDay) {
    if (
      !TIME_PATTERN.test(parsed.data.startsTime) ||
      !TIME_PATTERN.test(parsed.data.endsTime)
    ) {
      return {
        success: false,
        error: "Bitte gib Beginn und Ende als Uhrzeit ein.",
      };
    }
    if (parsed.data.endsTime <= parsed.data.startsTime) {
      return {
        success: false,
        error: "Das Ende muss nach dem Beginn liegen.",
      };
    }
  }
  return { success: true, data: parsed.data };
}

/** Create a one-off family appointment and roll back if attendees fail. */
export async function createPlannerEvent(
  familyId: string,
  input: PlannerEventInput,
): Promise<{ success: true; event: PlannerEvent } | { success: false; error: string }> {
  const validation = validatePlannerEventInput(input);
  if (!validation.success) return validation;

  const value = validation.data;
  const { data, error } = await getSupabase()
    .from("calendar_events")
    .insert({
      family_id: familyId,
      title: value.title,
      note: value.note || null,
      starts_on: value.date,
      ends_on: value.date,
      all_day: value.allDay,
      starts_time: value.allDay ? null : value.startsTime,
      ends_time: value.allDay ? null : value.endsTime,
      recurrence: "none",
      recurrence_until: null,
      recurrence_exceptions: [],
      location: value.location || null,
      responsible_member_id: null,
    })
    .select(eventSelect)
    .single();

  if (error || !data) {
    return {
      success: false,
      error: "Der Termin konnte nicht gespeichert werden. Bitte versuch es nochmal.",
    };
  }

  if (value.attendeeIds.length > 0) {
    const { error: attendeeError } = await getSupabase()
      .from("calendar_event_attendees")
      .insert(
        value.attendeeIds.map((memberId) => ({
          event_id: data.id,
          family_member_id: memberId,
        })),
      );
    if (attendeeError) {
      await getSupabase().from("calendar_events").delete().eq("id", data.id);
      return {
        success: false,
        error: "Der Termin konnte nicht gespeichert werden. Bitte versuch es nochmal.",
      };
    }
  }

  return {
    success: true,
    event: {
      ...(data as Omit<PlannerEvent, "attendee_ids">),
      recurrence: data.recurrence as CalendarRecurrence,
      recurrence_exceptions: data.recurrence_exceptions ?? [],
      attendee_ids: value.attendeeIds,
    },
  };
}
