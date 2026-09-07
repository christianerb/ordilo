import {
  formatPlanDayMark,
  formatPlanEntryPeople,
  formatPlanEntryWhen,
  getPlanEntrySection,
  groupPlanEntries,
  isPlanEntryOverdue,
  planDayMark,
  planEntriesForDay,
  planEntryCounts,
  planEntryForEvent,
  planEntryKey,
  planEntryMemberIds,
  type PlanEntry,
} from "../lib/plan-entries";
import type { PlannerEvent } from "../lib/calendar";
import type { FamilyMemberOption, PlannerTask } from "../lib/tasks";

jest.mock("../lib/supabase", () => ({ getSupabase: () => ({}) }));

const TODAY = "2026-09-08";

const members: FamilyMemberOption[] = [
  { id: "m-karina", name: "Karina", role: "Kind", avatar_color: "#C0392B" },
  { id: "m-christian", name: "Christian", role: "Elternteil", avatar_color: "#E46018" },
];

function task(overrides: Partial<PlannerTask> = {}): PlannerTask {
  return {
    id: "task-1",
    family_id: "fam-1",
    document_id: null,
    title: "Schulausweis abgeben",
    description: null,
    due_date: TODAY,
    status: "open",
    confidence: 1,
    confirmed: true,
    created_at: "2026-09-01T09:00:00.000Z",
    tags: [],
    assigned_to: null,
    completed_at: null,
    ...overrides,
  };
}

function event(overrides: Partial<PlannerEvent> = {}): PlannerEvent {
  return {
    id: "event-1",
    title: "Elternabend",
    note: null,
    starts_on: TODAY,
    ends_on: TODAY,
    all_day: true,
    starts_time: null,
    ends_time: null,
    recurrence: "none",
    recurrence_until: null,
    recurrence_exceptions: [],
    location: null,
    responsible_member_id: null,
    document_id: null,
    attendee_ids: [],
    ...overrides,
  };
}

describe("plan entries", () => {
  it("puts tasks and appointments into the same sections", () => {
    const sections = groupPlanEntries(
      [
        task({ id: "t-today", due_date: TODAY }),
        task({ id: "t-late", due_date: "2026-09-01" }),
        task({ id: "t-soon", due_date: "2026-09-20" }),
        task({ id: "t-someday", due_date: null }),
        task({ id: "t-done", status: "done", completed_at: "2026-09-07T10:00:00.000Z" }),
        task({ id: "t-gone", status: "dismissed" }),
      ],
      [
        event({ id: "e-today", starts_on: TODAY, ends_on: TODAY }),
        event({ id: "e-later", starts_on: "2026-09-11", ends_on: "2026-09-11" }),
        event({ id: "e-past", starts_on: "2026-08-01", ends_on: "2026-08-01" }),
      ],
      TODAY,
    );

    expect(sections.now.map((entry) => entry.id)).toEqual([
      "t-late",
      "e-today",
      "t-today",
    ]);
    expect(sections.next.map((entry) => entry.id)).toEqual([
      "e-later",
      "t-soon",
    ]);
    expect(sections.undated.map((entry) => entry.id)).toEqual(["t-someday"]);
    expect(sections.done.map((entry) => entry.id)).toEqual(["t-done"]);
    // A dismissed task never shows, and a finished appointment is gone.
    expect(
      Object.values(sections)
        .flat()
        .map((entry) => entry.id),
    ).not.toContain("t-gone");
    expect(
      Object.values(sections)
        .flat()
        .map((entry) => entry.id),
    ).not.toContain("e-past");
  });

  it("sorts the time-bound thing before the flexible one on the same day", () => {
    const sections = groupPlanEntries(
      [task({ id: "t", due_date: TODAY })],
      [
        event({
          id: "e-morning",
          all_day: false,
          starts_time: "09:00",
          ends_time: "10:00",
        }),
        event({ id: "e-allday" }),
      ],
      TODAY,
    );

    expect(sections.now.map((entry) => entry.id)).toEqual([
      "e-allday",
      "e-morning",
      "t",
    ]);
  });

  it("never files an appointment as undated or done", () => {
    expect(
      getPlanEntrySection(planEntryForEvent(event(), TODAY), TODAY),
    ).toBe("now");
    expect(
      getPlanEntrySection(
        planEntryForEvent(
          event({ starts_on: "2026-12-24", ends_on: "2026-12-24" }),
          "2026-12-24",
        ),
        TODAY,
      ),
    ).toBe("next");
  });

  it("shows a calendar day's appointments and its tasks together", () => {
    const entries = planEntriesForDay(
      [
        task({ id: "t-today", due_date: TODAY }),
        task({ id: "t-other", due_date: "2026-09-09" }),
        task({ id: "t-gone", due_date: TODAY, status: "dismissed" }),
      ],
      [event({ id: "e-today" }), event({ id: "e-other", starts_on: "2026-09-09", ends_on: "2026-09-09" })],
      new Date("2026-09-08T12:00:00"),
    );

    expect(entries.map((entry) => entry.id)).toEqual(["e-today", "t-today"]);
  });

  it("marks a day by what it carries, and says it in words too", () => {
    const mark = planDayMark(
      [task({ due_date: TODAY }), task({ id: "t2", due_date: TODAY })],
      [event()],
      new Date("2026-09-08T12:00:00"),
    );

    expect(mark).toEqual({ events: 1, tasks: 2 });
    expect(formatPlanDayMark(mark)).toBe("1 Termin, 2 Aufgaben");
    expect(formatPlanDayMark({ events: 0, tasks: 0 })).toBe("");
    expect(formatPlanDayMark({ events: 2, tasks: 0 })).toBe("2 Termine");
  });

  it("counts appointments once for the header line", () => {
    const sections = groupPlanEntries(
      [task({ id: "t-today" }), task({ id: "t-someday", due_date: null })],
      [event(), event({ id: "e2", starts_on: "2026-09-20", ends_on: "2026-09-20" })],
      TODAY,
    );

    expect(planEntryCounts(sections)).toEqual({
      now: 1,
      next: 0,
      undated: 1,
      events: 2,
    });
  });

  it("reads the same 'when' for both kinds", () => {
    const timed: PlanEntry = planEntryForEvent(event({ all_day: false, starts_time: "09:00", ends_time: "10:30" }), TODAY);
    expect(formatPlanEntryWhen(timed, TODAY)).toBe("Heute · 09:00–10:30 Uhr");
    expect(
      formatPlanEntryWhen(
        { kind: "task", id: "t", date: TODAY, task: task() },
        TODAY,
      ),
    ).toBe("Heute");
    expect(
      formatPlanEntryWhen(
        { kind: "task", id: "t", date: null, task: task({ due_date: null }) },
        TODAY,
      ),
    ).toBeNull();
  });

  it("only lets an open task read as late", () => {
    const late = task({ due_date: "2026-09-01" });
    expect(
      isPlanEntryOverdue({ kind: "task", id: "t", date: late.due_date, task: late }, TODAY),
    ).toBe(true);
    expect(
      isPlanEntryOverdue(
        {
          kind: "task",
          id: "t",
          date: late.due_date,
          task: { ...late, status: "done" },
        },
        TODAY,
      ),
    ).toBe(false);
    // An appointment in the past is simply over, not overdue.
    expect(
      isPlanEntryOverdue(
        planEntryForEvent(event({ starts_on: "2026-08-01", ends_on: "2026-08-01" }), "2026-08-01"),
        TODAY,
      ),
    ).toBe(false);
  });

  it("names the people on a row in plain language", () => {
    expect(
      formatPlanEntryPeople(
        planEntryForEvent(event({ attendee_ids: ["m-karina"] }), TODAY),
        members,
      ),
    ).toBe("Für Karina");
    expect(
      formatPlanEntryPeople(
        {
          kind: "task",
          id: "t",
          date: TODAY,
          task: task({ assigned_to: "m-christian" }),
        },
        members,
      ),
    ).toBe("Christian kümmert sich");
    expect(
      formatPlanEntryPeople(
        { kind: "task", id: "t", date: TODAY, task: task() },
        members,
      ),
    ).toBeNull();
  });

  it("collects the faces a row should show, without repeating one", () => {
    expect(
      planEntryMemberIds(planEntryForEvent(event({
          attendee_ids: ["m-karina"],
          responsible_member_id: "m-karina",
        }), TODAY)),
    ).toEqual(["m-karina"]);
    expect(
      planEntryMemberIds({
        kind: "task",
        id: "t",
        date: TODAY,
        task: task({ assigned_to: "m-christian" }),
      }),
    ).toEqual(["m-christian"]);
  });

  it("keys a repeating appointment per occurrence, not per series", () => {
    const series = event({ recurrence: "weekly" });
    expect(
      planEntryKey(planEntryForEvent(series, "2026-09-15")),
    ).toBe("event-event-1-2026-09-15");
    expect(
      planEntryKey(planEntryForEvent(series, "2026-09-22")),
    ).not.toBe(planEntryKey(planEntryForEvent(series, "2026-09-15")));
    expect(planEntryKey({ kind: "task", id: "t", date: null, task: task() })).toBe(
      "task-t",
    );
  });

  it("keeps the stored series on a row, not its shifted occurrence", () => {
    // upcomingPlannerEvents remaps a series to its next occurrence. If that
    // copy reached the row, editing the appointment would rewrite the
    // series start to whichever occurrence was on screen and every earlier
    // one would vanish.
    // A weekly series that began on Wednesday 5 August; today is Tuesday
    // 8 September, so the row belongs on Wednesday 9 September.
    const series = event({
      id: "e-weekly",
      recurrence: "weekly",
      starts_on: "2026-08-05",
      ends_on: "2026-08-05",
    });
    const [entry] = groupPlanEntries([], [series], TODAY).next;

    if (entry.kind !== "event") throw new Error("expected an appointment");
    expect(entry.event).toBe(series);
    expect(entry.event.starts_on).toBe("2026-08-05");
    expect(entry.date).toBe("2026-09-09");
    expect(entry.occurrenceStart).toBe("2026-09-09");
  });

  it("dates a multi-day appointment from its occurrence, not the day tapped", () => {
    const trip = event({
      id: "e-trip",
      starts_on: "2026-09-20",
      ends_on: "2026-09-22",
    });
    const [middle] = planEntriesForDay(
      [],
      [trip],
      new Date("2026-09-21T12:00:00"),
    );

    if (middle.kind !== "event") throw new Error("expected an appointment");
    expect(middle.date).toBe("2026-09-21");
    expect(middle.occurrenceStart).toBe("2026-09-20");
  });

  it("finds the occurrence start of a repeating multi-day appointment", () => {
    const series = event({
      id: "e-weekend",
      recurrence: "weekly",
      starts_on: "2026-09-05",
      ends_on: "2026-09-06",
    });
    const [second] = planEntriesForDay(
      [],
      [series],
      new Date("2026-09-13T12:00:00"),
    );

    if (second.kind !== "event") throw new Error("expected an appointment");
    expect(second.date).toBe("2026-09-13");
    expect(second.occurrenceStart).toBe("2026-09-12");
    expect(second.event).toBe(series);
  });
});
