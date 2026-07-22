/**
 * Task utility functions — pure helpers for task labels, priority badge
 * styling, and status filtering.
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
  priority: string;
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
// Priority labels and styling
// ---------------------------------------------------------------------------

/** German labels for each priority level. */
export const PRIORITY_LABELS: Record<string, string> = {
  high: "Hoch",
  medium: "Mittel",
  low: "Niedrig",
};

/** Numeric ranking for sorting tasks by priority (high > medium > low). */
export const PRIORITY_RANK: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/** Default priority label for unknown values. */
const DEFAULT_PRIORITY_LABEL = "Mittel";

/**
 * Get the German label for a priority value.
 *
 * @param priority - One of "high", "medium", "low" (or any string).
 * @returns The German label, defaulting to "Mittel" for unknown values.
 */
export function getPriorityLabel(priority: string): string {
  return PRIORITY_LABELS[priority] ?? DEFAULT_PRIORITY_LABEL;
}

/**
 * Whether a priority level should render as a solid colored badge.
 *
 * Only "high" gets a filled pill (Warm Apricot) — per the DESIGN.md
 * "Apricot Scarcity Rule", color should mark the exception, not the norm.
 * Medium/low priority render as quiet text instead, so a list of tasks
 * doesn't turn into a wall of colored blocks (most tasks are medium/low).
 *
 * @param priority - One of "high", "medium", "low" (or any string).
 */
export function isHighPriority(priority: string): boolean {
  return priority === "high";
}

/**
 * Get the Tailwind className string for a priority badge, color-coded
 * according to the Ordilo design system:
 * - High:   warm apricot (#E46018) background, white text — the one
 *   priority worth a visual interrupt
 * - Medium/Low: no background, mist-dark text — quiet by default
 *
 * @param priority - One of "high", "medium", "low" (or any string).
 * @returns A className string for the badge.
 */
export function getPriorityBadgeClasses(priority: string): string {
  return isHighPriority(priority) ? "text-white" : "text-[var(--mist-dark)]";
}

/**
 * Get the inline background style for a priority badge.
 *
 * Returns a React style object with the appropriate CSS variable or color.
 * This is used alongside `getPriorityBadgeClasses` for the text color.
 * Medium/low priorities get no background (quiet text, not a badge).
 *
 * @param priority - One of "high", "medium", "low" (or any string).
 * @returns A React CSSProperties object with the background color.
 */
export function getPriorityBadgeStyle(
  priority: string,
): React.CSSProperties {
  return isHighPriority(priority)
    ? { backgroundColor: "var(--apricot)" }
    : {};
}

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
 * Sort tasks by priority (high first) then by due date (soonest first).
 * Tasks without a due date are placed after those with a due date within
 * the same priority group.
 *
 * @param tasks - The list of tasks to sort.
 * @returns A new sorted array (does not mutate the input).
 */
export function sortTasksByPriorityAndDate<
  T extends { priority: string; due_date: string | null },
>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const rankDiff =
      (PRIORITY_RANK[b.priority] ?? 2) - (PRIORITY_RANK[a.priority] ?? 2);
    if (rankDiff !== 0) return rankDiff;

    // Within the same priority, sort by due date (soonest first).
    // Tasks without a due date go last.
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  });
}
