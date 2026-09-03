import { z } from "zod";

import { fetchAllRows } from "./collections";
import { getSupabase } from "./supabase";

/**
 * Planner tasks ("Familienplaner") for the native app.
 *
 * Fachliche Referenz ist die Web-App: die puren Helfer (Sektionen,
 * Termin-Presets, Fälligkeits-Labels, Sortierung, Erledigt-Fenster) sind
 * 1:1 aus src/lib/task-utils.ts portiert, die Schreiblogik aus
 * src/lib/hooks/use-task-mutation.ts und task-create-sheet.tsx. Der
 * native Client schreibt mit dem Publishable Key direkt gegen Supabase —
 * RLS bleibt die Autorität. Ein Datenbank-Trigger stempelt
 * `completed_at` passend zum Status, wie auf der Web-Seite.
 */

export const FRIENDLY_ERROR =
  "Etwas ist schiefgelaufen. Bitte versuche es erneut.";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A task row from the `tasks` table (subset the planner UI uses). */
export interface PlannerTask {
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

/** A family member a task can belong to. */
export interface FamilyMemberOption {
  id: string;
  name: string;
  role: string | null;
  avatar_color: string | null;
}

/**
 * The task fields a single edit can change. Undo is the same call with
 * the previous values, which is why both directions share this type.
 * `completed_at` is rarely sent — a database trigger stamps it; pass it
 * only to restore an exact earlier value when undoing.
 */
export interface TaskPatch {
  title?: string;
  description?: string | null;
  status?: string;
  due_date?: string | null;
  assigned_to?: string | null;
  completed_at?: string | null;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export const TASK_STATUS_LABELS: Record<string, string> = {
  open: "Offen",
  done: "Erledigt",
  dismissed: "Verworfen",
};

/** German label for a task status, defaulting to "Offen". */
export function getTaskStatusLabel(status: string): string {
  return TASK_STATUS_LABELS[status] ?? "Offen";
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/**
 * The sections the planner list is split into, in display order:
 * what needs doing now, what is coming up, what has no date yet, and
 * what is done. Overdue tasks land in "now" together with today's — an
 * overdue task IS today's work, and a permanent red "Überfällig" block
 * is a guilt wall, not a family app.
 */
export type TaskSectionId = "now" | "next" | "undated" | "done";

export interface TaskSectionConfig {
  id: TaskSectionId;
  label: string;
  /** Collapsed by default, showing only the first few rows. */
  collapsible?: boolean;
  /** How many rows a collapsed section shows before "+ N weitere". */
  peek?: number;
}

export const TASK_SECTIONS: readonly TaskSectionConfig[] = [
  { id: "now", label: "Jetzt dran" },
  { id: "next", label: "Als Nächstes" },
  { id: "undated", label: "Ohne Termin", collapsible: true, peek: 3 },
  { id: "done", label: "Erledigt", collapsible: true, peek: 0 },
] as const;

/**
 * Which section a task belongs to right now. The single source of truth
 * for the planner list, so sections, counts and rows never disagree.
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
// Sorting and the done window
// ---------------------------------------------------------------------------

/**
 * How much finished work the Erledigt section keeps in view. Long enough
 * to cover "did I tick that off?"; short enough that a household months
 * in is not carrying hundreds of rows it will never look at.
 */
/**
 * The line under „Plan“: what is open, before anyone reads the list.
 * Undated tasks count as open — they are the easiest to forget, so the
 * header must never say „Nichts offen“ while Ohne Termin still has rows.
 */
export function formatPlanHeaderSubtitle(counts: {
  now: number;
  next: number;
  undated: number;
  events: number;
  filterName?: string | null;
}): string {
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);
  const parts = [
    counts.now > 0 ? plural(counts.now, "1 heute dran", "heute dran") : null,
    counts.next > 0 ? plural(counts.next, "1 als Nächstes", "als Nächstes") : null,
    counts.undated > 0 ? plural(counts.undated, "1 ohne Termin", "ohne Termin") : null,
    counts.events > 0 ? plural(counts.events, "1 Termin", "Termine") : null,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) {
    return counts.filterName ? `Nichts offen für ${counts.filterName}` : "Nichts offen";
  }
  return parts.join(" · ");
}

export const RECENT_DONE_DAYS = 7;

/** The oldest completion the planner loads, as an ISO timestamp. */
export function recentDoneCutoff(now = new Date()): string {
  return new Date(now.getTime() - RECENT_DONE_DAYS * 86_400_000).toISOString();
}

/** Sort tasks by completion, most recently finished first. */
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

/** Sort tasks by due date (soonest first); undated tasks go last. */
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
 * Never `toISOString()` (UTC) — between local midnight and the UTC day
 * roll a task due today would group under "Als Nächstes" while its own
 * row reads "Heute".
 */
export function todayLocalDate(now = new Date()): string {
  return now.toLocaleDateString("sv-SE");
}

// ---------------------------------------------------------------------------
// Rescheduling
// ---------------------------------------------------------------------------

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

/** Whole days from `fromStr` to `toStr` (negative when earlier). */
function daysBetween(fromStr: string, toStr: string): number {
  return Math.round((parseIsoDate(toStr) - parseIsoDate(fromStr)) / DAY_MS);
}

/**
 * The one-tap answers to "wann?" offered by the schedule sheet. Every
 * preset says out loud which day it means — no guessing.
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

export const TASK_SCHEDULE_PRESETS: readonly TaskSchedulePreset[] = [
  "today",
  "tomorrow",
  "weekend",
  "next-week",
  "none",
] as const;

/** Day-of-week index (0 = Sunday) of an ISO date string. */
function weekdayOf(dateStr: string): number {
  return new Date(parseIsoDate(dateStr)).getUTCDay();
}

/**
 * The next occurrence of `weekday` strictly after `todayStr` — so
 * "Wochenende" tapped on a Saturday means the COMING Saturday, not a
 * no-op landing on today.
 */
function nextWeekday(todayStr: string, weekday: number): string {
  const delta = (weekday - weekdayOf(todayStr) + 7) % 7;
  return shiftDate(todayStr, delta === 0 ? 7 : delta);
}

/** The due date a schedule preset resolves to (null = "Kein Termin"). */
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
 * The short, human due label a task row shows: "Heute", "Morgen",
 * "Gestern", the weekday inside the coming week ("Do"), and a plain date
 * beyond that ("10. Aug.").
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
 * The day a schedule preset lands on, spelled out: "Sa, 22. Aug." —
 * "Wochenende" is only trustworthy if it says which day it means.
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
 * "seit 3 Tagen", "seit 2 Wochen". The lateness belongs on the row that
 * is late — one quiet apricot line, not a red section heading.
 */
export function formatOverdueLabel(
  due: string | null,
  todayStr: string,
): string | null {
  if (!due || due >= todayStr) return null;
  const days = daysBetween(due, todayStr);
  if (!Number.isFinite(days) || days <= 0) return null;
  if (days === 1) return "seit gestern";
  // Days stay precise for a fortnight — past that the count stops
  // meaning anything.
  if (days < 14) return `seit ${days} Tagen`;
  return `seit ${Math.floor(days / 7)} Wochen`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Bitte gib einen Titel ein.").max(200),
  description: z.string().trim().max(2000).optional().default(""),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte wähle ein Datum.")
    .or(z.literal(""))
    .optional()
    .default(""),
  assignedTo: z.string().optional().default(""),
});

export type TaskInput = z.infer<typeof taskInputSchema>;

/**
 * Validate a new or edited task. Past due dates are rejected like on the
 * web create sheet ("Bitte wähle heute oder einen späteren Tag.") —
 * except when `allowPastDueDate` is set: editing an overdue task without
 * touching its date must not fail on the date it already had.
 */
export function validateTaskInput(
  input: { title: string; description?: string; dueDate?: string; assignedTo?: string },
  todayStr = todayLocalDate(),
  allowPastDueDate = false,
): { success: true; data: TaskInput } | { success: false; error: string } {
  const parsed = taskInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Bitte gib einen Titel ein.",
    };
  }
  if (!allowPastDueDate && parsed.data.dueDate && parsed.data.dueDate < todayStr) {
    return {
      success: false,
      error: "Bitte wähle heute oder einen späteren Tag.",
    };
  }
  return { success: true, data: parsed.data };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const plannerTaskSelect =
  "id, family_id, document_id, title, description, due_date, status, confidence, confirmed, created_at, tags, assigned_to, completed_at";

/**
 * Open tasks plus what the family finished in the last week — the same
 * window the web planner loads (recentDoneCutoff), so both platforms
 * agree on what "recently" means. Paged with a unique id tiebreaker so
 * rows cannot cross page boundaries between requests.
 */
export async function fetchPlannerTasks(familyId: string): Promise<PlannerTask[]> {
  return fetchAllRows(async (from, to) => {
    const { data, error } = await getSupabase()
      .from("tasks")
      .select(plannerTaskSelect)
      .eq("family_id", familyId)
      .eq("confirmed", true)
      .or(`status.neq.done,completed_at.gte.${recentDoneCutoff()}`)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as PlannerTask[];
  });
}

/** The family's members (id, name, role, color) for the assign sheet. */
export async function fetchFamilyMembers(
  familyId: string,
): Promise<FamilyMemberOption[]> {
  const { data, error } = await getSupabase()
    .from("family_members")
    .select("id, name, role, avatar_color")
    .eq("family_id", familyId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FamilyMemberOption[];
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Create a task. Mirrors the web create sheet's insert: confirmed,
 * full confidence, no document link, empty tags.
 */
export async function createTask(
  familyId: string,
  input: { title: string; description?: string; dueDate?: string; assignedTo?: string },
): Promise<{ success: true; task: PlannerTask } | { success: false; error: string }> {
  const validation = validateTaskInput(input);
  if (!validation.success) {
    return { success: false, error: validation.error };
  }

  const { data, error } = await getSupabase()
    .from("tasks")
    .insert({
      family_id: familyId,
      document_id: null,
      title: validation.data.title,
      description: validation.data.description || null,
      due_date: validation.data.dueDate || null,
      status: "open",
      confidence: 1.0,
      confirmed: true,
      tags: [],
      assigned_to: validation.data.assignedTo || null,
    })
    .select(plannerTaskSelect)
    .single();

  if (error || !data) {
    return { success: false, error: FRIENDLY_ERROR };
  }
  return { success: true, task: data as PlannerTask };
}

/**
 * Patch a task (status, due date, assignee). Undo is the same call with
 * the previous values. Returns true on success so callers can show the
 * undo banner only after the mutation actually resolved.
 */
export async function patchTask(
  taskId: string,
  updates: TaskPatch,
): Promise<boolean> {
  try {
    const { error } = await getSupabase()
      .from("tasks")
      .update(updates)
      .eq("id", taskId);
    return !error;
  } catch {
    return false;
  }
}
