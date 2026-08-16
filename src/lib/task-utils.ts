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
  /** When it was ticked off; null while open, or if completed long ago. */
  completed_at: string | null;
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
 * How much finished work the Erledigt section keeps in view.
 *
 * Long enough to cover "did I tick that off?" and to take something back a
 * few days later; short enough that a household nine months in is not
 * carrying hundreds of rows it will never look at. Older tasks stay in the
 * database — they are simply not loaded.
 */
export const RECENT_DONE_DAYS = 7;

/**
 * The oldest completion the Aufgaben page loads, as an ISO timestamp.
 *
 * Shared by the server query and the client's realtime refetch so the two
 * can never disagree about what "recently" means.
 */
export function recentDoneCutoff(now = new Date()): string {
  return new Date(now.getTime() - RECENT_DONE_DAYS * 86_400_000).toISOString();
}

/**
 * Sort tasks by completion, most recently finished first.
 *
 * The Erledigt list is read backwards from now — "what did we just get
 * done?" — not forwards from the date something happened to be due. Tasks
 * completed before `completed_at` existed have no timestamp and sort last.
 *
 * @param tasks - The list of tasks to sort.
 * @returns A new sorted array (does not mutate the input).
 */
export function sortTasksByCompletion<
  T extends { completed_at: string | null },
>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    if (!a.completed_at && !b.completed_at) return 0;
    if (!a.completed_at) return 1;
    if (!b.completed_at) return -1;
    return b.completed_at.localeCompare(a.completed_at);
  });
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
 * UTC day roll a task due today would be grouped under "Als Nächstes"
 * while its own row reads "Heute". Sections, schedule presets, and due
 * labels all take their "today" from here.
 */
export function todayLocalDate(now = new Date()): string {
  return now.toLocaleDateString("sv-SE");
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/**
 * The sections the Aufgaben list is split into, in display order.
 *
 * Three open sections, each answering a question a family actually asks:
 * what needs doing now, what is coming up, and what has no date yet. The
 * old five-bucket split existed to give drag-and-drop somewhere to drop —
 * with the gesture gone, the sections only have to be honest.
 *
 * In particular "undated" is its own section: a task without a date is
 * not "later", it is undecided, and hiding it inside a collapsed "Später"
 * turned it into an invisible backlog.
 */
export type TaskSectionId = "now" | "next" | "undated" | "done";

/** Fields of a task that completing or rescheduling it can change. */
export interface TaskScheduleUpdates {
  status: string;
  due_date: string | null;
}

const DAY_MS = 86_400_000;

/** Parse an ISO date string (YYYY-MM-DD) as a UTC midnight timestamp. */
function parseIsoDate(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getTime();
}

/** Shift an ISO date string (YYYY-MM-DD) by whole days, UTC-safe. */
function shiftDate(dateStr: string, days: number): string {
  return new Date(parseIsoDate(dateStr) + days * DAY_MS)
    .toISOString()
    .split("T")[0];
}

/** Whole days from `fromStr` to `toStr` (negative when `toStr` is earlier). */
function daysBetween(fromStr: string, toStr: string): number {
  return Math.round((parseIsoDate(toStr) - parseIsoDate(fromStr)) / DAY_MS);
}

/**
 * Which section a task belongs to right now.
 *
 * The single source of truth for the Aufgaben list, so the sections, the
 * counts, and any future consumer can never disagree about where a task
 * lives. Overdue tasks land in "now" together with today's — an overdue
 * task *is* today's work, and a permanent red "Überfällig" block is a
 * guilt wall, not a family app.
 *
 * @param task - The task (only `status` and `due_date` are read).
 * @param todayStr - Today's date as an ISO string (YYYY-MM-DD).
 */
export function getTaskSection(
  task: { status: string; due_date: string | null },
  todayStr: string,
): TaskSectionId {
  if (task.status === "done") return "done";
  if (task.due_date === null) return "undated";
  if (task.due_date <= todayStr) return "now";
  return "next";
}

// ---------------------------------------------------------------------------
// Rescheduling
// ---------------------------------------------------------------------------

/**
 * The one-tap answers to "wann?" offered by the schedule sheet.
 *
 * Dragging a row into a column used to be the only way to reschedule, and
 * it guessed: dropping into "Diese Woche" silently meant *tomorrow*,
 * dropping into "Später" silently cleared the date. These presets say out
 * loud what they do.
 */
export type TaskSchedulePreset =
  | "today"
  | "tomorrow"
  | "weekend"
  | "next-week"
  | "none";

/** German labels for the schedule presets, in offer order. */
export const TASK_SCHEDULE_PRESET_LABELS: Record<TaskSchedulePreset, string> = {
  today: "Heute",
  tomorrow: "Morgen",
  weekend: "Wochenende",
  "next-week": "Nächste Woche",
  none: "Kein Termin",
};

/** Day-of-week index (0 = Sunday) of an ISO date string. */
function weekdayOf(dateStr: string): number {
  return new Date(parseIsoDate(dateStr)).getUTCDay();
}

/**
 * The next occurrence of `weekday` strictly after `todayStr`.
 *
 * Strictly after, so "Wochenende" tapped on a Saturday means the coming
 * Saturday rather than a no-op — the family is moving the task away from
 * now, and landing it on today would read as broken.
 */
function nextWeekday(todayStr: string, weekday: number): string {
  const delta = (weekday - weekdayOf(todayStr) + 7) % 7;
  return shiftDate(todayStr, delta === 0 ? 7 : delta);
}

/**
 * The due date a schedule preset resolves to.
 *
 * @param preset - The tapped preset.
 * @param todayStr - Today's date as an ISO string (YYYY-MM-DD).
 * @returns The new due date, or `null` for "Kein Termin".
 */
export function resolveSchedulePreset(
  preset: TaskSchedulePreset,
  todayStr: string,
): string | null {
  switch (preset) {
    case "today":
      return todayStr;
    case "tomorrow":
      return shiftDate(todayStr, 1);
    case "weekend":
      return nextWeekday(todayStr, 6); // Saturday
    case "next-week":
      return nextWeekday(todayStr, 1); // Monday
    case "none":
      return null;
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

/**
 * The day a schedule preset lands on, spelled out: "Sa, 22. Aug.".
 *
 * "Wochenende" and "Nächste Woche" are only trustworthy if they say which
 * day they mean — otherwise the family is guessing again, which is exactly
 * what dragging a row into a column used to make them do.
 *
 * @param date - An ISO date string (YYYY-MM-DD), or null.
 * @returns The hint, or null when there is no date.
 */
export function formatTaskDayHint(date: string | null): string | null {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${WEEKDAY_SHORT[parsed.getUTCDay()]}, ${parsed.getUTCDate()}. ${
    MONTH_SHORT[parsed.getUTCMonth()]
  }`;
}

/**
 * How late an overdue task is, as a family would say it: "seit gestern",
 * "seit 3 Tagen", "seit 2 Wochen".
 *
 * This replaces the old red "Überfällig" section. The lateness belongs on
 * the row that is late — one quiet apricot line — not in a heading that
 * grows into a wall of everything the family did not get to.
 *
 * @param due - The task's due date (YYYY-MM-DD), or null.
 * @param todayStr - Today's date as an ISO string (YYYY-MM-DD).
 * @returns The label, or null when the task is not overdue.
 */
export function formatOverdueLabel(
  due: string | null,
  todayStr: string,
): string | null {
  if (!due || due >= todayStr) return null;
  const days = daysBetween(due, todayStr);
  if (!Number.isFinite(days) || days <= 0) return null;
  if (days === 1) return "seit gestern";
  // Days stay precise for a fortnight — "seit 10 Tagen" is more use than
  // "seit 1 Woche". Past that the exact count stops meaning anything.
  if (days < 14) return `seit ${days} Tagen`;
  return `seit ${Math.floor(days / 7)} Wochen`;
}
