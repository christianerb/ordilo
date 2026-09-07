import {
  eventOccurrenceStart,
  eventOccursOn,
  eventsForDay,
  formatEventPeople,
  formatEventWhen,
  toCalendarDate,
  upcomingPlannerEvents,
  type PlannerEvent,
} from "./calendar";
import {
  formatOverdueLabel,
  formatTaskDueLabel,
  getTaskSection,
  type FamilyMemberOption,
  type PlannerTask,
  type TaskSectionId,
} from "./tasks";

/**
 * One thing in the family's plan.
 *
 * Aufgaben und Termine sind für eine Familie dasselbe Anliegen in zwei
 * Formen: etwas, das jemand tun muss, und etwas, bei dem jemand sein
 * muss. Deshalb tragen beide hier dieselbe Hülle — die Liste gruppiert
 * sie nach Dringlichkeit, der Kalender nach Datum, und beide Ansichten
 * zeigen dieselben Einträge. So gibt es keinen "Termine"-Block, der in
 * der einen Ansicht auftaucht und in der anderen fehlt.
 */
export type PlanEntry =
  | { kind: "task"; id: string; date: string | null; task: PlannerTask }
  | {
      kind: "event";
      id: string;
      /** The day this row sits on — what it is grouped by and, for a
       *  series, the day "nur diesen Tag streichen" removes. */
      date: string;
      /** First day of the occurrence covering `date`, so a multi-day
       *  appointment never claims to start on the day you opened it. */
      occurrenceStart: string;
      /**
       * The stored row, never an occurrence-shifted copy: editing must
       * write back the series as it really is, not move its start to
       * whichever occurrence happened to be on screen.
       */
      event: PlannerEvent;
    };

/**
 * The one way to build an event entry, so `occurrenceStart` is never
 * guessed at a call site and `event` is always the stored row.
 */
export function planEntryForEvent(
  event: PlannerEvent,
  date: string,
): Extract<PlanEntry, { kind: "event" }> {
  return {
    kind: "event",
    id: event.id,
    date,
    occurrenceStart: eventOccurrenceStart(event, date) ?? event.starts_on,
    event,
  };
}

/** Stable key for a list row — an event occurrence repeats its id per day. */
export function planEntryKey(entry: PlanEntry): string {
  return entry.kind === "task" ? `task-${entry.id}` : `event-${entry.id}-${entry.date}`;
}

/**
 * Which section an entry belongs to. Tasks keep the web's contract
 * (overdue and today share "Jetzt dran"); an appointment is either
 * running today or still ahead — it is never undated and never "done",
 * because nobody ticks off a Tuesday.
 */
export function getPlanEntrySection(
  entry: PlanEntry,
  todayStr: string,
): TaskSectionId {
  if (entry.kind === "task") return getTaskSection(entry.task, todayStr);
  return entry.date <= todayStr ? "now" : "next";
}

/**
 * Sort inside one section: by day, and on the same day the time-bound
 * thing first — an appointment pins the day, a task moves around it.
 */
function comparePlanEntries(a: PlanEntry, b: PlanEntry): number {
  const byDate = (a.date ?? "9999-12-31").localeCompare(b.date ?? "9999-12-31");
  if (byDate !== 0) return byDate;
  if (a.kind !== b.kind) return a.kind === "event" ? -1 : 1;
  if (a.kind === "event" && b.kind === "event") {
    if (a.event.all_day !== b.event.all_day) return a.event.all_day ? -1 : 1;
    return (a.event.starts_time ?? "").localeCompare(b.event.starts_time ?? "");
  }
  return 0;
}

/** Most recently finished first — only tasks reach the Erledigt section. */
function compareDoneEntries(a: PlanEntry, b: PlanEntry): number {
  const at = a.kind === "task" ? a.task.completed_at : null;
  const bt = b.kind === "task" ? b.task.completed_at : null;
  if (!at && !bt) return 0;
  if (!at) return 1;
  if (!bt) return -1;
  return bt.localeCompare(at);
}

export type PlanSections = Record<TaskSectionId, PlanEntry[]>;

/**
 * The grouped plan list: every open task and every appointment that can
 * still happen, in one place. `events` may already be pre-filtered by
 * person; recurring events contribute their next occurrence only, so the
 * list answers "what is coming" instead of listing a series forever.
 */
export function groupPlanEntries(
  tasks: PlannerTask[],
  events: PlannerEvent[],
  todayStr: string,
): PlanSections {
  const sections: PlanSections = { now: [], next: [], undated: [], done: [] };

  for (const task of tasks) {
    if (task.status === "dismissed") continue;
    const entry: PlanEntry = {
      kind: "task",
      id: task.id,
      date: task.due_date,
      task,
    };
    sections[getPlanEntrySection(entry, todayStr)].push(entry);
  }

  // upcomingPlannerEvents resolves each series to its next occurrence and
  // returns a shifted copy. Only its date is wanted here — the entry keeps
  // the stored row so an edit or a delete addresses the real series.
  const storedById = new Map(events.map((event) => [event.id, event]));
  for (const occurrence of upcomingPlannerEvents(events, todayStr)) {
    const stored = storedById.get(occurrence.id);
    if (!stored) continue;
    const entry = planEntryForEvent(stored, occurrence.starts_on);
    sections[getPlanEntrySection(entry, todayStr)].push(entry);
  }

  sections.now.sort(comparePlanEntries);
  sections.next.sort(comparePlanEntries);
  sections.undated.sort(comparePlanEntries);
  sections.done.sort(compareDoneEntries);
  return sections;
}

/**
 * One day in the calendar: its appointments plus the tasks due that day.
 * The same symmetry as the list — a day that carries work says so.
 */
export function planEntriesForDay(
  tasks: PlannerTask[],
  events: PlannerEvent[],
  date: Date,
): PlanEntry[] {
  const iso = toCalendarDate(date);
  const entries: PlanEntry[] = eventsForDay(events, date).map((event) =>
    planEntryForEvent(event, iso),
  );
  for (const task of tasks) {
    if (task.status === "dismissed" || task.due_date !== iso) continue;
    entries.push({ kind: "task", id: task.id, date: iso, task });
  }
  return entries.sort(comparePlanEntries);
}

/** How much a calendar day carries, for its marker and its screen-reader label. */
export interface PlanDayMark {
  events: number;
  tasks: number;
}

export function planDayMark(
  tasks: PlannerTask[],
  events: PlannerEvent[],
  date: Date,
): PlanDayMark {
  const iso = toCalendarDate(date);
  return {
    events: events.filter((event) => eventOccursOn(event, iso)).length,
    tasks: tasks.filter(
      (task) => task.status !== "dismissed" && task.due_date === iso,
    ).length,
  };
}

/** "2 Termine, 1 Aufgabe" — never colour alone to say what a day holds. */
export function formatPlanDayMark(mark: PlanDayMark): string {
  const parts = [
    mark.events > 0
      ? `${mark.events} ${mark.events === 1 ? "Termin" : "Termine"}`
      : null,
    mark.tasks > 0
      ? `${mark.tasks} ${mark.tasks === 1 ? "Aufgabe" : "Aufgaben"}`
      : null,
  ].filter((part): part is string => part !== null);
  return parts.join(", ");
}

/** The one-line "when" a row and the detail sheet both show. */
export function formatPlanEntryWhen(
  entry: PlanEntry,
  todayStr: string,
): string | null {
  if (entry.kind === "event") {
    const day = formatTaskDueLabel(entry.date, todayStr);
    const when = formatEventWhen(entry.event);
    return day ? `${day} · ${when}` : when;
  }
  const overdue =
    entry.task.status === "done"
      ? null
      : formatOverdueLabel(entry.task.due_date, todayStr);
  return overdue ?? formatTaskDueLabel(entry.task.due_date, todayStr);
}

/** Whether the row should read as late — apricot, never a red wall. */
export function isPlanEntryOverdue(
  entry: PlanEntry,
  todayStr: string,
): boolean {
  if (entry.kind !== "task" || entry.task.status === "done") return false;
  return formatOverdueLabel(entry.task.due_date, todayStr) !== null;
}

/** The plain-language people line — "Für Karina", "Christian kümmert sich". */
export function formatPlanEntryPeople(
  entry: PlanEntry,
  members: FamilyMemberOption[],
): string | null {
  if (entry.kind === "event") return formatEventPeople(entry.event, members);
  const assignee = members.find(
    (member) => member.id === entry.task.assigned_to,
  );
  return assignee ? `${assignee.name} kümmert sich` : null;
}

/** Which family faces belong on the row. */
export function planEntryMemberIds(entry: PlanEntry): string[] {
  if (entry.kind === "task") {
    return entry.task.assigned_to ? [entry.task.assigned_to] : [];
  }
  const ids = new Set(entry.event.attendee_ids);
  if (entry.event.responsible_member_id) {
    ids.add(entry.event.responsible_member_id);
  }
  return [...ids];
}

/** Counts for the "Plan" header line, tasks and appointments together. */
export function planEntryCounts(sections: PlanSections): {
  now: number;
  next: number;
  undated: number;
  events: number;
} {
  const events = (["now", "next", "undated"] as const).reduce(
    (total, id) =>
      total + sections[id].filter((entry) => entry.kind === "event").length,
    0,
  );
  const openTasks = (id: TaskSectionId) =>
    sections[id].filter((entry) => entry.kind === "task").length;
  return {
    now: openTasks("now"),
    next: openTasks("next"),
    undated: openTasks("undated"),
    events,
  };
}
