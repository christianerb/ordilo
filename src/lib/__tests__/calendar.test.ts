import {
  calendarDays,
  eventsForDay,
  findScheduleConflicts,
  isSameCalendarMonth,
  monthStart,
  shiftMonth,
  toCalendarDate,
  type CalendarEvent,
} from "@/lib/calendar";
import { describe, expect, it } from "vitest";

function makeTimedEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "existing-1",
    title: "Schwimmen",
    note: null,
    starts_on: "2026-08-20",
    ends_on: "2026-08-20",
    all_day: false,
    starts_time: "16:00:00",
    ends_time: "17:00:00",
    recurrence: "none",
    recurrence_until: null,
    recurrence_exceptions: [],
    location: null,
    responsible_member_id: null,
    document_id: null,
    attendees: [{ id: "m-1", name: "Emma" }],
    ...overrides,
  };
}

describe("calendar helpers", () => {
  it("formats dates without timezone shifts", () => {
    expect(toCalendarDate(new Date(2026, 7, 4, 23, 45))).toBe("2026-08-04");
  });

  it("starts each month on its first day", () => {
    expect(toCalendarDate(monthStart(new Date(2026, 7, 24)))).toBe("2026-08-01");
  });

  it("moves between months from the first day", () => {
    expect(toCalendarDate(shiftMonth(new Date(2026, 0, 31), 1))).toBe("2026-02-01");
  });

  it("returns a Monday-first six-week calendar grid", () => {
    const days = calendarDays(new Date(2026, 7, 1));

    expect(days).toHaveLength(42);
    expect(toCalendarDate(days[0])).toBe("2026-07-27");
    expect(toCalendarDate(days.at(-1)!)).toBe("2026-09-06");
  });

  it("includes multi-day events on every covered day", () => {
    const events = [
      {
        id: "ferien",
        title: "Sommerferien",
        note: null,
        starts_on: "2026-08-03",
        ends_on: "2026-08-14",
        all_day: true,
        starts_time: null,
        ends_time: null,
        recurrence: "none" as const,
        recurrence_until: null,
        recurrence_exceptions: [],
        location: null,
        responsible_member_id: null,
        document_id: null,
        attendees: [],
      },
    ];

    expect(eventsForDay(events, new Date(2026, 7, 3))).toHaveLength(1);
    expect(eventsForDay(events, new Date(2026, 7, 14))).toHaveLength(1);
    expect(eventsForDay(events, new Date(2026, 7, 15))).toHaveLength(0);
  });

  it("repeats biweekly events every 14 days, not every 7", () => {
    const events = [
      {
        id: "papa-wochenende",
        title: "Papa-Wochenende",
        note: null,
        starts_on: "2026-08-01",
        ends_on: "2026-08-02",
        all_day: true,
        starts_time: null,
        ends_time: null,
        recurrence: "biweekly" as const,
        recurrence_until: null,
        recurrence_exceptions: [],
        location: null,
        responsible_member_id: null,
        document_id: null,
        attendees: [],
      },
    ];

    // First occurrence covers both days of the weekend.
    expect(eventsForDay(events, new Date(2026, 7, 1))).toHaveLength(1);
    expect(eventsForDay(events, new Date(2026, 7, 2))).toHaveLength(1);
    // One week later: nothing.
    expect(eventsForDay(events, new Date(2026, 7, 8))).toHaveLength(0);
    expect(eventsForDay(events, new Date(2026, 7, 9))).toHaveLength(0);
    // Two weeks later: back again.
    expect(eventsForDay(events, new Date(2026, 7, 15))).toHaveLength(1);
    expect(eventsForDay(events, new Date(2026, 7, 16))).toHaveLength(1);
  });

  it("honors exceptions and the until date for biweekly events", () => {
    const events = [
      {
        id: "training",
        title: "Training",
        note: null,
        starts_on: "2026-08-01",
        ends_on: "2026-08-01",
        all_day: true,
        starts_time: null,
        ends_time: null,
        recurrence: "biweekly" as const,
        recurrence_until: "2026-09-12",
        recurrence_exceptions: ["2026-08-15"],
        location: null,
        responsible_member_id: null,
        document_id: null,
        attendees: [],
      },
    ];

    expect(eventsForDay(events, new Date(2026, 7, 15))).toHaveLength(0);
    expect(eventsForDay(events, new Date(2026, 7, 29))).toHaveLength(1);
    expect(eventsForDay(events, new Date(2026, 8, 12))).toHaveLength(1);
    expect(eventsForDay(events, new Date(2026, 8, 26))).toHaveLength(0);
  });

  it("finds a double-booking when times overlap and a person is shared", () => {
    const conflicts = findScheduleConflicts([makeTimedEvent()], {
      id: null,
      starts_on: "2026-08-20",
      all_day: false,
      starts_time: "16:30",
      ends_time: "17:30",
      memberIds: ["m-1"],
    });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].event.id).toBe("existing-1");
    expect(conflicts[0].memberIds).toEqual(["m-1"]);
  });

  it("does not report conflicts without shared people or overlapping times", () => {
    const draft = {
      id: null,
      starts_on: "2026-08-20",
      all_day: false,
      starts_time: "16:30",
      ends_time: "17:30",
      memberIds: ["m-2"],
    };
    // Same slot, different person.
    expect(findScheduleConflicts([makeTimedEvent()], draft)).toHaveLength(0);
    // Same person, back-to-back times (17:00 end touches 17:00 start).
    expect(
      findScheduleConflicts([makeTimedEvent()], {
        ...draft,
        memberIds: ["m-1"],
        starts_time: "17:00",
        ends_time: "18:00",
      }),
    ).toHaveLength(0);
  });

  it("counts the responsible member as involved", () => {
    const event = makeTimedEvent({
      attendees: [],
      responsible_member_id: "m-3",
    });
    const conflicts = findScheduleConflicts([event], {
      id: null,
      starts_on: "2026-08-20",
      all_day: false,
      starts_time: "16:00",
      ends_time: "16:30",
      memberIds: ["m-3"],
    });

    expect(conflicts).toHaveLength(1);
  });

  it("detects conflicts with recurring occurrences but skips the edited event and all-day entries", () => {
    const weekly = makeTimedEvent({ id: "weekly-1", recurrence: "weekly" });
    // Two weeks after the series start.
    const draft = {
      id: null,
      starts_on: "2026-09-03",
      all_day: false,
      starts_time: "16:00",
      ends_time: "16:30",
      memberIds: ["m-1"],
    };
    expect(findScheduleConflicts([weekly], draft)).toHaveLength(1);
    // Editing the series itself is not a self-conflict.
    expect(
      findScheduleConflicts([weekly], { ...draft, id: "weekly-1" }),
    ).toHaveLength(0);
    // All-day entries (holidays) never conflict.
    expect(
      findScheduleConflicts(
        [makeTimedEvent({ all_day: true, starts_time: null, ends_time: null })],
        draft,
      ),
    ).toHaveLength(0);
  });

  it("compares months by calendar month and year", () => {
    expect(isSameCalendarMonth(new Date(2026, 7, 1), new Date(2026, 7, 31))).toBe(true);
    expect(isSameCalendarMonth(new Date(2026, 7, 1), new Date(2027, 7, 1))).toBe(false);
  });
});
