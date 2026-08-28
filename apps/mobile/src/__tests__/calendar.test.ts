import {
  calendarDays,
  createPlannerEvent,
  eventOccursOn,
  eventsForDay,
  formatEventDateInput,
  formatEventPeople,
  parseEventDateInput,
  toCalendarDate,
  upcomingPlannerEvents,
  validatePlannerEventInput,
  type PlannerEvent,
} from "../lib/calendar";

const mockRpc = jest.fn();

jest.mock("../lib/supabase", () => ({
  getSupabase: () => ({ rpc: mockRpc }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

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
    const upcoming = upcomingPlannerEvents(
      [
        { ...event, id: "past", recurrence: "none", ends_on: "2026-08-01" },
        { ...event, id: "future", recurrence: "none", starts_on: "2026-08-20", ends_on: "2026-08-20" },
        {
          ...event,
          id: "recurring",
          recurrence_exceptions: ["2026-08-10"],
          recurrence_until: null,
        },
      ],
      "2026-08-10",
    );

    expect(upcoming.map((item) => item.id)).toEqual(["recurring", "future"]);
    expect(upcoming[0].starts_on).toBe("2026-08-17");
  });

  it("keeps the true start of an in-progress multi-day recurrence", () => {
    const [ongoing] = upcomingPlannerEvents(
      [{
        ...event,
        starts_on: "2026-08-03",
        ends_on: "2026-08-05",
      }],
      "2026-08-11",
    );

    expect(ongoing.starts_on).toBe("2026-08-10");
    expect(ongoing.ends_on).toBe("2026-08-12");
  });

  it("round-trips German event dates and rejects impossible days", () => {
    expect(formatEventDateInput("2026-08-28")).toBe("28.08.2026");
    expect(parseEventDateInput("28.8.2026")).toBe("2026-08-28");
    expect(parseEventDateInput("31.02.2026")).toBeNull();
  });

  it("validates timed event ranges", () => {
    const input = {
      title: "Elternabend",
      date: "2026-08-28",
      allDay: false,
      startsTime: "18:00",
      endsTime: "17:00",
      location: "",
      note: "",
      attendeeIds: [],
    };
    expect(validatePlannerEventInput(input)).toEqual({
      success: false,
      error: "Das Ende muss nach dem Beginn liegen.",
    });
    expect(
      validatePlannerEventInput({ ...input, endsTime: "19:00" }).success,
    ).toBe(true);
    expect(validatePlannerEventInput({ ...input, startsTime: "24:00" })).toEqual({
      success: false,
      error: "Bitte gib Beginn und Ende als Uhrzeit ein.",
    });
    expect(validatePlannerEventInput({ ...input, endsTime: "18:60" })).toEqual({
      success: false,
      error: "Bitte gib Beginn und Ende als Uhrzeit ein.",
    });
  });

  it("creates an event and its attendees through one atomic RPC", async () => {
    mockRpc.mockResolvedValue({
      data: {
        ...event,
        all_day: false,
        created_at: "2026-08-28T12:00:00Z",
        created_by: "user-1",
        document_id: null,
        family_id: "family-1",
        recurrence: "none",
      },
      error: null,
    });

    await expect(createPlannerEvent("family-1", {
      title: "Elternabend",
      date: "2026-08-28",
      allDay: false,
      startsTime: "18:00",
      endsTime: "19:00",
      location: "Schule",
      note: "Raum 2",
      attendeeIds: ["member-1"],
    })).resolves.toMatchObject({
      success: true,
      event: { attendee_ids: ["member-1"], title: "Schwimmen" },
    });

    expect(mockRpc).toHaveBeenCalledWith(
      "create_calendar_event_with_attendees",
      {
        p_all_day: false,
        p_attendee_ids: ["member-1"],
        p_date: "2026-08-28",
        p_ends_time: "19:00",
        p_family_id: "family-1",
        p_location: "Schule",
        p_note: "Raum 2",
        p_starts_time: "18:00",
        p_title: "Elternabend",
      },
    );
  });
});
