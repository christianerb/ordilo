import { validateTaskInput } from "../lib/tasks";

/**
 * The date arithmetic behind the spawn lives in exactly one place —
 * `public.task_next_recurrence` (migration 0087), covered by
 * supabase/tests/task_recurrence.sql. The client never predicts dates:
 * it finds the spawned row by lineage (recurrence_parent_id), so there is
 * no TypeScript twin left to drift. What remains here is the input
 * validation the form relies on.
 */
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
