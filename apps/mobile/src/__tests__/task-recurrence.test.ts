import {
  nextTaskRecurrenceDate,
  validateTaskInput,
} from "../lib/tasks";

/**
 * The TypeScript twin of `public.task_next_recurrence` (migration 0087).
 * Both sides compute the same dates — the SQL version spawns the row,
 * this one predicts its due date so the new instance can arrive in the
 * list the moment the old one leaves. The expectations mirror
 * supabase/tests/task_recurrence.sql; a change on one side without the
 * other is a bug these two files are meant to catch.
 */
describe("nextTaskRecurrenceDate", () => {
  it("steps weekly from the due date, not from today", () => {
    expect(nextTaskRecurrenceDate("2026-09-21", "weekly", "2026-09-21")).toBe("2026-09-28");
  });

  it("skips occurrences already past when a task is finished late", () => {
    expect(nextTaskRecurrenceDate("2026-08-31", "weekly", "2026-09-21")).toBe("2026-09-28");
  });

  it("steps biweekly by fourteen days", () => {
    expect(nextTaskRecurrenceDate("2026-09-21", "biweekly", "2026-09-21")).toBe("2026-10-05");
  });

  it("clamps month overflow to the last valid day and anchors the chain there", () => {
    expect(nextTaskRecurrenceDate("2026-01-31", "monthly", "2026-01-31")).toBe("2026-02-28");
    expect(nextTaskRecurrenceDate("2026-02-28", "monthly", "2026-02-28")).toBe("2026-03-28");
  });

  it("clamps leap day the same way", () => {
    expect(nextTaskRecurrenceDate("2024-02-29", "yearly", "2024-02-29")).toBe("2025-02-28");
  });

  it("returns null without a rhythm or an anchor date", () => {
    expect(nextTaskRecurrenceDate("2026-09-21", "none", "2026-09-21")).toBeNull();
    expect(nextTaskRecurrenceDate("", "weekly", "2026-09-21")).toBeNull();
  });
});

describe("validateTaskInput with recurrence", () => {
  it("rejects a rhythm without a date to anchor it", () => {
    const result = validateTaskInput(
      { title: "Müll rausbringen", recurrence: "weekly" },
      "2026-09-21",
    );
    expect(result).toEqual({
      success: false,
      error: "Eine Wiederholung braucht ein Datum, an dem sie beginnt.",
    });
  });

  it("accepts a rhythm with a due date", () => {
    const result = validateTaskInput(
      { title: "Müll rausbringen", dueDate: "2026-09-22", recurrence: "weekly" },
      "2026-09-21",
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.recurrence).toBe("weekly");
  });

  it("defaults a one-off task to no recurrence", () => {
    const result = validateTaskInput(
      { title: "Rechnung bezahlen", dueDate: "2026-09-22" },
      "2026-09-21",
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.recurrence).toBe("none");
  });
});
