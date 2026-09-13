import { planSnapshotRows } from "../lib/plan-entries";
import type { PlannerEvent } from "../lib/calendar";
import {
  resolveKnownMemberId,
  type FamilyMemberOption,
  type PlannerTask,
} from "../lib/tasks";

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

describe("resolveKnownMemberId", () => {
  it("keeps a person the family actually has", () => {
    expect(resolveKnownMemberId(members, "m-karina")).toBe("m-karina");
  });

  it("ignores unknown or missing ids silently", () => {
    expect(resolveKnownMemberId(members, "m-stranger")).toBeNull();
    expect(resolveKnownMemberId(members, "")).toBeNull();
    expect(resolveKnownMemberId(members, null)).toBeNull();
    expect(resolveKnownMemberId(members, undefined)).toBeNull();
    // Even a valid id means nothing before the members have loaded.
    expect(resolveKnownMemberId([], "m-karina")).toBeNull();
  });
});

describe("planSnapshotRows", () => {
  it("maps both kinds to the offline snapshot shape", () => {
    const rows = planSnapshotRows(
      [
        {
          kind: "task",
          id: "task-1",
          date: TODAY,
          task: task({ assigned_to: "m-christian" }),
        },
        {
          kind: "event",
          id: "event-1",
          date: TODAY,
          occurrenceStart: TODAY,
          event: event({ attendee_ids: ["m-karina"] }),
        },
      ],
      members,
      TODAY,
    );

    expect(rows).toEqual([
      {
        id: "task-1",
        kind: "task",
        title: "Schulausweis abgeben",
        when: "Heute",
        person: "Christian kümmert sich",
      },
      {
        id: "event-1",
        kind: "event",
        title: "Elternabend",
        when: "Heute · Ganztägig",
        person: "Für Karina",
      },
    ]);
  });

  it("leaves when and person null when there is nothing to say", () => {
    const rows = planSnapshotRows(
      [
        {
          kind: "task",
          id: "task-1",
          date: null,
          task: task({ due_date: null }),
        },
      ],
      members,
      TODAY,
    );

    expect(rows).toEqual([
      {
        id: "task-1",
        kind: "task",
        title: "Schulausweis abgeben",
        when: null,
        person: null,
      },
    ]);
  });
});
