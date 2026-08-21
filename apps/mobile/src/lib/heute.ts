import type { SupabaseClient } from "@supabase/supabase-js";

import { recordProductEvent } from "./analytics";
import { getSupabase } from "./supabase";

/**
 * Data and pure presentation rules for Heute. This is a native port of the
 * home dashboard's RLS-scoped reads in src/app/(app)/home/page.tsx. Keeping
 * the decisions here makes the screen a thin, testable native view rather
 * than a collection of ad-hoc filters.
 */

export const HOME_EVENTS_HORIZON_DAYS = 7;
export const JOURNAL_DOCS_LIMIT = 6;
export const HOME_VISIBLE_DOCUMENTS = 3;
export const HOME_VISIBLE_TASKS = 3;
export const INBOUND_DISCOVERY_LIMIT = 3;
const MAX_EMAIL_SUGGESTIONS = 3;

const FRIENDLY_ERROR =
  "Das hat gerade nicht geklappt. Bitte versuch es nochmal.";

export type TaskStatus = "open" | "done" | "dismissed";
export type EventRecurrence =
  | "none"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "yearly";

export interface HeuteMember {
  id: string;
  name: string;
  role: string | null;
  avatarColor: string | null;
}

export interface HeuteDocument {
  id: string;
  title: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  status: string;
  createdAt: string;
  summary: string | null;
}

export interface HeuteTask {
  id: string;
  familyId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: TaskStatus;
  confidence: number;
  confirmed: boolean;
  createdAt: string;
  tags: string[];
  documentId: string | null;
  documentTitle: string | null;
}

export interface HeuteEvent {
  id: string;
  title: string;
  startsOn: string;
  endsOn: string;
  allDay: boolean;
  startsTime: string | null;
  endsTime: string | null;
  recurrence: EventRecurrence;
  recurrenceUntil: string | null;
  recurrenceExceptions: string[];
  location: string | null;
  responsibleMemberId: string | null;
  attendeeNames: string[];
}

export interface HeuteEventOccurrence {
  id: string;
  title: string;
  date: string;
  startsTime: string | null;
  allDay: boolean;
  location: string | null;
  attendeeNames: string[];
}

export interface HeuteInboundSuggestion {
  id: string;
  kind: "calendar_event" | "task";
  title: string;
  startsOn: string | null;
  startsTime: string | null;
  endsTime: string | null;
  location: string | null;
  note: string | null;
}

export interface HeuteInboundDiscovery {
  id: string;
  subject: string | null;
  fromAddress: string | null;
  receivedAt: string;
  retentionPending: boolean;
  suggestions: HeuteInboundSuggestion[];
}

export interface HeuteData {
  members: HeuteMember[];
  analyzedDocuments: HeuteDocument[];
  unconfirmedDocumentCount: number;
  journalDocumentCount: number;
  confirmedDocumentCount: number;
  tasks: HeuteTask[];
  recentDocuments: HeuteDocument[];
  events: HeuteEvent[];
  inboundDiscoveries: HeuteInboundDiscovery[];
}

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

interface TodayRow {
  id: string;
  title: string | null;
  original_filename: string | null;
  mime_type: string | null;
  status: string;
  created_at: string;
  summary: string | null;
}

function mapDocument(row: TodayRow): HeuteDocument {
  return {
    id: row.id,
    title: row.title,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    status: row.status,
    createdAt: row.created_at,
    summary: row.summary,
  };
}

/**
 * Load every direct, RLS-scoped read the web home page uses. The user has
 * already passed the family gate, but familyId remains explicit so a stale
 * provider value can never leak cross-family data into this screen.
 */
export async function loadHeuteData(familyId: string): Promise<HeuteData> {
  const supabase = getSupabase();
  const today = toLocalDateStr(new Date());
  const horizon = toLocalDateStr(
    new Date(Date.now() + HOME_EVENTS_HORIZON_DAYS * 86_400_000),
  );

  const [
    { data: memberRows, error: membersError },
    { data: analyzedRows, error: analyzedError },
    { count: unconfirmedDocumentCount, error: unconfirmedError },
    { count: journalDocumentCount, error: journalCountError },
    { count: confirmedDocumentCount, error: confirmedCountError },
    { data: taskRows, error: tasksError },
    { data: recentRows, error: recentError },
    { data: eventRows, error: eventsError },
    { data: suggestionRows, error: suggestionsError },
    { data: retentionRows, error: retentionError },
  ] = await Promise.all([
    supabase
      .from("family_members")
      .select("id, name, role, avatar_color")
      .eq("family_id", familyId)
      .order("created_at", { ascending: true }),
    supabase
      .from("documents")
      .select(
        "id, title, original_filename, mime_type, status, created_at, summary",
      )
      .eq("family_id", familyId)
      .eq("status", "analyzed")
      .order("created_at", { ascending: false })
      .limit(HOME_VISIBLE_DOCUMENTS),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("family_id", familyId)
      .eq("status", "analyzed"),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("family_id", familyId)
      .neq("status", "failed"),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("family_id", familyId)
      .eq("status", "confirmed"),
    supabase
      .from("tasks")
      .select(
        "id, family_id, title, description, due_date, status, confidence, confirmed, created_at, document_id, tags",
      )
      .eq("family_id", familyId)
      .eq("confirmed", true)
      .eq("status", "open")
      .order("created_at", { ascending: false }),
    supabase
      .from("documents")
      .select(
        "id, title, original_filename, mime_type, status, created_at, summary",
      )
      .eq("family_id", familyId)
      .neq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(JOURNAL_DOCS_LIMIT),
    supabase
      .from("calendar_events")
      .select(
        "id, title, starts_on, ends_on, all_day, starts_time, ends_time, recurrence, recurrence_until, recurrence_exceptions, location, responsible_member_id",
      )
      .eq("family_id", familyId)
      .lte("starts_on", horizon)
      .or(`ends_on.gte.${today},recurrence.neq.none`),
    supabase
      .from("inbound_suggestions")
      .select(
        "id, inbound_email_id, kind, title, starts_on, starts_time, ends_time, location, note",
      )
      .eq("family_id", familyId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(INBOUND_DISCOVERY_LIMIT * MAX_EMAIL_SUGGESTIONS),
    supabase
      .from("inbound_emails")
      .select("id")
      .eq("family_id", familyId)
      .eq("retention", "pending")
      .order("received_at", { ascending: false })
      .limit(INBOUND_DISCOVERY_LIMIT),
  ]);

  if (
    membersError ||
    analyzedError ||
    unconfirmedError ||
    journalCountError ||
    confirmedCountError ||
    tasksError ||
    recentError ||
    eventsError ||
    suggestionsError ||
    retentionError
  ) {
    throw new Error(FRIENDLY_ERROR);
  }

  const eventIds = (eventRows ?? []).map((event) => event.id);
  const { data: attendeeRows, error: attendeesError } = eventIds.length
    ? await supabase
        .from("calendar_event_attendees")
        .select("event_id, family_member_id")
        .in("event_id", eventIds)
    : { data: [], error: null };
  if (attendeesError) throw new Error(FRIENDLY_ERROR);

  const attendeeMemberIds = [
    ...new Set((attendeeRows ?? []).map((attendee) => attendee.family_member_id)),
  ];
  const { data: attendeeMemberRows, error: attendeeMembersError } =
    attendeeMemberIds.length
      ? await supabase
          .from("family_members")
          .select("id, name")
          .in("id", attendeeMemberIds)
      : { data: [], error: null };
  if (attendeeMembersError) throw new Error(FRIENDLY_ERROR);

  const attendeeNames = new Map(
    (attendeeMemberRows ?? []).map((member) => [member.id, member.name]),
  );
  const attendeeNamesByEvent = new Map<string, string[]>();
  for (const attendee of attendeeRows ?? []) {
    const names = attendeeNamesByEvent.get(attendee.event_id) ?? [];
    const name = attendeeNames.get(attendee.family_member_id);
    if (name) names.push(name);
    attendeeNamesByEvent.set(attendee.event_id, names);
  }

  const taskDocumentIds = [
    ...new Set(
      (taskRows ?? [])
        .map((task) => task.document_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  const { data: taskDocumentRows, error: taskDocumentsError } =
    taskDocumentIds.length
      ? await supabase
          .from("documents")
          .select("id, title")
          .in("id", taskDocumentIds)
      : { data: [], error: null };
  if (taskDocumentsError) throw new Error(FRIENDLY_ERROR);
  const taskDocumentTitles = new Map(
    (taskDocumentRows ?? []).map((document) => [document.id, document.title]),
  );

  const suggestionsByEmail = new Map<string, HeuteInboundSuggestion[]>();
  for (const suggestion of suggestionRows ?? []) {
    const current = suggestionsByEmail.get(suggestion.inbound_email_id) ?? [];
    current.push({
      id: suggestion.id,
      kind:
        suggestion.kind === "calendar_event" ? "calendar_event" : "task",
      title: suggestion.title,
      startsOn: suggestion.starts_on,
      startsTime: suggestion.starts_time,
      endsTime: suggestion.ends_time,
      location: suggestion.location,
      note: suggestion.note,
    });
    suggestionsByEmail.set(suggestion.inbound_email_id, current);
  }

  const unresolvedEmailIds = [
    ...suggestionsByEmail.keys(),
    ...(retentionRows ?? []).map((email) => email.id),
  ];
  const { data: emailRows, error: emailsError } = unresolvedEmailIds.length
    ? await supabase
        .from("inbound_emails")
        .select("id, subject, from_address, received_at, retention")
        .eq("family_id", familyId)
        .in("id", unresolvedEmailIds)
        .order("received_at", { ascending: false })
    : { data: [], error: null };
  if (emailsError) throw new Error(FRIENDLY_ERROR);

  return {
    members: (memberRows ?? []).map((member) => ({
      id: member.id,
      name: member.name,
      role: member.role,
      avatarColor: member.avatar_color,
    })),
    analyzedDocuments: (analyzedRows ?? []).map(mapDocument),
    unconfirmedDocumentCount: unconfirmedDocumentCount ?? 0,
    journalDocumentCount: journalDocumentCount ?? 0,
    confirmedDocumentCount: confirmedDocumentCount ?? 0,
    tasks: (taskRows ?? []).map((task) => ({
      id: task.id,
      familyId: task.family_id,
      title: task.title,
      description: task.description,
      dueDate: task.due_date,
      status: task.status as TaskStatus,
      confidence: task.confidence,
      confirmed: task.confirmed,
      createdAt: task.created_at,
      tags: task.tags ?? [],
      documentId: task.document_id,
      documentTitle: task.document_id
        ? (taskDocumentTitles.get(task.document_id) ?? null)
        : null,
    })),
    recentDocuments: (recentRows ?? []).map(mapDocument),
    events: (eventRows ?? []).map((event) => ({
      id: event.id,
      title: event.title,
      startsOn: event.starts_on,
      endsOn: event.ends_on,
      allDay: event.all_day,
      startsTime: event.starts_time,
      endsTime: event.ends_time,
      recurrence: event.recurrence as EventRecurrence,
      recurrenceUntil: event.recurrence_until,
      recurrenceExceptions: event.recurrence_exceptions ?? [],
      location: event.location,
      responsibleMemberId: event.responsible_member_id,
      attendeeNames: attendeeNamesByEvent.get(event.id) ?? [],
    })),
    inboundDiscoveries: (emailRows ?? [])
      .map((email) => ({
        id: email.id,
        subject: email.subject,
        fromAddress: email.from_address,
        receivedAt: email.received_at,
        retentionPending: email.retention === "pending",
        suggestions: suggestionsByEmail.get(email.id) ?? [],
      }))
      .filter(
        (discovery) =>
          discovery.suggestions.length > 0 || discovery.retentionPending,
      )
      .slice(0, INBOUND_DISCOVERY_LIMIT),
  };
}

export function toLocalDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getHomeGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Guten Morgen";
  if (hour >= 12 && hour < 18) return "Guten Tag";
  return "Guten Abend";
}

export function mergeJournalDocuments(
  analyzed: HeuteDocument[],
  recent: HeuteDocument[],
  limit = HOME_VISIBLE_DOCUMENTS,
): HeuteDocument[] {
  const seen = new Set<string>();
  const merged: HeuteDocument[] = [];
  for (const document of [...analyzed, ...recent]) {
    if (document.status === "failed" || seen.has(document.id)) continue;
    seen.add(document.id);
    merged.push(document);
    if (merged.length === limit) break;
  }
  return merged;
}

export function getTodayTasks(tasks: HeuteTask[], date = new Date()): HeuteTask[] {
  const today = toLocalDateStr(date);
  return tasks
    .filter(
      (task) =>
        task.status === "open" && task.confirmed && task.dueDate === today,
    )
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function getDatedOpenTasks(tasks: HeuteTask[]): HeuteTask[] {
  return tasks
    .filter(
      (task) =>
        task.status === "open" && task.confirmed && task.dueDate !== null,
    )
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
}

export function formatDueLabel(
  dueDate: string | null,
  now = new Date(),
): { text: string; overdue: boolean } | null {
  if (!dueDate) return null;
  const today = toLocalDateStr(now);
  const difference = Math.round(
    (new Date(`${dueDate}T12:00:00`).getTime() -
      new Date(`${today}T12:00:00`).getTime()) /
      86_400_000,
  );
  if (difference < 0) {
    const days = Math.abs(difference);
    if (days === 1) return { text: "seit gestern", overdue: true };
    if (days < 14) return { text: `seit ${days} Tagen`, overdue: true };
    return { text: `seit ${Math.floor(days / 7)} Wochen`, overdue: true };
  }
  if (difference === 0) return { text: "Heute", overdue: false };
  if (difference === 1) return { text: "Morgen", overdue: false };
  const parsed = new Date(`${dueDate}T12:00:00`);
  return {
    text: new Intl.DateTimeFormat("de-DE", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(parsed),
    overdue: false,
  };
}

export function eventOccursOn(event: HeuteEvent, date: string): boolean {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (
    !datePattern.test(event.startsOn) ||
    !datePattern.test(event.endsOn) ||
    !datePattern.test(date) ||
    event.startsOn > date ||
    (event.recurrenceUntil && date > event.recurrenceUntil) ||
    event.recurrenceExceptions.includes(date)
  ) {
    return false;
  }
  if (event.recurrence === "none") return date <= event.endsOn;

  const start = new Date(`${event.startsOn}T12:00:00`);
  const current = new Date(`${date}T12:00:00`);
  const durationDays = Math.round(
    (new Date(`${event.endsOn}T12:00:00`).getTime() - start.getTime()) /
      86_400_000,
  );
  if (current < start) return false;

  if (event.recurrence === "weekly" || event.recurrence === "biweekly") {
    const cycle = event.recurrence === "weekly" ? 7 : 14;
    const dayDelta = Math.round(
      (current.getTime() - start.getTime()) / 86_400_000,
    );
    return dayDelta % cycle >= 0 && dayDelta % cycle <= durationDays;
  }
  if (event.recurrence === "monthly") {
    const monthDelta =
      (current.getFullYear() - start.getFullYear()) * 12 +
      current.getMonth() -
      start.getMonth();
    const occurrenceStart = new Date(
      start.getFullYear(),
      start.getMonth() + monthDelta,
      start.getDate(),
      12,
    );
    const occurrenceEnd = new Date(
      occurrenceStart.getFullYear(),
      occurrenceStart.getMonth(),
      occurrenceStart.getDate() + durationDays,
      12,
    );
    return current >= occurrenceStart && current <= occurrenceEnd;
  }
  const occurrenceStart = new Date(
    current.getFullYear(),
    start.getMonth(),
    start.getDate(),
    12,
  );
  const occurrenceEnd = new Date(
    occurrenceStart.getFullYear(),
    occurrenceStart.getMonth(),
    occurrenceStart.getDate() + durationDays,
    12,
  );
  return current >= occurrenceStart && current <= occurrenceEnd;
}

export function getEventOccurrences(
  events: HeuteEvent[],
  date = new Date(),
  horizonDays = HOME_EVENTS_HORIZON_DAYS,
): HeuteEventOccurrence[] {
  const occurrences: HeuteEventOccurrence[] = [];
  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const current = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate() + offset,
    );
    const dateString = toLocalDateStr(current);
    for (const event of events) {
      if (!eventOccursOn(event, dateString)) continue;
      occurrences.push({
        id: event.id,
        title: event.title,
        date: dateString,
        startsTime: event.allDay ? null : event.startsTime,
        allDay: event.allDay,
        location: event.location,
        attendeeNames: event.attendeeNames,
      });
    }
  }
  return occurrences;
}

export function getTodayEvents(
  occurrences: HeuteEventOccurrence[],
  date = new Date(),
): HeuteEventOccurrence[] {
  const today = toLocalDateStr(date);
  return occurrences
    .filter((occurrence) => occurrence.date === today)
    .sort((a, b) => {
      if (a.startsTime === null && b.startsTime === null) return 0;
      if (a.startsTime === null) return -1;
      if (b.startsTime === null) return 1;
      return a.startsTime.localeCompare(b.startsTime);
    });
}

export function getUpcomingEntries(
  tasks: HeuteTask[],
  occurrences: HeuteEventOccurrence[],
  date = new Date(),
): { id: string; title: string; date: string }[] {
  const today = toLocalDateStr(date);
  const horizon = toLocalDateStr(
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7),
  );
  return [
    ...tasks
      .filter(
        (task) =>
          task.status === "open" &&
          task.confirmed &&
          task.dueDate !== null &&
          task.dueDate > today &&
          task.dueDate <= horizon,
      )
      .map((task) => ({
        id: `task-${task.id}`,
        title: task.title,
        date: task.dueDate as string,
      })),
    ...occurrences
      .filter((occurrence) => occurrence.date > today)
      .map((occurrence) => ({
        id: `event-${occurrence.id}-${occurrence.date}`,
        title: occurrence.title,
        date: occurrence.date,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));
}

export function getDiscoveryInsight(
  documents: HeuteDocument[],
): { documentId: string; message: string } | null {
  const keywords = [
    "zuschuss",
    "förderung",
    "beihilfe",
    "ermäßigung",
    "kostenübernahme",
    "erstattung",
  ];
  const document = documents.find(
    (candidate) =>
      candidate.summary &&
      keywords.some((keyword) => candidate.summary!.toLowerCase().includes(keyword)),
  );
  return document?.summary
    ? { documentId: document.id, message: document.summary }
    : null;
}

export function getInboundHeadline(discovery: HeuteInboundDiscovery): string {
  const kinds = new Set(discovery.suggestions.map((suggestion) => suggestion.kind));
  if (kinds.size === 0) return "Ich habe eine E-Mail gelesen.";
  if (kinds.size === 1 && kinds.has("calendar_event")) {
    return discovery.suggestions.length === 1
      ? "Ich habe einen Termin in einer E-Mail gefunden."
      : `Ich habe ${discovery.suggestions.length} Termine in euren E-Mails gefunden.`;
  }
  if (kinds.size === 1 && kinds.has("task")) {
    return discovery.suggestions.length === 1
      ? "Ich habe eine Aufgabe in einer E-Mail gefunden."
      : `Ich habe ${discovery.suggestions.length} Aufgaben in euren E-Mails gefunden.`;
  }
  return `Ich habe ${discovery.suggestions.length} Sachen in euren E-Mails gefunden.`;
}

export function formatInboundSender(address: string | null): string {
  if (!address) return "eurer E-Mail";
  const nameMatch = address.match(/^([^<]+)</);
  return nameMatch?.[1]?.trim() || address;
}

export async function setHeuteTaskStatus(
  taskId: string,
  status: "done" | "open" | "dismissed",
  familyId: string,
): Promise<ActionResult<null>> {
  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from("tasks")
      .update({ status })
      .eq("id", taskId);
    if (error) return { success: false, error: FRIENDLY_ERROR };

    if (status === "done") {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        void recordProductEvent(supabase as SupabaseClient, {
          userId: user.id,
          familyId,
          eventName: "task_completed",
        });
      }
    }
    return { success: true, data: null };
  } catch {
    return { success: false, error: FRIENDLY_ERROR };
  }
}

export async function acceptInboundSuggestion(
  suggestionId: string,
): Promise<ActionResult<null>> {
  try {
    const { error } = await getSupabase().rpc("accept_inbound_suggestion", {
      p_suggestion_id: suggestionId,
    });
    return error
      ? { success: false, error: FRIENDLY_ERROR }
      : { success: true, data: null };
  } catch {
    return { success: false, error: FRIENDLY_ERROR };
  }
}

export async function dismissInboundSuggestion(
  suggestionId: string,
): Promise<ActionResult<null>> {
  try {
    const { error } = await getSupabase().rpc("dismiss_inbound_suggestion", {
      p_suggestion_id: suggestionId,
    });
    return error
      ? { success: false, error: FRIENDLY_ERROR }
      : { success: true, data: null };
  } catch {
    return { success: false, error: FRIENDLY_ERROR };
  }
}

export async function decideInboundEmailRetention(
  inboundEmailId: string,
  keep: boolean,
): Promise<ActionResult<null>> {
  try {
    const { error } = await getSupabase().rpc(
      "decide_inbound_email_retention",
      {
        p_inbound_email_id: inboundEmailId,
        p_keep: keep,
      },
    );
    return error
      ? { success: false, error: FRIENDLY_ERROR }
      : { success: true, data: null };
  } catch {
    return { success: false, error: FRIENDLY_ERROR };
  }
}
