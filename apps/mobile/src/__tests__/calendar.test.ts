import {
  calendarDays,
  createPlannerEvent,
  deletePlannerEvent,
  eventDurationDays,
  eventOccurrenceStart,
  eventOccursOn,
  eventsForDay,
  formatEventDateInput,
  formatEventPeople,
  formatGermanDate,
  parseEventDateInput,
  restorePlannerEventOccurrence,
  skipPlannerEventOccurrence,
  toCalendarDate,
  updatePlannerEvent,
  upcomingPlannerEvents,
  validatePlannerEventInput,
  type PlannerEvent,
} from "../lib/calendar";

const mockRpc = jest.fn();
const mockDelete = jest.fn();
const mockEq = jest.fn();

jest.mock("../lib/supabase", () => ({
  getSupabase: () => ({
    rpc: mockRpc,
    from: () => ({ delete: mockDelete }),
  }),
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
  document_id: null,
  attendee_ids: ["member-1"],
};

describe("native calendar", () => {
  it("renders a stable six-week, Monday-first month grid", () => {
    const days = calendarDays(new Date(2026, 7, 1));
    expect(days).toHaveLength(42);
    expect(toCalendarDate(days[0])).toBe("2026-07-27");
    expect(toCalendarDate(days.at(-1)!)).toBe("2026-09-06");
  });

  it("says a date the German way, from a plain day or a full timestamp", () => {
    // A stored day is that same day in every zone — the shift a naive
    // new Date("YYYY-MM-DD") would introduce west of UTC. Checked against
    // America/Los_Angeles and Pacific/Kiritimati as well as UTC.
    expect(formatGermanDate("2026-09-03")).toBe("3. September 2026");
    expect(formatGermanDate("2026-01-01")).toBe("1. Januar 2026");
    expect(formatGermanDate("2026-12-31")).toBe("31. Dezember 2026");
    // A timestamp names an instant, so it rightly follows the device zone;
    // only its shape is fixed.
    expect(formatGermanDate("2026-09-01T12:00:00Z")).toMatch(/^\d{1,2}\. September 2026$/);
    // Anything unreadable stays empty so the caller can show the raw value.
    expect(formatGermanDate("")).toBe("");
    expect(formatGermanDate("demnächst")).toBe("");
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

  it("updates an event and its attendees through the mirroring RPC", async () => {
    mockRpc.mockResolvedValue({
      data: {
        ...event,
        title: "Elternabend",
        all_day: false,
        starts_time: "18:00",
        ends_time: "19:00",
        created_at: "2026-08-28T12:00:00Z",
        created_by: "user-1",
        document_id: null,
        family_id: "family-1",
        recurrence: "none",
      },
      error: null,
    });

    await expect(
      updatePlannerEvent("event-1", {
        title: "Elternabend",
        date: "2026-08-28",
        allDay: false,
        startsTime: "18:00",
        endsTime: "19:00",
        location: "Schule",
        note: "Raum 2",
        attendeeIds: ["member-2"],
      }),
    ).resolves.toMatchObject({
      success: true,
      event: { attendee_ids: ["member-2"], title: "Elternabend" },
    });

    expect(mockRpc).toHaveBeenCalledWith(
      "update_calendar_event_with_attendees",
      {
        p_all_day: false,
        p_attendee_ids: ["member-2"],
        p_date: "2026-08-28",
        p_ends_time: "19:00",
        p_event_id: "event-1",
        p_location: "Schule",
        p_note: "Raum 2",
        p_starts_time: "18:00",
        p_title: "Elternabend",
      },
    );
  });

  it("refuses to save an invalid edit before it reaches the database", async () => {
    await expect(
      updatePlannerEvent("event-1", {
        title: "",
        date: "2026-08-28",
        allDay: true,
        startsTime: "09:00",
        endsTime: "10:00",
        location: "",
        note: "",
        attendeeIds: [],
      }),
    ).resolves.toEqual({
      success: false,
      error: "Bitte gib einen Titel ein.",
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("reports a failed edit in the family's own words", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(
      updatePlannerEvent("event-1", {
        title: "Elternabend",
        date: "2026-08-28",
        allDay: true,
        startsTime: "09:00",
        endsTime: "10:00",
        location: "",
        note: "",
        attendeeIds: [],
      }),
    ).resolves.toEqual({
      success: false,
      error:
        "Die Änderung konnte nicht gespeichert werden. Bitte versuch es nochmal.",
    });
  });

  it("deletes an event, and says so plainly when it cannot", async () => {
    mockEq.mockResolvedValue({ error: null });
    mockDelete.mockReturnValue({ eq: mockEq });
    await expect(deletePlannerEvent("event-1")).resolves.toEqual({
      success: true,
    });
    expect(mockEq).toHaveBeenCalledWith("id", "event-1");

    mockEq.mockResolvedValue({ error: { message: "nope" } });
    await expect(deletePlannerEvent("event-1")).resolves.toEqual({
      success: false,
      error: "Der Termin konnte nicht gelöscht werden.",
    });
  });

  it("drops one day out of a series and can put it back", async () => {
    const series: PlannerEvent = { ...event, recurrence: "weekly" };
    // The database changes the exception list in place and hands back the
    // whole row, so a day somebody else skipped meanwhile survives.
    mockRpc.mockResolvedValue({
      data: {
        ...series,
        recurrence_exceptions: ["2026-08-10", "2026-08-17"],
        created_at: "2026-08-01T12:00:00Z",
        created_by: "user-1",
        family_id: "family-1",
      },
      error: null,
    });

    await expect(
      skipPlannerEventOccurrence(series, "2026-08-17"),
    ).resolves.toMatchObject({
      success: true,
      event: {
        attendee_ids: ["member-1"],
        recurrence_exceptions: ["2026-08-10", "2026-08-17"],
      },
    });
    expect(mockRpc).toHaveBeenCalledWith("skip_calendar_event_occurrence", {
      p_date: "2026-08-17",
      p_event_id: "event-1",
    });

    mockRpc.mockResolvedValue({
      data: {
        ...series,
        recurrence_exceptions: ["2026-08-10"],
        created_at: "2026-08-01T12:00:00Z",
        created_by: "user-1",
        family_id: "family-1",
      },
      error: null,
    });
    await expect(
      restorePlannerEventOccurrence(series, "2026-08-17"),
    ).resolves.toMatchObject({
      success: true,
      event: { recurrence_exceptions: ["2026-08-10"] },
    });
    expect(mockRpc).toHaveBeenCalledWith("restore_calendar_event_occurrence", {
      p_date: "2026-08-17",
      p_event_id: "event-1",
    });
  });

  it("keeps a failed skip or restore from claiming success", async () => {
    const series: PlannerEvent = { ...event, recurrence: "weekly" };
    mockRpc.mockResolvedValue({ data: null, error: { message: "nope" } });
    await expect(
      skipPlannerEventOccurrence(series, "2026-08-17"),
    ).resolves.toEqual({
      success: false,
      error: "Der Tag konnte nicht entfernt werden.",
    });
    await expect(
      restorePlannerEventOccurrence(series, "2026-08-17"),
    ).resolves.toEqual({ success: false });
  });

  it("finds the first day of the occurrence covering a date", () => {
    const trip: PlannerEvent = {
      ...event,
      starts_on: "2026-08-03",
      ends_on: "2026-08-05",
      recurrence: "none",
    };
    expect(eventOccurrenceStart(trip, "2026-08-04")).toBe("2026-08-03");
    expect(eventOccurrenceStart(trip, "2026-08-06")).toBeNull();

    const weekly: PlannerEvent = { ...trip, recurrence: "weekly" };
    expect(eventOccurrenceStart(weekly, "2026-08-11")).toBe("2026-08-10");
    expect(eventDurationDays(weekly)).toBe(2);
  });
});
