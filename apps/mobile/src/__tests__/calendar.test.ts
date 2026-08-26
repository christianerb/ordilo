import {
  calendarDays,
  eventOccursOn,
  eventsForDay,
  formatEventPeople,
  toCalendarDate,
  upcomingPlannerEvents,
  type PlannerEvent,
} from "../lib/calendar";

const event: PlannerEvent = {
  id: "event-1",
  title: "Schwimmen",
  note: null,
  starts_on: "2026-08-03",
  ends_on: "2026-08-03",
  all_day: false,
  starts_time: "15:00:00",
  ends_time: "16:00:00",
  recurrence: "weekly",
  recurrence_until: null,
  recurrence_exceptions: [],
  location: null,
  responsible_member_id: "member-2",
  attendee_ids: ["member-1"],
};

describe("native calendar", () => {
  it("renders a stable six-week, Monday-first month grid", () => {
    const days = calendarDays(new Date(2026, 7, 1));
    expect(days).toHaveLength(42);
    expect(toCalendarDate(days[0])).toBe("2026-07-27");
    expect(toCalendarDate(days.at(-1)!)).toBe("2026-09-06");
  });

  it("expands recurring events and respects skipped occurrences", () => {
    expect(eventOccursOn(event, "2026-08-10")).toBe(true);
    expect(eventOccursOn(event, "2026-08-11")).toBe(false);
    expect(eventOccursOn({ ...event, recurrence_exceptions: ["2026-08-10"] }, "2026-08-10")).toBe(false);
  });

  it("sorts all-day appointments before timed appointments", () => {
    const today = new Date(2026, 7, 3);
    expect(
      eventsForDay([{ ...event, id: "timed" }, { ...event, id: "all-day", all_day: true }], today)
        .map((item) => item.id),
    ).toEqual(["all-day", "timed"]);
  });

  it("names attendees and the responsible family member", () => {
    expect(formatEventPeople(event, [
      { id: "member-1", name: "Lina", role: null, avatar_color: null },
      { id: "member-2", name: "Karina", role: null, avatar_color: null },
    ])).toBe("Für Lina · Karina kümmert sich");
  });

  it("keeps upcoming and recurring appointments in the Plan list", () => {
    expect(
      upcomingPlannerEvents(
        [
          { ...event, id: "past", recurrence: "none", ends_on: "2026-08-01" },
          { ...event, id: "future", recurrence: "none", starts_on: "2026-08-20", ends_on: "2026-08-20" },
          { ...event, id: "recurring", recurrence_until: null },
        ],
        "2026-08-10",
      ).map((item) => item.id),
    ).toEqual(["recurring", "future"]);
  });
});
