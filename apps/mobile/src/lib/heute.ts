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
  documentType: string | null;
  status: string;
  createdAt: string;
  summary: string | null;
  /** People Ordilo read in the document — linked members first. */
  people: HeutePerson[];
}

export interface HeutePerson {
  id: string | null;
  name: string;
  color: string | null;
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
  assignedTo: string | null;
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
  attendeeIds: string[];
}

export interface HeuteEventOccurrence {
  id: string;
  title: string;
  date: string;
  startsTime: string | null;
  allDay: boolean;
  location: string | null;
  attendeeNames: string[];
  attendeeIds: string[];
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
  document_type: string | null;
  status: string;
  created_at: string;
  summary: string | null;
}

function mapDocument(
  row: TodayRow,
  people: Map<string, HeutePerson[]>,
): HeuteDocument {
  return {
    id: row.id,
    title: row.title,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    documentType: row.document_type,
    status: row.status,
    createdAt: row.created_at,
    summary: row.summary,
    people: people.get(row.id) ?? [],
  };
}

const DOCUMENT_SELECT =
  "id, title, original_filename, mime_type, document_type, status, created_at, summary";

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
      .select(DOCUMENT_SELECT)
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
        "id, family_id, title, description, due_date, status, confidence, confirmed, created_at, document_id, tags, assigned_to",
      )
      .eq("family_id", familyId)
      .eq("confirmed", true)
      .eq("status", "open")
      .order("created_at", { ascending: false }),
    supabase
      .from("documents")
      .select(DOCUMENT_SELECT)
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
  const attendeeIdsByEvent = new Map<string, string[]>();
  for (const attendee of attendeeRows ?? []) {
    const names = attendeeNamesByEvent.get(attendee.event_id) ?? [];
    const name = attendeeNames.get(attendee.family_member_id);
    if (name) names.push(name);
    attendeeNamesByEvent.set(attendee.event_id, names);
    const ids = attendeeIdsByEvent.get(attendee.event_id) ?? [];
    ids.push(attendee.family_member_id);
    attendeeIdsByEvent.set(attendee.event_id, ids);
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

  const members: HeuteMember[] = (memberRows ?? []).map((member) => ({
    id: member.id,
    name: member.name,
    role: member.role,
    avatarColor: member.avatar_color,
  }));

  const documentIds = [
    ...new Set(
      [...(analyzedRows ?? []), ...(recentRows ?? [])].map((row) => row.id),
    ),
  ];
  const { data: personRows, error: personError } = documentIds.length
    ? await supabase
        .from("extracted_entities")
        .select("document_id, entity_value, linked_object_id")
        .eq("entity_type", "person")
        .in("document_id", documentIds)
    : { data: [], error: null };
  if (personError) throw new Error(FRIENDLY_ERROR);
  const peopleByDocument = groupDocumentPeople(personRows ?? [], members);

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
    members,
    analyzedDocuments: (analyzedRows ?? []).map((row) =>
      mapDocument(row, peopleByDocument),
    ),
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
      assignedTo: task.assigned_to ?? null,
    })),
    recentDocuments: (recentRows ?? []).map((row) =>
      mapDocument(row, peopleByDocument),
    ),
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
      attendeeIds: attendeeIdsByEvent.get(event.id) ?? [],
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

/**
 * Tasks without a deadline never compete with a dated priority, but they
 * still belong in "Als Nächstes". This keeps a just-accepted inbound task
 * labeled "Ohne Frist" visible after the discovery card disappears.
 */
export function getOpenTasksWithoutDueDate(tasks: HeuteTask[]): HeuteTask[] {
  return tasks
    .filter(
      (task) =>
        task.status === "open" &&
        task.confirmed &&
        task.dueDate === null,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * The hero promises an immediate next step only for overdue, today, or
 * tomorrow tasks. Farther-out work belongs in "Als Nächstes", not under
 * "Jetzt dran" — identical to the web Home priority chain.
 */
export function getHomePriorityTask(
  tasks: HeuteTask[],
  date = new Date(),
): HeuteTask | null {
  const tomorrow = toLocalDateStr(
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
  );
  return (
    getDatedOpenTasks(tasks).find(
      (task) => task.dueDate !== null && task.dueDate <= tomorrow,
    ) ?? null
  );
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
        attendeeIds: event.attendeeIds,
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

/**
 * The one line under an inbound proposal that answers "wann?" before a
 * family accepts it. It uses date components at noon so a timezone can
 * never shift the weekday.
 */
export function formatInboundWhen(suggestion: HeuteInboundSuggestion): string {
  if (!suggestion.startsOn) {
    return suggestion.kind === "task" ? "Ohne Frist" : "Ohne Datum";
  }

  const [year, month, day] = suggestion.startsOn.split("-").map(Number);
  const date =
    year && month && day
      ? new Intl.DateTimeFormat("de-DE", {
          weekday: "long",
          day: "numeric",
          month: "long",
        }).format(new Date(year, month - 1, day, 12))
      : suggestion.startsOn;
  const start = toDisplayTime(suggestion.startsTime);
  const end = toDisplayTime(suggestion.endsTime);
  if (!start) return date;
  return end && end !== start
    ? `${date}, ${start}–${end} Uhr`
    : `${date}, ${start} Uhr`;
}

function toDisplayTime(value: string | null): string | null {
  const match = value ? /^(\d{2}):(\d{2})/.exec(value) : null;
  return match ? `${match[1]}:${match[2]}` : null;
}

/**
 * People per document from its person entities: a linked entity takes the
 * member's name and colour; an unlinked name stays as text. Duplicates by
 * member or by name collapse.
 */
export function groupDocumentPeople(
  rows: { document_id: string; entity_value: string; linked_object_id: string | null }[],
  members: HeuteMember[],
): Map<string, HeutePerson[]> {
  const byId = new Map(members.map((member) => [member.id, member]));
  const result = new Map<string, HeutePerson[]>();
  const seen = new Map<string, Set<string>>();
  for (const row of rows) {
    const member = row.linked_object_id ? byId.get(row.linked_object_id) : undefined;
    const name = (member?.name ?? row.entity_value).trim();
    if (!name) continue;
    const key = member ? `id:${member.id}` : `name:${name.toLocaleLowerCase("de")}`;
    const keys = seen.get(row.document_id) ?? new Set<string>();
    if (keys.has(key)) continue;
    keys.add(key);
    seen.set(row.document_id, keys);
    const people = result.get(row.document_id) ?? [];
    people.push(
      member
        ? { id: member.id, name: member.name, color: member.avatarColor }
        : { id: null, name, color: null },
    );
    result.set(row.document_id, people);
  }
  return result;
}

export function findMember(
  members: HeuteMember[],
  memberId: string | null,
): HeutePerson | null {
  if (!memberId) return null;
  const member = members.find((candidate) => candidate.id === memberId);
  return member
    ? { id: member.id, name: member.name, color: member.avatarColor }
    : null;
}

/**
 * The one thing Start says first. In order: something overdue, something
 * due today, documents waiting for a look, something due tomorrow —
 * otherwise the honest "alles gut". Tasks win over documents because a
 * missed deadline costs more than an unread letter.
 */
export type HeuteBriefing =
  | { kind: "task"; task: HeuteTask; due: { text: string; overdue: boolean } }
  | { kind: "review"; count: number; document: HeuteDocument }
  | { kind: "calm"; upcomingCount: number };

export function getHeuteBriefing(
  tasks: HeuteTask[],
  reviewDocuments: HeuteDocument[],
  upcomingCount: number,
  date = new Date(),
): HeuteBriefing {
  const today = toLocalDateStr(date);
  const dated = getDatedOpenTasks(tasks);
  const urgent = dated.find((task) => task.dueDate !== null && task.dueDate <= today);
  if (urgent) {
    return { kind: "task", task: urgent, due: formatDueLabel(urgent.dueDate, date)! };
  }
  const review = reviewDocuments.filter((document) => document.status === "analyzed");
  if (review.length > 0) {
    return { kind: "review", count: review.length, document: review[0]! };
  }
  const tomorrow = getHomePriorityTask(tasks, date);
  if (tomorrow) {
    return {
      kind: "task",
      task: tomorrow,
      due: formatDueLabel(tomorrow.dueDate, date)!,
    };
  }
  return { kind: "calm", upcomingCount };
}

export interface HeuteAgendaEntry {
  id: string;
  kind: "task" | "event";
  title: string;
  date: string;
  /** "08:15" for timed events, null for tasks and all-day events. */
  time: string | null;
  location: string | null;
  task?: HeuteTask;
  occurrence?: HeuteEventOccurrence;
}

export interface HeuteAgendaDay {
  date: string;
  /** "Morgen", "Do., 4. Sep." */
  label: string;
  entries: HeuteAgendaEntry[];
}

/**
 * "Demnächst": the next days after today with anything on them, events by
 * time first, tasks after. Capped so Start stays a briefing — the Plan tab
 * holds the rest.
 */
export function getUpcomingAgenda(
  tasks: HeuteTask[],
  occurrences: HeuteEventOccurrence[],
  date = new Date(),
  maxEntries = 6,
): { days: HeuteAgendaDay[]; hiddenCount: number } {
  const today = toLocalDateStr(date);
  const tomorrow = toLocalDateStr(
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
  );
  const horizon = toLocalDateStr(
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + HOME_EVENTS_HORIZON_DAYS),
  );
  const entries: HeuteAgendaEntry[] = [
    ...occurrences
      .filter((occurrence) => occurrence.date > today && occurrence.date <= horizon)
      .map((occurrence) => ({
        id: `event-${occurrence.id}-${occurrence.date}`,
        kind: "event" as const,
        title: occurrence.title,
        date: occurrence.date,
        time: occurrence.allDay ? null : toDisplayTime(occurrence.startsTime),
        location: occurrence.location,
        occurrence,
      })),
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
        kind: "task" as const,
        title: task.title,
        date: task.dueDate as string,
        time: null,
        location: null,
        task,
      })),
  ].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.kind !== b.kind) return a.kind === "event" ? -1 : 1;
    return (a.time ?? "99").localeCompare(b.time ?? "99");
  });

  const shown = entries.slice(0, maxEntries);
  const days: HeuteAgendaDay[] = [];
  for (const entry of shown) {
    const day = days[days.length - 1];
    if (day && day.date === entry.date) {
      day.entries.push(entry);
      continue;
    }
    days.push({
      date: entry.date,
      label:
        entry.date === tomorrow
          ? "Morgen"
          : new Intl.DateTimeFormat("de-DE", {
              weekday: "short",
              day: "numeric",
              month: "short",
            }).format(new Date(`${entry.date}T12:00:00`)),
      entries: [entry],
    });
  }
  return { days, hiddenCount: entries.length - shown.length };
}

/** Small, honest line under a greeting: what the day holds in numbers. */
export function formatDaySummary(input: {
  todayEvents: number;
  todayTasks: number;
  reviewDocuments: number;
}): string | null {
  const parts: string[] = [];
  if (input.todayEvents > 0) {
    parts.push(input.todayEvents === 1 ? "1 Termin" : `${input.todayEvents} Termine`);
  }
  if (input.todayTasks > 0) {
    parts.push(input.todayTasks === 1 ? "1 Aufgabe" : `${input.todayTasks} Aufgaben`);
  }
  if (input.reviewDocuments > 0) {
    parts.push(
      input.reviewDocuments === 1
        ? "1 neues Dokument"
        : `${input.reviewDocuments} neue Dokumente`,
    );
  }
  if (parts.length === 0) return null;
  if (parts.length === 1) return `Heute: ${parts[0]}`;
  return `Heute: ${parts.slice(0, -1).join(", ")} und ${parts[parts.length - 1]}`;
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
      void Promise.resolve()
        .then(() => supabase.auth.getUser())
        .then(({ data: { user } }) =>
          user
            ? recordProductEvent(supabase as SupabaseClient, {
                userId: user.id,
                familyId,
                eventName: "task_completed",
              })
            : undefined,
        )
        .catch(() => undefined);
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
    const supabase = getSupabase();
    // Read before the accepting RPC changes its status. The web action
    // records the same event after its transaction succeeds.
    const { data: suggestion } = await supabase
      .from("inbound_suggestions")
      .select("kind, family_id")
      .eq("id", suggestionId)
      .maybeSingle();
    const { error } = await supabase.rpc("accept_inbound_suggestion", {
      p_suggestion_id: suggestionId,
    });
    if (error) return { success: false, error: FRIENDLY_ERROR };

    void Promise.resolve()
      .then(() => supabase.auth.getUser())
      .then(({ data: { user } }) =>
        user && suggestion
          ? recordProductEvent(supabase as SupabaseClient, {
              userId: user.id,
              familyId: suggestion.family_id,
              eventName:
                suggestion.kind === "calendar_event"
                  ? "calendar_event_created"
                  : "task_created",
              properties: { source: "inbound_email" },
            })
          : undefined,
      )
      .catch(() => undefined);
    return { success: true, data: null };
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
