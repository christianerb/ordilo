import {
  calendarDays,
  eventsForDay,
  isSameCalendarMonth,
  monthStart,
  shiftMonth,
  toCalendarDate,
} from "@/lib/calendar";
import { describe, expect, it } from "vitest";

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
        attendees: [],
      },
    ];

    expect(eventsForDay(events, new Date(2026, 7, 3))).toHaveLength(1);
    expect(eventsForDay(events, new Date(2026, 7, 14))).toHaveLength(1);
    expect(eventsForDay(events, new Date(2026, 7, 15))).toHaveLength(0);
  });

  it("compares months by calendar month and year", () => {
    expect(isSameCalendarMonth(new Date(2026, 7, 1), new Date(2026, 7, 31))).toBe(true);
    expect(isSameCalendarMonth(new Date(2026, 7, 1), new Date(2027, 7, 1))).toBe(false);
  });
});
