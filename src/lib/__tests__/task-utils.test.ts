import { describe, it, expect } from "vitest";
import {
  TASK_STATUS_LABELS,
  TASK_FILTER_LABELS,
  getTaskStatusLabel,
  filterTasksByStatus,
  getTaskSection,
  resolveSchedulePreset,
  formatTaskDueLabel,
  formatTaskDayHint,
  formatOverdueLabel,
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
  // Sections
  // ---------------------------------------------------------------------------

  describe("getTaskSection", () => {
    const TODAY = "2026-08-10";

    it("puts a done task in 'done' regardless of its date", () => {
      expect(
        getTaskSection({ status: "done", due_date: "2026-08-01" }, TODAY),
      ).toBe("done");
      expect(getTaskSection({ status: "done", due_date: null }, TODAY)).toBe(
        "done",
      );
    });

    it("treats overdue and today alike — both are 'jetzt dran'", () => {
      expect(
        getTaskSection({ status: "open", due_date: "2026-07-01" }, TODAY),
      ).toBe("now");
      expect(
        getTaskSection({ status: "open", due_date: "2026-08-09" }, TODAY),
      ).toBe("now");
      expect(getTaskSection({ status: "open", due_date: TODAY }, TODAY)).toBe(
        "now",
      );
    });

    it("puts everything still to come in 'next', however far out", () => {
      expect(
        getTaskSection({ status: "open", due_date: "2026-08-11" }, TODAY),
      ).toBe("next");
      // No seven-day cliff: a task in three weeks is simply still ahead.
      expect(
        getTaskSection({ status: "open", due_date: "2026-09-01" }, TODAY),
      ).toBe("next");
    });

    it("gives an undated task its own section rather than calling it 'later'", () => {
      expect(getTaskSection({ status: "open", due_date: null }, TODAY)).toBe(
        "undated",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Rescheduling
  // ---------------------------------------------------------------------------

  describe("resolveSchedulePreset", () => {
    const MONDAY = "2026-08-10";

    it("resolves today and tomorrow", () => {
      expect(resolveSchedulePreset("today", MONDAY)).toBe(MONDAY);
      expect(resolveSchedulePreset("tomorrow", MONDAY)).toBe("2026-08-11");
    });

    it("resolves 'Wochenende' to the coming Saturday", () => {
      expect(resolveSchedulePreset("weekend", MONDAY)).toBe("2026-08-15");
      // From a Friday, still the very next day.
      expect(resolveSchedulePreset("weekend", "2026-08-14")).toBe("2026-08-15");
    });

    it("never resolves to today, so the task actually moves", () => {
      // Saturday: "Wochenende" means the next one, not a no-op.
      expect(resolveSchedulePreset("weekend", "2026-08-15")).toBe("2026-08-22");
      // Monday: "Nächste Woche" means next Monday.
      expect(resolveSchedulePreset("next-week", MONDAY)).toBe("2026-08-17");
    });

    it("resolves 'Nächste Woche' to the coming Monday", () => {
      expect(resolveSchedulePreset("next-week", "2026-08-13")).toBe(
        "2026-08-17",
      );
    });

    it("clears the date for 'Kein Termin'", () => {
      expect(resolveSchedulePreset("none", MONDAY)).toBeNull();
    });
  });

  describe("formatOverdueLabel", () => {
    const TODAY = "2026-08-10";

    it("counts the days a task is late", () => {
      expect(formatOverdueLabel("2026-08-09", TODAY)).toBe("seit gestern");
      expect(formatOverdueLabel("2026-08-07", TODAY)).toBe("seit 3 Tagen");
      expect(formatOverdueLabel("2026-07-29", TODAY)).toBe("seit 12 Tagen");
    });

    it("switches to weeks once days stop being useful", () => {
      // 14 days is the crossover; below it the exact count still helps.
      expect(formatOverdueLabel("2026-07-31", TODAY)).toBe("seit 10 Tagen");
      expect(formatOverdueLabel("2026-07-27", TODAY)).toBe("seit 2 Wochen");
      expect(formatOverdueLabel("2026-06-01", TODAY)).toBe("seit 10 Wochen");
    });

    it("returns null for anything not overdue", () => {
      expect(formatOverdueLabel(TODAY, TODAY)).toBeNull();
      expect(formatOverdueLabel("2026-08-11", TODAY)).toBeNull();
      expect(formatOverdueLabel(null, TODAY)).toBeNull();
    });
  });

  describe("formatTaskDayHint", () => {
    it("spells out which day a preset lands on", () => {
      expect(formatTaskDayHint("2026-08-15")).toBe("Sa, 15. Aug.");
      expect(formatTaskDayHint("2026-09-01")).toBe("Di, 1. Sep.");
    });

    it("returns null without a date", () => {
      expect(formatTaskDayHint(null)).toBeNull();
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
