import { describe, expect, it } from "vitest";
import {
  buildTodayTimeline,
  buildUpcomingPreview,
  expandHomeEventOccurrences,
  filterNext7DaysTasks,
  filterTodayOccurrences,
  filterUpcomingOccurrences,
  sortEventOccurrencesForDay,
  toConflictCheckEvent,
  type HomeEventRow,
} from "@/lib/home-events";
import type { HomeTask } from "@/lib/home-utils";

const REFERENCE = new Date("2026-07-06T12:00:00Z"); // Monday

function makeEvent(overrides: Partial<HomeEventRow> = {}): HomeEventRow {
  return {
    id: "event-1",
    title: "Zahnarzt",
    starts_on: "2026-07-06",
    ends_on: "2026-07-06",
    all_day: false,
    starts_time: "14:30",
    ends_time: "15:00",
    recurrence: "none",
    recurrence_until: null,
    recurrence_exceptions: [],
    location: null,
    responsible_member_id: null,
    attendee_names: [],
    ...overrides,
  };
}

function makeTask(overrides: Partial<HomeTask> = {}): HomeTask {
  return {
    id: "task-1",
    family_id: "family-1",
    title: "Schulsachen final bestätigen",
    description: null,
    due_date: "2026-07-06",
    status: "open",
    confidence: 1,
    confirmed: true,
    created_at: "2026-07-01T00:00:00Z",
    tags: [],
    document_id: null,
    ...overrides,
  };
}

describe("expandHomeEventOccurrences", () => {
  it("returns a one-off event only on the day it happens", () => {
    const occurrences = expandHomeEventOccurrences(
      [makeEvent()],
      REFERENCE,
      7,
    );
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].date).toBe("2026-07-06");
  });

  it("expands a weekly recurrence across the horizon", () => {
    const occurrences = expandHomeEventOccurrences(
      [
        makeEvent({
          id: "weekly-1",
          starts_on: "2026-06-29",
          ends_on: "2026-06-29",
          recurrence: "weekly",
        }),
      ],
      REFERENCE,
      7,
    );
    // The series started 2026-06-29 (Monday) and repeats weekly; within
    // the 7-day horizon [2026-07-06, 2026-07-13] it lands on both ends.
    expect(occurrences.map((o) => o.date)).toEqual([
      "2026-07-06",
      "2026-07-13",
    ]);
  });

  it("drops the clock time for all-day events", () => {
    const occurrences = expandHomeEventOccurrences(
      [makeEvent({ all_day: true, starts_time: "09:00" })],
      REFERENCE,
      0,
    );
    expect(occurrences[0].starts_time).toBeNull();
  });
});

describe("sortEventOccurrencesForDay / filterTodayOccurrences", () => {
  it("puts all-day entries before timed ones, then sorts by time", () => {
    const occurrences = expandHomeEventOccurrences(
      [
        makeEvent({ id: "b", starts_time: "14:30", title: "Zahnarzt" }),
        makeEvent({ id: "a", starts_time: "09:00", title: "Schulstart" }),
        makeEvent({ id: "c", all_day: true, title: "Kita geschlossen" }),
      ],
      REFERENCE,
      0,
    );
    const sorted = sortEventOccurrencesForDay(occurrences);
    expect(sorted.map((o) => o.title)).toEqual([
      "Kita geschlossen",
      "Schulstart",
      "Zahnarzt",
    ]);
  });

  it("filterTodayOccurrences excludes other days", () => {
    const occurrences = expandHomeEventOccurrences(
      [makeEvent({ starts_on: "2026-07-08", ends_on: "2026-07-08" })],
      REFERENCE,
      7,
    );
    expect(filterTodayOccurrences(occurrences, "2026-07-06")).toHaveLength(0);
    expect(filterTodayOccurrences(occurrences, "2026-07-08")).toHaveLength(1);
  });
});

describe("filterUpcomingOccurrences", () => {
  it("excludes today and sorts the rest soonest-first", () => {
    const occurrences = [
      { id: "1", title: "A", date: "2026-07-06", starts_time: null, all_day: true, location: null, attendee_names: [] },
      { id: "2", title: "B", date: "2026-07-09", starts_time: null, all_day: true, location: null, attendee_names: [] },
      { id: "3", title: "C", date: "2026-07-07", starts_time: null, all_day: true, location: null, attendee_names: [] },
    ];
    const upcoming = filterUpcomingOccurrences(occurrences, "2026-07-06");
    expect(upcoming.map((o) => o.id)).toEqual(["3", "2"]);
  });
});

describe("buildTodayTimeline", () => {
  it("lists timed/all-day events first, then tasks due today", () => {
    const timeline = buildTodayTimeline(
      [
        { id: "e1", title: "Zahnarzt", date: "2026-07-06", starts_time: "14:30", all_day: false, location: null, attendee_names: [] },
      ],
      [makeTask()],
    );
    expect(timeline.map((item) => item.kind)).toEqual(["event", "task"]);
  });
});

describe("filterNext7DaysTasks", () => {
  it("excludes today and anything beyond the horizon", () => {
    const tasks = [
      makeTask({ id: "today", due_date: "2026-07-06" }),
      makeTask({ id: "soon", due_date: "2026-07-09" }),
      makeTask({ id: "far", due_date: "2026-07-20" }),
      makeTask({ id: "unconfirmed", due_date: "2026-07-08", confirmed: false }),
    ];
    const result = filterNext7DaysTasks(tasks, REFERENCE, 7);
    expect(result.map((t) => t.id)).toEqual(["soon"]);
  });
});

describe("buildUpcomingPreview", () => {
  it("merges tasks and events, sorted soonest first", () => {
    const preview = buildUpcomingPreview(
      [makeTask({ id: "u7", title: "U7 Nora", due_date: "2026-07-10" })],
      [
        { id: "voucher", title: "Kita-Gutschein", date: "2026-07-08", starts_time: null, all_day: true, location: null, attendee_names: [] },
      ],
    );
    expect(preview.map((item) => item.title)).toEqual([
      "Kita-Gutschein",
      "U7 Nora",
    ]);
  });
});

describe("toConflictCheckEvent", () => {
  it("carries over the fields findScheduleConflicts needs", () => {
    const row = makeEvent({ ends_time: "15:00", responsible_member_id: "m1" });
    const event = toConflictCheckEvent(row);
    expect(event.starts_time).toBe("14:30");
    expect(event.ends_time).toBe("15:00");
    expect(event.responsible_member_id).toBe("m1");
    expect(event.attendees).toEqual([]);
  });
});
