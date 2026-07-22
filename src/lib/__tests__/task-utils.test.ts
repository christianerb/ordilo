import { describe, it, expect } from "vitest";
import {
  PRIORITY_LABELS,
  PRIORITY_RANK,
  TASK_STATUS_LABELS,
  TASK_FILTER_LABELS,
  getPriorityLabel,
  getPriorityBadgeClasses,
  getPriorityBadgeStyle,
  isHighPriority,
  getTaskStatusLabel,
  filterTasksByStatus,
  type TaskStatusFilter,
} from "@/lib/task-utils";
import type { TaskRow } from "@/lib/task-utils";

describe("task-utils", () => {
  // ---------------------------------------------------------------------------
  // Priority labels
  // ---------------------------------------------------------------------------

  describe("getPriorityLabel", () => {
    it("returns 'Hoch' for high priority", () => {
      expect(getPriorityLabel("high")).toBe("Hoch");
    });

    it("returns 'Mittel' for medium priority", () => {
      expect(getPriorityLabel("medium")).toBe("Mittel");
    });

    it("returns 'Niedrig' for low priority", () => {
      expect(getPriorityLabel("low")).toBe("Niedrig");
    });

    it("returns 'Mittel' as fallback for unknown priority", () => {
      expect(getPriorityLabel("unknown")).toBe("Mittel");
    });

    it("returns 'Mittel' as fallback for empty string", () => {
      expect(getPriorityLabel("")).toBe("Mittel");
    });
  });

  describe("PRIORITY_LABELS", () => {
    it("contains German labels for all three priorities", () => {
      expect(PRIORITY_LABELS.high).toBe("Hoch");
      expect(PRIORITY_LABELS.medium).toBe("Mittel");
      expect(PRIORITY_LABELS.low).toBe("Niedrig");
    });
  });

  describe("PRIORITY_RANK", () => {
    it("ranks high > medium > low", () => {
      expect(PRIORITY_RANK.high).toBeGreaterThan(PRIORITY_RANK.medium);
      expect(PRIORITY_RANK.medium).toBeGreaterThan(PRIORITY_RANK.low);
    });
  });

  // ---------------------------------------------------------------------------
  // Priority badge classes
  // ---------------------------------------------------------------------------

  describe("isHighPriority", () => {
    it("is true only for 'high'", () => {
      expect(isHighPriority("high")).toBe(true);
      expect(isHighPriority("medium")).toBe(false);
      expect(isHighPriority("low")).toBe(false);
      expect(isHighPriority("unknown")).toBe(false);
    });
  });

  describe("getPriorityBadgeClasses", () => {
    it("returns white text for high priority (solid apricot pill)", () => {
      const classes = getPriorityBadgeClasses("high");
      expect(classes).toContain("text-white");
    });

    it("returns apricot background style for high priority", () => {
      const style = getPriorityBadgeStyle("high");
      expect(style.backgroundColor).toBe("var(--apricot)");
    });

    it("returns quiet mist-dark text (no background) for medium priority", () => {
      // Per the Apricot Scarcity Rule, only "high" gets a colored badge —
      // medium/low render as plain text so most tasks stay visually quiet.
      const classes = getPriorityBadgeClasses("medium");
      expect(classes).toContain("text-[var(--mist-dark)]");
      expect(getPriorityBadgeStyle("medium").backgroundColor).toBeUndefined();
    });

    it("returns quiet mist-dark text (no background) for low priority", () => {
      const classes = getPriorityBadgeClasses("low");
      expect(classes).toContain("text-[var(--mist-dark)]");
      expect(getPriorityBadgeStyle("low").backgroundColor).toBeUndefined();
    });

    it("returns medium-priority classes as fallback for unknown priority", () => {
      const classes = getPriorityBadgeClasses("unknown");
      const mediumClasses = getPriorityBadgeClasses("medium");
      expect(classes).toBe(mediumClasses);
    });
  });

  // ---------------------------------------------------------------------------
  // Task status labels
  // ---------------------------------------------------------------------------

  describe("getTaskStatusLabel", () => {
    it("returns 'Offen' for open status", () => {
      expect(getTaskStatusLabel("open")).toBe("Offen");
    });

    it("returns 'Erledigt' for done status", () => {
      expect(getTaskStatusLabel("done")).toBe("Erledigt");
    });

    it("returns 'Verworfen' for dismissed status", () => {
      expect(getTaskStatusLabel("dismissed")).toBe("Verworfen");
    });

    it("returns 'Offen' as fallback for unknown status", () => {
      expect(getTaskStatusLabel("unknown")).toBe("Offen");
    });
  });

  describe("TASK_STATUS_LABELS", () => {
    it("contains German labels for all three statuses", () => {
      expect(TASK_STATUS_LABELS.open).toBe("Offen");
      expect(TASK_STATUS_LABELS.done).toBe("Erledigt");
      expect(TASK_STATUS_LABELS.dismissed).toBe("Verworfen");
    });
  });

  describe("TASK_FILTER_LABELS", () => {
    it("contains German labels for all three filter options", () => {
      expect(TASK_FILTER_LABELS.open).toBe("Offen");
      expect(TASK_FILTER_LABELS.done).toBe("Erledigt");
      expect(TASK_FILTER_LABELS.all).toBe("Alle");
    });
  });

  // ---------------------------------------------------------------------------
  // filterTasksByStatus
  // ---------------------------------------------------------------------------

  describe("filterTasksByStatus", () => {
    const tasks: TaskRow[] = [
      {
        id: "1",
        family_id: "fam1",
        document_id: "doc1",
        title: "Rechnung bezahlen",
        description: null,
        due_date: "2026-07-15",
        priority: "high",
        status: "open",
        confidence: 0.9,
        confirmed: true,
        created_at: "2026-07-01T00:00:00Z",
        tags: [],
        assigned_to: null,
      },
      {
        id: "2",
        family_id: "fam1",
        document_id: "doc2",
        title: "Termin vereinbaren",
        description: null,
        due_date: null,
        priority: "medium",
        status: "done",
        confidence: 0.8,
        confirmed: true,
        created_at: "2026-07-02T00:00:00Z",
        tags: [],
        assigned_to: null,
      },
      {
        id: "3",
        family_id: "fam1",
        document_id: "doc3",
        title: "Formular abgeben",
        description: null,
        due_date: "2026-08-01",
        priority: "low",
        status: "dismissed",
        confidence: 0.7,
        confirmed: true,
        created_at: "2026-07-03T00:00:00Z",
        tags: [],
        assigned_to: null,
      },
      {
        id: "4",
        family_id: "fam1",
        document_id: "doc4",
        title: "Anmeldung bestätigen",
        description: null,
        due_date: "2026-07-20",
        priority: "high",
        status: "open",
        confidence: 0.95,
        confirmed: true,
        created_at: "2026-07-04T00:00:00Z",
        tags: [],
        assigned_to: null,
      },
    ];

    it("filters to open tasks when filter is 'open'", () => {
      const result = filterTasksByStatus(tasks, "open");
      expect(result).toHaveLength(2);
      expect(result.every((t) => t.status === "open")).toBe(true);
    });

    it("filters to done tasks when filter is 'done'", () => {
      const result = filterTasksByStatus(tasks, "done");
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe("done");
    });

    it("returns all tasks when filter is 'all'", () => {
      const result = filterTasksByStatus(tasks, "all");
      expect(result).toHaveLength(4);
    });

    it("returns empty array for empty input", () => {
      expect(filterTasksByStatus([], "all")).toEqual([]);
      expect(filterTasksByStatus([], "open")).toEqual([]);
      expect(filterTasksByStatus([], "done")).toEqual([]);
    });

    it("handles filter 'open' with no open tasks", () => {
      const allDone = tasks.filter((t) => t.status !== "open");
      expect(filterTasksByStatus(allDone, "open")).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // TaskStatusFilter type
  // ---------------------------------------------------------------------------

  describe("TaskStatusFilter type", () => {
    it("accepts 'open', 'done', and 'all' values", () => {
      const validFilters: TaskStatusFilter[] = ["open", "done", "all"];
      expect(validFilters).toHaveLength(3);
    });
  });
});
