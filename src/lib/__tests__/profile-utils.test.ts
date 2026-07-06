import { describe, it, expect } from "vitest";
import {
  buildTimelineEvents,
  sortTimelineEvents,
  type ProfileDocument,
  type ProfileTask,
  type ProfileDateEntity,
  type TimelineEvent,
} from "@/lib/profile-utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDocument(
  overrides: Partial<ProfileDocument> = {},
): ProfileDocument {
  return {
    id: "doc-1",
    title: "Stromrechnung Juli",
    document_type: "invoice",
    status: "confirmed",
    created_at: "2026-07-01T10:00:00Z",
    confirmed_at: "2026-07-02T12:00:00Z",
    original_filename: "invoice.pdf",
    ...overrides,
  };
}

function makeTask(overrides: Partial<ProfileTask> = {}): ProfileTask {
  return {
    id: "task-1",
    title: "Rechnung bezahlen",
    due_date: "2026-07-15",
    priority: "high",
    status: "open",
    document_id: "doc-1",
    ...overrides,
  };
}

function makeDateEntity(
  overrides: Partial<ProfileDateEntity> = {},
): ProfileDateEntity {
  return {
    id: "ent-1",
    entity_value: "2026-08-15",
    document_id: "doc-1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildTimelineEvents
// ---------------------------------------------------------------------------

describe("buildTimelineEvents", () => {
  it("returns an empty array when no documents, tasks, or dates are provided", () => {
    const events = buildTimelineEvents([], [], []);
    expect(events).toEqual([]);
  });

  it("creates a document event using confirmed_at as the date", () => {
    const doc = makeDocument({
      confirmed_at: "2026-07-02T12:00:00Z",
      title: "Kita-Brief",
    });
    const events = buildTimelineEvents([doc], [], []);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("document");
    expect(events[0].date).toBe("2026-07-02");
    expect(events[0].title).toBe("Kita-Brief");
  });

  it("falls back to created_at when confirmed_at is null", () => {
    const doc = makeDocument({
      confirmed_at: null,
      created_at: "2026-06-15T08:00:00Z",
      title: "Arztbrief",
    });
    const events = buildTimelineEvents([doc], [], []);
    expect(events).toHaveLength(1);
    expect(events[0].date).toBe("2026-06-15");
  });

  it("skips documents with no usable date (confirmed_at null and created_at empty)", () => {
    const doc = makeDocument({
      confirmed_at: null,
      created_at: "",
    });
    const events = buildTimelineEvents([doc], [], []);
    expect(events).toHaveLength(0);
  });

  it("creates a task event using due_date as the date", () => {
    const task = makeTask({
      title: "Formular abgeben",
      due_date: "2026-08-20",
    });
    const events = buildTimelineEvents([], [task], []);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("task");
    expect(events[0].date).toBe("2026-08-20");
    expect(events[0].title).toBe("Formular abgeben");
  });

  it("skips tasks with no due_date", () => {
    const task = makeTask({ due_date: null });
    const events = buildTimelineEvents([], [task], []);
    expect(events).toHaveLength(0);
  });

  it("creates a date entity event using the entity_value as the date", () => {
    const dateEntity = makeDateEntity({
      entity_value: "2026-09-01",
    });
    const events = buildTimelineEvents([], [], [dateEntity]);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("date");
    expect(events[0].date).toBe("2026-09-01");
  });

  it("skips date entities with invalid date values", () => {
    const dateEntity = makeDateEntity({
      entity_value: "not-a-date",
    });
    const events = buildTimelineEvents([], [], [dateEntity]);
    expect(events).toHaveLength(0);
  });

  it("combines documents, tasks, and date entities into a single list", () => {
    const doc = makeDocument({ confirmed_at: "2026-07-01T00:00:00Z" });
    const task = makeTask({ due_date: "2026-08-01" });
    const dateEnt = makeDateEntity({ entity_value: "2026-09-01" });
    const events = buildTimelineEvents([doc], [task], [dateEnt]);
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.type)).toContain("document");
    expect(events.map((e) => e.type)).toContain("task");
    expect(events.map((e) => e.type)).toContain("date");
  });

  it("sets the documentId on each event for linking", () => {
    const doc = makeDocument({ id: "doc-a", confirmed_at: "2026-07-01T00:00:00Z" });
    const task = makeTask({ document_id: "doc-b", due_date: "2026-08-01" });
    const dateEnt = makeDateEntity({ document_id: "doc-c", entity_value: "2026-09-01" });
    const events = buildTimelineEvents([doc], [task], [dateEnt]);
    expect(events[0].documentId).toBeDefined();
    expect(events.find((e) => e.type === "task")?.documentId).toBe("doc-b");
    expect(events.find((e) => e.type === "date")?.documentId).toBe("doc-c");
  });
});

// ---------------------------------------------------------------------------
// sortTimelineEvents
// ---------------------------------------------------------------------------

describe("sortTimelineEvents", () => {
  function makeEvent(
    date: string,
    type: TimelineEvent["type"] = "document",
  ): TimelineEvent {
    return {
      type,
      date,
      title: `Event ${date}`,
      documentId: "doc-1",
    };
  }

  it("sorts events chronologically ascending (oldest first)", () => {
    const events = [
      makeEvent("2026-08-01"),
      makeEvent("2026-06-01"),
      makeEvent("2026-07-01"),
    ];
    const sorted = sortTimelineEvents(events, "asc");
    expect(sorted.map((e) => e.date)).toEqual([
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
    ]);
  });

  it("sorts events chronologically descending (newest first)", () => {
    const events = [
      makeEvent("2026-06-01"),
      makeEvent("2026-08-01"),
      makeEvent("2026-07-01"),
    ];
    const sorted = sortTimelineEvents(events, "desc");
    expect(sorted.map((e) => e.date)).toEqual([
      "2026-08-01",
      "2026-07-01",
      "2026-06-01",
    ]);
  });

  it("does not mutate the original array", () => {
    const events = [
      makeEvent("2026-08-01"),
      makeEvent("2026-06-01"),
    ];
    const original = [...events];
    sortTimelineEvents(events, "asc");
    expect(events.map((e) => e.date)).toEqual(original.map((e) => e.date));
  });

  it("handles an empty array", () => {
    const sorted = sortTimelineEvents([], "asc");
    expect(sorted).toEqual([]);
  });

  it("handles a single event", () => {
    const events = [makeEvent("2026-07-01")];
    const sorted = sortTimelineEvents(events, "asc");
    expect(sorted).toHaveLength(1);
    expect(sorted[0].date).toBe("2026-07-01");
  });
});
