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
// Today
// ---------------------------------------------------------------------------

/**
 * Today as the user's calendar sees it (YYYY-MM-DD, local time).
 *
 * Never `toISOString()`: that is UTC, so between local midnight and the
 * UTC day roll a task due today would be grouped under "Diese Woche"
 * while its own row reads "Heute". Grouping, drop targets, and due labels
 * all take their "today" from here.
 */
export function todayLocalDate(now = new Date()): string {
  return now.toLocaleDateString("sv-SE");
}

// ---------------------------------------------------------------------------
// Board drag-and-drop
// ---------------------------------------------------------------------------

/** The groups the Aufgaben list is split into, in display order. */
export type TaskBoardColumnId =
  | "overdue"
  | "today"
  | "this-week"
  | "later"
  | "done";

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
 * Which group a task belongs to right now.
 *
 * The single source of truth for the Aufgaben list's sections, so the
 * grouping, the drop no-op check, and any future consumer can never
 * disagree about where a task lives.
 *
 * @param task - The task (only `status` and `due_date` are read).
 * @param todayStr - Today's date as an ISO string (YYYY-MM-DD).
 */
export function getTaskGroup(
  task: { status: string; due_date: string | null },
  todayStr: string,
): TaskBoardColumnId {
  if (task.status === "done") return "done";
  const in7DaysStr = shiftDate(todayStr, 7);
  if (task.due_date === null || task.due_date > in7DaysStr) return "later";
  if (task.due_date < todayStr) return "overdue";
  if (task.due_date === todayStr) return "today";
  return "this-week";
}

/**
 * Compute the task updates needed when a task is dropped onto another
 * group. Returns `null` when the task already belongs there (no-op drop).
 *
 * Group semantics:
 * - "done"       → status "done", due date kept
 * - "today"      → status "open", due date set to today
 * - "this-week"  → status "open", due date set to tomorrow
 * - "later"      → status "open", due date cleared (no pressure)
 * - "overdue"    → status "open", due date set to yesterday
 *
 * @param task - The dropped task (only `status` and `due_date` are read).
 * @param targetColumnId - The group the task was dropped on.
 * @param todayStr - Today's date as an ISO string (YYYY-MM-DD).
 * @returns The updates to apply, or `null` for a no-op drop.
 */
export function getTaskDropUpdates(
  task: { status: string; due_date: string | null },
  targetColumnId: TaskBoardColumnId,
  todayStr: string,
): TaskDropUpdates | null {
  if (getTaskGroup(task, todayStr) === targetColumnId) return null;

  switch (targetColumnId) {
    case "done":
      return { status: "done", due_date: task.due_date };
    case "today":
      return { status: "open", due_date: todayStr };
    case "this-week":
      return { status: "open", due_date: shiftDate(todayStr, 1) };
    case "later":
      return { status: "open", due_date: null };
    case "overdue":
      return { status: "open", due_date: shiftDate(todayStr, -1) };
  }
}

// ---------------------------------------------------------------------------
// Due-date labels
// ---------------------------------------------------------------------------

const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;
const MONTH_SHORT = [
  "Jan.",
  "Feb.",
  "März",
  "Apr.",
  "Mai",
  "Juni",
  "Juli",
  "Aug.",
  "Sep.",
  "Okt.",
  "Nov.",
  "Dez.",
] as const;

/**
 * The short, human due label a task row shows: "Heute", "Morgen", the
 * weekday for anything else inside the coming week ("Do"), and a plain
 * date beyond that ("10. Aug."). A family reads "Morgen" faster than
 * "16.08.2026", and the long form carries no more information.
 *
 * @param due - The task's due date (YYYY-MM-DD), or null.
 * @param todayStr - Today's date as an ISO string (YYYY-MM-DD).
 * @returns The label, or null when the task has no due date.
 */
export function formatTaskDueLabel(
  due: string | null,
  todayStr: string,
): string | null {
  if (!due) return null;
  const parsed = new Date(`${due}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;

  if (due === todayStr) return "Heute";
  if (due === shiftDate(todayStr, 1)) return "Morgen";
  if (due === shiftDate(todayStr, -1)) return "Gestern";

  if (due > todayStr && due <= shiftDate(todayStr, 6)) {
    return WEEKDAY_SHORT[parsed.getUTCDay()];
  }

  return `${parsed.getUTCDate()}. ${MONTH_SHORT[parsed.getUTCMonth()]}`;
}
