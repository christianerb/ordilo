import { describe, it, expect } from "vitest";
import {
  TASK_STATUS_LABELS,
  TASK_FILTER_LABELS,
  getTaskStatusLabel,
  filterTasksByStatus,
  getTaskDropUpdates,
  getTaskGroup,
  formatTaskDueLabel,
  type TaskStatusFilter,
} from "@/lib/task-utils";
import type { TaskRow } from "@/lib/task-utils";

describe("task-utils", () => {
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

  // ---------------------------------------------------------------------------
  // Board drag-and-drop
  // ---------------------------------------------------------------------------

  describe("getTaskDropUpdates", () => {
    const TODAY = "2026-08-10";
    const TOMORROW = "2026-08-11";
    const YESTERDAY = "2026-08-09";
    const IN_20_DAYS = "2026-08-30";

    describe("drop on 'done'", () => {
      it("completes an open task and keeps its due date", () => {
        expect(
          getTaskDropUpdates(
            { status: "open", due_date: "2026-08-12" },
            "done",
            TODAY,
          ),
        ).toEqual({ status: "done", due_date: "2026-08-12" });
      });

      it("keeps a null due date when completing", () => {
        expect(
          getTaskDropUpdates({ status: "open", due_date: null }, "done", TODAY),
        ).toEqual({ status: "done", due_date: null });
      });

      it("is a no-op for an already-done task", () => {
        expect(
          getTaskDropUpdates(
            { status: "done", due_date: "2026-08-12" },
            "done",
            TODAY,
          ),
        ).toBeNull();
      });
    });

    describe("drop on 'today'", () => {
      it("schedules a task without due date for today", () => {
        expect(
          getTaskDropUpdates({ status: "open", due_date: null }, "today", TODAY),
        ).toEqual({ status: "open", due_date: TODAY });
      });

      it("pulls a far-future task back to today", () => {
        expect(
          getTaskDropUpdates(
            { status: "open", due_date: IN_20_DAYS },
            "today",
            TODAY,
          ),
        ).toEqual({ status: "open", due_date: TODAY });
      });

      it("is a no-op for a task already due today", () => {
        expect(
          getTaskDropUpdates({ status: "open", due_date: TODAY }, "today", TODAY),
        ).toBeNull();
      });
    });

    describe("drop on 'this-week'", () => {
      it("schedules a task without due date for tomorrow", () => {
        expect(
          getTaskDropUpdates(
            { status: "open", due_date: null },
            "this-week",
            TODAY,
          ),
        ).toEqual({ status: "open", due_date: TOMORROW });
      });

      it("pulls a far-future task back into the week", () => {
        expect(
          getTaskDropUpdates(
            { status: "open", due_date: IN_20_DAYS },
            "this-week",
            TODAY,
          ),
        ).toEqual({ status: "open", due_date: TOMORROW });
      });

      it("moves an overdue task into the week", () => {
        expect(
          getTaskDropUpdates(
            { status: "open", due_date: "2026-08-01" },
            "this-week",
            TODAY,
          ),
        ).toEqual({ status: "open", due_date: TOMORROW });
      });

      it("is a no-op for a task already due later this week", () => {
        expect(
          getTaskDropUpdates(
            { status: "open", due_date: "2026-08-12" },
            "this-week",
            TODAY,
          ),
        ).toBeNull();
      });

      it("reopens a done task into the week", () => {
        expect(
          getTaskDropUpdates(
            { status: "done", due_date: "2026-08-12" },
            "this-week",
            TODAY,
          ),
        ).toEqual({ status: "open", due_date: TOMORROW });
      });
    });

    describe("drop on 'later'", () => {
      it("clears the due date of a task due this week", () => {
        expect(
          getTaskDropUpdates(
            { status: "open", due_date: "2026-08-12" },
            "later",
            TODAY,
          ),
        ).toEqual({ status: "open", due_date: null });
      });

      it("clears the due date of an overdue task", () => {
        expect(
          getTaskDropUpdates(
            { status: "open", due_date: "2026-08-01" },
            "later",
            TODAY,
          ),
        ).toEqual({ status: "open", due_date: null });
      });

      it("is a no-op for a task without due date", () => {
        expect(
          getTaskDropUpdates({ status: "open", due_date: null }, "later", TODAY),
        ).toBeNull();
      });

      it("is a no-op for a task already due beyond this week", () => {
        expect(
          getTaskDropUpdates(
            { status: "open", due_date: IN_20_DAYS },
            "later",
            TODAY,
          ),
        ).toBeNull();
      });

      it("reopens a done task and clears its due date", () => {
        expect(
          getTaskDropUpdates(
            { status: "done", due_date: "2026-08-12" },
            "later",
            TODAY,
          ),
        ).toEqual({ status: "open", due_date: null });
      });
    });

    describe("drop on 'overdue'", () => {
      it("dates an open task to yesterday", () => {
        expect(
          getTaskDropUpdates(
            { status: "open", due_date: "2026-08-12" },
            "overdue",
            TODAY,
          ),
        ).toEqual({ status: "open", due_date: YESTERDAY });
      });

      it("is a no-op for an already-overdue task", () => {
        expect(
          getTaskDropUpdates(
            { status: "open", due_date: "2026-08-01" },
            "overdue",
            TODAY,
          ),
        ).toBeNull();
      });

      it("reopens a done task and dates it to yesterday", () => {
        expect(
          getTaskDropUpdates(
            { status: "done", due_date: null },
            "overdue",
            TODAY,
          ),
        ).toEqual({ status: "open", due_date: YESTERDAY });
      });
    });
  });

  describe("getTaskGroup", () => {
    const TODAY = "2026-08-10";

    it("puts a done task in 'done' regardless of its date", () => {
      expect(getTaskGroup({ status: "done", due_date: "2026-08-01" }, TODAY)).toBe(
        "done",
      );
    });

    it("separates overdue, today, this week, and later", () => {
      expect(getTaskGroup({ status: "open", due_date: "2026-08-09" }, TODAY)).toBe(
        "overdue",
      );
      expect(getTaskGroup({ status: "open", due_date: TODAY }, TODAY)).toBe("today");
      expect(getTaskGroup({ status: "open", due_date: "2026-08-13" }, TODAY)).toBe(
        "this-week",
      );
      expect(getTaskGroup({ status: "open", due_date: "2026-09-01" }, TODAY)).toBe(
        "later",
      );
    });

    it("treats a task without a due date as 'later' — no pressure", () => {
      expect(getTaskGroup({ status: "open", due_date: null }, TODAY)).toBe("later");
    });
  });

  describe("formatTaskDueLabel", () => {
    const TODAY = "2026-08-10"; // a Monday

    it("names the days around today", () => {
      expect(formatTaskDueLabel(TODAY, TODAY)).toBe("Heute");
      expect(formatTaskDueLabel("2026-08-11", TODAY)).toBe("Morgen");
      expect(formatTaskDueLabel("2026-08-09", TODAY)).toBe("Gestern");
    });

    it("uses the weekday inside the coming week", () => {
      expect(formatTaskDueLabel("2026-08-13", TODAY)).toBe("Do");
      expect(formatTaskDueLabel("2026-08-14", TODAY)).toBe("Fr");
    });

    it("falls back to a short date further out", () => {
      expect(formatTaskDueLabel("2026-09-01", TODAY)).toBe("1. Sep.");
      // Older than yesterday: a weekday would be ambiguous.
      expect(formatTaskDueLabel("2026-08-03", TODAY)).toBe("3. Aug.");
    });

    it("returns null without a due date", () => {
      expect(formatTaskDueLabel(null, TODAY)).toBeNull();
    });
  });
});
