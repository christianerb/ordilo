/**
 * Task utility functions — pure helpers for task labels and status
 * filtering.
 *
 * All labels are in German (UI text). Code and comments are in English.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A task row from the `tasks` table (subset used by the UI). */
export interface TaskRow {
  id: string;
  family_id: string;
  document_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  confidence: number;
  confirmed: boolean;
  created_at: string;
  tags: string[];
  assigned_to: string | null;
}

/** The three status filter options shown in the Aufgaben tab. */
export type TaskStatusFilter = "open" | "done" | "all";

// ---------------------------------------------------------------------------
// Task status labels
// ---------------------------------------------------------------------------

/** German labels for each task status. */
export const TASK_STATUS_LABELS: Record<string, string> = {
  open: "Offen",
  done: "Erledigt",
  dismissed: "Verworfen",
};

/** Default status label for unknown values. */
const DEFAULT_STATUS_LABEL = "Offen";

/**
 * Get the German label for a task status.
 *
 * @param status - One of "open", "done", "dismissed" (or any string).
 * @returns The German label, defaulting to "Offen" for unknown values.
 */
export function getTaskStatusLabel(status: string): string {
  return TASK_STATUS_LABELS[status] ?? DEFAULT_STATUS_LABEL;
}

// ---------------------------------------------------------------------------
// Filter labels
// ---------------------------------------------------------------------------

/** German labels for the status filter options in the Aufgaben tab. */
export const TASK_FILTER_LABELS: Record<TaskStatusFilter, string> = {
  open: "Offen",
  done: "Erledigt",
  all: "Alle",
};

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/**
 * Filter an array of tasks by the given status filter.
 *
 * - "open"    → only tasks with status "open"
 * - "done"    → only tasks with status "done"
 * - "all"     → all tasks regardless of status
 *
 * @param tasks - The full list of tasks.
 * @param filter - The status filter to apply.
 * @returns The filtered task list.
 */
export function filterTasksByStatus<
  T extends { status: string },
>(tasks: T[], filter: TaskStatusFilter): T[] {
  if (filter === "all") return tasks;
  return tasks.filter((t) => t.status === filter);
}

/**
 * Sort tasks by due date (soonest first). Tasks without a due date are
 * placed after those with a due date.
 *
 * @param tasks - The list of tasks to sort.
 * @returns A new sorted array (does not mutate the input).
 */
export function sortTasksByDate<
  T extends { due_date: string | null },
>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  });
}

// ---------------------------------------------------------------------------
// Board drag-and-drop
// ---------------------------------------------------------------------------

/** The four column ids of the Aufgaben board. */
export type TaskBoardColumnId = "overdue" | "this-week" | "later" | "done";

/** Fields of a task that a board drop can change. */
export interface TaskDropUpdates {
  status: string;
  due_date: string | null;
}

const DAY_MS = 86_400_000;

/** Shift an ISO date string (YYYY-MM-DD) by whole days, UTC-safe. */
function shiftDate(dateStr: string, days: number): string {
  return new Date(new Date(`${dateStr}T00:00:00Z`).getTime() + days * DAY_MS)
    .toISOString()
    .split("T")[0];
}

/**
 * Compute the task updates needed when a task is dropped onto a board
 * column. Returns `null` when the task already belongs to the target
 * column (no-op drop).
 *
 * Column semantics:
 * - "done"       → status "done", due date kept
 * - "this-week"  → status "open", due date set to today
 * - "later"      → status "open", due date cleared (no pressure)
 * - "overdue"    → status "open", due date set to yesterday
 *
 * @param task - The dropped task (only `status` and `due_date` are read).
 * @param targetColumnId - The column the task was dropped on.
 * @param todayStr - Today's date as an ISO string (YYYY-MM-DD).
 * @returns The updates to apply, or `null` for a no-op drop.
 */
export function getTaskDropUpdates(
  task: { status: string; due_date: string | null },
  targetColumnId: TaskBoardColumnId,
  todayStr: string,
): TaskDropUpdates | null {
  const in7DaysStr = shiftDate(todayStr, 7);

  switch (targetColumnId) {
    case "done":
      if (task.status === "done") return null;
      return { status: "done", due_date: task.due_date };
    case "this-week": {
      const isThisWeek =
        task.status === "open" &&
        task.due_date !== null &&
        task.due_date >= todayStr &&
        task.due_date <= in7DaysStr;
      if (isThisWeek) return null;
      return { status: "open", due_date: todayStr };
    }
    case "later": {
      const isLater =
        task.status === "open" &&
        (task.due_date === null || task.due_date > in7DaysStr);
      if (isLater) return null;
      return { status: "open", due_date: null };
    }
    case "overdue": {
      const isOverdue =
        task.status === "open" &&
        task.due_date !== null &&
        task.due_date < todayStr;
      if (isOverdue) return null;
      return { status: "open", due_date: shiftDate(todayStr, -1) };
    }
  }
}
