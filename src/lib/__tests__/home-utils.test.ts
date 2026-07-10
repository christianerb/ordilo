import { describe, it, expect } from "vitest";
import {
  filterHeuteWichtig,
  filterFristen,
  filterUeberfaellig,
  filterRecentDocuments,
  formatGermanTimestamp,
  type HomeTask,
  type HomeDocument,
} from "@/lib/home-utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<HomeTask> = {}): HomeTask {
  return {
    id: "task-1",
    family_id: "fam-1",
    title: "Rechnung bezahlen",
    description: null,
    due_date: "2026-07-10",
    priority: "high",
    status: "open",
    confidence: 0.9,
    confirmed: true,
    created_at: "2026-07-01T00:00:00Z",
    tags: [],
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

  it("excludes overdue tasks (due_date before today)", () => {
    const tasks = [
      makeTask({ id: "t1", due_date: "2026-07-01" }), // overdue → excluded
      makeTask({ id: "t2", due_date: "2026-07-06" }), // today → included
    ];
    const result = filterHeuteWichtig(tasks, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t2");
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
  it("returns confirmed open tasks with due_date beyond the 7-day horizon", () => {
    const tasks = [
      makeTask({ id: "t1", due_date: "2026-07-06" }), // today → Heute wichtig, not Fristen
      makeTask({ id: "t2", due_date: "2026-07-14" }), // 8 days out → Fristen
      makeTask({ id: "t3", due_date: "2026-08-01" }), // far future → Fristen
    ];
    const result = filterFristen(tasks, TODAY);
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id)).toEqual(["t2", "t3"]);
  });

  it("excludes tasks within the 7-day Heute wichtig horizon", () => {
    const tasks = [
      makeTask({ id: "t1", due_date: "2026-07-06" }), // today
      makeTask({ id: "t2", due_date: "2026-07-13" }), // 7 days (boundary of Heute wichtig)
      makeTask({ id: "t3", due_date: "2026-07-14" }), // 8 days → Fristen
    ];
    const result = filterFristen(tasks, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t3");
  });

  it("excludes overdue tasks (due_date before today)", () => {
    const tasks = [
      makeTask({ id: "t1", due_date: "2026-07-01" }), // overdue
      makeTask({ id: "t2", due_date: "2026-07-14" }), // 8 days out
    ];
    const result = filterFristen(tasks, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t2");
  });

  it("excludes tasks with status done or dismissed", () => {
    const tasks = [
      makeTask({ id: "t1", due_date: "2026-07-14", status: "done" }),
      makeTask({ id: "t2", due_date: "2026-07-14", status: "open" }),
    ];
    const result = filterFristen(tasks, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t2");
  });

  it("excludes unconfirmed tasks", () => {
    const tasks = [
      makeTask({ id: "t1", due_date: "2026-07-14", confirmed: false }),
      makeTask({ id: "t2", due_date: "2026-07-14", confirmed: true }),
    ];
    const result = filterFristen(tasks, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t2");
  });

  it("excludes tasks with null due_date", () => {
    const tasks = [
      makeTask({ id: "t1", due_date: null }),
      makeTask({ id: "t2", due_date: "2026-07-14" }),
    ];
    const result = filterFristen(tasks, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t2");
  });

  it("sorts results by due_date ascending (soonest first)", () => {
    const tasks = [
      makeTask({ id: "t3", due_date: "2026-08-01" }),
      makeTask({ id: "t1", due_date: "2026-07-14" }),
      makeTask({ id: "t2", due_date: "2026-07-20" }),
    ];
    const result = filterFristen(tasks, TODAY);
    expect(result.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
  });
});

// ---------------------------------------------------------------------------
// filterUeberfaellig
// ---------------------------------------------------------------------------

describe("filterUeberfaellig", () => {
  it("returns confirmed open tasks with due_date before today", () => {
    const tasks = [
      makeTask({ id: "t1", due_date: "2026-07-01" }), // overdue
      makeTask({ id: "t2", due_date: "2026-06-15" }), // more overdue
      makeTask({ id: "t3", due_date: "2026-07-06" }), // today → not overdue
    ];
    const result = filterUeberfaellig(tasks, TODAY);
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id)).toEqual(["t2", "t1"]); // most overdue first
  });

  it("excludes tasks due today or in the future", () => {
    const tasks = [
      makeTask({ id: "t1", due_date: "2026-07-06" }), // today
      makeTask({ id: "t2", due_date: "2026-07-10" }), // future
    ];
    const result = filterUeberfaellig(tasks, TODAY);
    expect(result).toHaveLength(0);
  });

  it("excludes tasks with status done or dismissed", () => {
    const tasks = [
      makeTask({ id: "t1", due_date: "2026-07-01", status: "done" }),
      makeTask({ id: "t2", due_date: "2026-07-01", status: "open" }),
    ];
    const result = filterUeberfaellig(tasks, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t2");
  });

  it("excludes unconfirmed tasks", () => {
    const tasks = [
      makeTask({ id: "t1", due_date: "2026-07-01", confirmed: false }),
      makeTask({ id: "t2", due_date: "2026-07-01", confirmed: true }),
    ];
    const result = filterUeberfaellig(tasks, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t2");
  });

  it("excludes tasks with null due_date", () => {
    const tasks = [
      makeTask({ id: "t1", due_date: null }),
      makeTask({ id: "t2", due_date: "2026-07-01" }),
    ];
    const result = filterUeberfaellig(tasks, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t2");
  });
});

// ---------------------------------------------------------------------------
// filterRecentDocuments
// ---------------------------------------------------------------------------

function makeDoc(overrides: Partial<HomeDocument> = {}): HomeDocument {
  return {
    id: "doc-1",
    title: "Arztbrief",
    original_filename: "arzt.pdf",
    mime_type: "application/pdf",
    status: "confirmed",
    created_at: "2026-07-06T14:30:00Z",
    ...overrides,
  };
}

describe("filterRecentDocuments", () => {
  it("excludes documents with status='failed'", () => {
    const docs = [
      makeDoc({ id: "d1", status: "confirmed", created_at: "2026-07-06T14:30:00Z" }),
      makeDoc({ id: "d2", status: "failed", created_at: "2026-07-06T15:00:00Z" }),
      makeDoc({ id: "d3", status: "analyzed", created_at: "2026-07-05T10:00:00Z" }),
    ];
    const result = filterRecentDocuments(docs);
    expect(result.map((d) => d.id)).toEqual(["d1", "d3"]);
    expect(result.find((d) => d.status === "failed")).toBeUndefined();
  });

  it("keeps non-failed documents of all other statuses", () => {
    const statuses = ["uploaded", "ocr_done", "confirmed"];
    const docs = statuses.map((status, i) =>
      makeDoc({ id: `d${i}`, status, created_at: `2026-07-0${i + 1}T10:00:00Z` }),
    );
    const result = filterRecentDocuments(docs);
    expect(result).toHaveLength(statuses.length);
  });

  it("returns all documents when none are failed", () => {
    const docs = [
      makeDoc({ id: "d1", status: "confirmed" }),
      makeDoc({ id: "d2", status: "analyzed" }),
    ];
    const result = filterRecentDocuments(docs);
    expect(result).toHaveLength(2);
  });

  it("returns empty array when all documents are failed", () => {
    const docs = [
      makeDoc({ id: "d1", status: "failed" }),
      makeDoc({ id: "d2", status: "failed" }),
    ];
    const result = filterRecentDocuments(docs);
    expect(result).toHaveLength(0);
  });

  it("respects the limit (RECENT_DOCS_LIMIT)", () => {
    const docs = Array.from({ length: 10 }, (_, i) =>
      makeDoc({ id: `d${i}`, status: "confirmed", created_at: `2026-07-0${i}T10:00:00Z` }),
    );
    const result = filterRecentDocuments(docs);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("preserves the input order (created_at desc from DB)", () => {
    const docs = [
      makeDoc({ id: "d1", status: "confirmed", created_at: "2026-07-06T14:30:00Z" }),
      makeDoc({ id: "d2", status: "failed", created_at: "2026-07-06T15:00:00Z" }),
      makeDoc({ id: "d3", status: "analyzed", created_at: "2026-07-05T10:00:00Z" }),
      makeDoc({ id: "d4", status: "confirmed", created_at: "2026-07-04T09:00:00Z" }),
    ];
    const result = filterRecentDocuments(docs);
    expect(result.map((d) => d.id)).toEqual(["d1", "d3", "d4"]);
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
