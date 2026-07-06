import { describe, it, expect } from "vitest";
import {
  filterHeuteWichtig,
  filterFristen,
  formatGermanTimestamp,
  type HomeTask,
} from "@/lib/home-utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<HomeTask> = {}): HomeTask {
  return {
    id: "task-1",
    family_id: "fam-1",
    title: "Rechnung bezahlen",
    due_date: "2026-07-10",
    priority: "high",
    status: "open",
    confidence: 0.9,
    confirmed: true,
    created_at: "2026-07-01T00:00:00Z",
    document_id: "doc-1",
    document_title: "Stromrechnung",
    ...overrides,
  };
}

// Reference date: 2026-07-06 (today)
const TODAY = new Date(2026, 6, 6); // month is 0-indexed (6 = July)

// ---------------------------------------------------------------------------
// filterHeuteWichtig
// ---------------------------------------------------------------------------

describe("filterHeuteWichtig", () => {
  it("returns confirmed open tasks due within the next 7 days", () => {
    const tasks = [
      makeTask({ id: "t1", due_date: "2026-07-06" }), // today
      makeTask({ id: "t2", due_date: "2026-07-08" }), // in 2 days
      makeTask({ id: "t3", due_date: "2026-07-13" }), // in 7 days (boundary)
    ];
    const result = filterHeuteWichtig(tasks, TODAY);
    expect(result).toHaveLength(3);
    expect(result.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("excludes tasks due beyond 7 days", () => {
    const tasks = [
      makeTask({ id: "t1", due_date: "2026-07-06" }),
      makeTask({ id: "t2", due_date: "2026-07-14" }), // 8 days out
      makeTask({ id: "t3", due_date: "2026-08-01" }), // far future
    ];
    const result = filterHeuteWichtig(tasks, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t1");
  });

  it("includes overdue tasks (due_date before today)", () => {
    const tasks = [
      makeTask({ id: "t1", due_date: "2026-07-01" }), // overdue
      makeTask({ id: "t2", due_date: "2026-07-06" }), // today
    ];
    const result = filterHeuteWichtig(tasks, TODAY);
    expect(result).toHaveLength(2);
  });

  it("excludes tasks with status done or dismissed", () => {
    const tasks = [
      makeTask({ id: "t1", due_date: "2026-07-06", status: "done" }),
      makeTask({ id: "t2", due_date: "2026-07-06", status: "dismissed" }),
      makeTask({ id: "t3", due_date: "2026-07-06", status: "open" }),
    ];
    const result = filterHeuteWichtig(tasks, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t3");
  });

  it("excludes unconfirmed tasks", () => {
    const tasks = [
      makeTask({ id: "t1", due_date: "2026-07-06", confirmed: false }),
      makeTask({ id: "t2", due_date: "2026-07-06", confirmed: true }),
    ];
    const result = filterHeuteWichtig(tasks, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t2");
  });

  it("excludes tasks with null due_date", () => {
    const tasks = [
      makeTask({ id: "t1", due_date: null }),
      makeTask({ id: "t2", due_date: "2026-07-06" }),
    ];
    const result = filterHeuteWichtig(tasks, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t2");
  });

  it("sorts results by due_date ascending (soonest first)", () => {
    const tasks = [
      makeTask({ id: "t3", due_date: "2026-07-10" }),
      makeTask({ id: "t1", due_date: "2026-07-06" }),
      makeTask({ id: "t2", due_date: "2026-07-08" }),
    ];
    const result = filterHeuteWichtig(tasks, TODAY);
    expect(result.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
  });
});

// ---------------------------------------------------------------------------
// filterFristen
// ---------------------------------------------------------------------------

describe("filterFristen", () => {
  it("returns confirmed open tasks with future due_date (>= today)", () => {
    const tasks = [
      makeTask({ id: "t1", due_date: "2026-07-06" }), // today
      makeTask({ id: "t2", due_date: "2026-07-20" }), // future
      makeTask({ id: "t3", due_date: "2026-08-01" }), // far future
    ];
    const result = filterFristen(tasks, TODAY);
    expect(result).toHaveLength(3);
  });

  it("excludes overdue tasks (due_date before today)", () => {
    const tasks = [
      makeTask({ id: "t1", due_date: "2026-07-01" }), // overdue
      makeTask({ id: "t2", due_date: "2026-07-06" }), // today
    ];
    const result = filterFristen(tasks, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t2");
  });

  it("excludes tasks with status done or dismissed", () => {
    const tasks = [
      makeTask({ id: "t1", due_date: "2026-07-06", status: "done" }),
      makeTask({ id: "t2", due_date: "2026-07-06", status: "open" }),
    ];
    const result = filterFristen(tasks, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t2");
  });

  it("excludes unconfirmed tasks", () => {
    const tasks = [
      makeTask({ id: "t1", due_date: "2026-07-06", confirmed: false }),
      makeTask({ id: "t2", due_date: "2026-07-06", confirmed: true }),
    ];
    const result = filterFristen(tasks, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t2");
  });

  it("excludes tasks with null due_date", () => {
    const tasks = [
      makeTask({ id: "t1", due_date: null }),
      makeTask({ id: "t2", due_date: "2026-07-06" }),
    ];
    const result = filterFristen(tasks, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t2");
  });

  it("sorts results by due_date ascending (soonest first)", () => {
    const tasks = [
      makeTask({ id: "t3", due_date: "2026-08-01" }),
      makeTask({ id: "t1", due_date: "2026-07-06" }),
      makeTask({ id: "t2", due_date: "2026-07-20" }),
    ];
    const result = filterFristen(tasks, TODAY);
    expect(result.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
  });
});

// ---------------------------------------------------------------------------
// formatGermanTimestamp
// ---------------------------------------------------------------------------

describe("formatGermanTimestamp", () => {
  it("formats an ISO timestamp as German datetime (DD.MM.YYYY, HH:MM Uhr)", () => {
    const result = formatGermanTimestamp("2026-07-06T14:30:00Z");
    expect(result).toMatch(/\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2} Uhr/);
  });

  it("returns null for null input", () => {
    expect(formatGermanTimestamp(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(formatGermanTimestamp(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(formatGermanTimestamp("")).toBeNull();
  });

  it("returns null for invalid date string", () => {
    expect(formatGermanTimestamp("not-a-date")).toBeNull();
  });
});
