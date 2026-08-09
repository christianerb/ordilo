import { createClient, getMiddlewareFamily } from "@/lib/supabase/server";
import type { TaskCardData, AssigneeOption } from "@/components/ordilo/task-card";
import type { CalendarEvent } from "@/lib/calendar";
import { toCalendarDate } from "@/lib/calendar";
import type { Database } from "@/types/database";
import { AufgabenClient } from "./aufgaben-client";
import { CalendarClient, type CalendarSuggestion } from "./calendar-client";
import { PlannerView } from "./planner-view";

type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SUGGESTIONS = 5;

/**
 * Upcoming document-extracted dates that are not in the calendar yet:
 * confirmed `date` entities from today onwards, minus everything the family
 * already dismissed or turned into an event linked to the same document and
 * day. These surface as suggestion cards on the Planer tab.
 */
async function loadCalendarSuggestions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  familyId: string,
): Promise<CalendarSuggestion[]> {
  const today = toCalendarDate(new Date());
  const [entityResult, dismissalResult] = await Promise.all([
    supabase
      .from("extracted_entities")
      .select("id, entity_value, label, document_id")
      .eq("family_id", familyId)
      .eq("entity_type", "date")
      .eq("confirmed", true)
      .gte("entity_value", today)
      .order("entity_value", { ascending: true })
      .limit(50),
    supabase
      .from("calendar_suggestion_dismissals")
      .select("entity_id")
      .eq("family_id", familyId),
  ]);

  const dismissed = new Set(
    (dismissalResult.data ?? []).map((row) => row.entity_id),
  );
  const candidates = (entityResult.data ?? []).filter(
    (entity) =>
      ISO_DATE_PATTERN.test(entity.entity_value) &&
      !dismissed.has(entity.id) &&
      entity.document_id !== null,
  );
  if (candidates.length === 0) return [];

  const documentIds = [...new Set(candidates.map((c) => c.document_id!))];
  const [documentResult, existingEventResult] = await Promise.all([
    supabase.from("documents").select("id, title").in("id", documentIds),
    supabase
      .from("calendar_events")
      .select("document_id, starts_on")
      .eq("family_id", familyId)
      .in("document_id", documentIds),
  ]);

  const titleByDocument = new Map(
    (documentResult.data ?? []).map((doc) => [doc.id, doc.title]),
  );
  const alreadyPlanned = new Set(
    (existingEventResult.data ?? []).map(
      (event) => `${event.document_id}:${event.starts_on}`,
    ),
  );

  const suggestions: CalendarSuggestion[] = [];
  const seen = new Set<string>();
  for (const entity of candidates) {
    const key = `${entity.document_id}:${entity.entity_value}:${entity.label ?? ""}`;
    if (seen.has(key)) continue;
    if (alreadyPlanned.has(`${entity.document_id}:${entity.entity_value}`)) {
      continue;
    }
    seen.add(key);
    suggestions.push({
      entityId: entity.id,
      date: entity.entity_value,
      label: entity.label,
      documentId: entity.document_id!,
      documentTitle: titleByDocument.get(entity.document_id!) ?? null,
    });
    if (suggestions.length >= MAX_SUGGESTIONS) break;
  }
  return suggestions;
}

async function loadInitialData(): Promise<{
  tasks: TaskCardData[];
  members: AssigneeOption[];
  events: CalendarEvent[];
  suggestions: CalendarSuggestion[];
  familyId: string | null;
  error: string | null;
}> {
  const supabase = await createClient();
  // On full page loads the middleware already ran this query for the
  // onboarding gate and hands the result over via request headers — only
  // RSC navigations need the fallback query.
  const middlewareFamily = await getMiddlewareFamily();
  let family: { id: string } | null = middlewareFamily;
  if (!family) {
    const { data } = await supabase
      .from("families")
      .select("id")
      .limit(1)
      .maybeSingle();
    family = data;
  }

  if (!family) {
    return {
      tasks: [],
      members: [],
      events: [],
      suggestions: [],
      familyId: null,
      error: null,
    };
  }

  // Planner data only depends on the family id, not on other results —
  // fetch members, tasks, calendar events, and suggestions concurrently.
  const [memberResult, taskResult, eventResult, suggestions] =
    await Promise.all([
      supabase
        .from("family_members")
        .select("id, name, role, avatar_color")
        .eq("family_id", family.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("tasks")
        .select("*")
        .eq("family_id", family.id)
        .eq("confirmed", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("calendar_events")
        .select("id, title, note, starts_on, ends_on, all_day, starts_time, ends_time, recurrence, recurrence_until, recurrence_exceptions, location, responsible_member_id, document_id")
        .eq("family_id", family.id)
        .order("starts_on", { ascending: true }),
      loadCalendarSuggestions(supabase, family.id).catch(() => []),
    ]);

  const { data: memberRows } = memberResult;
  const { data: taskRows, error: tasksError } = taskResult;
  const { data: eventRows } = eventResult;

  const members: AssigneeOption[] = (memberRows as MemberRow[] | null) ?? [];
  const memberNameMap = new Map<string, string>();
  for (const m of members) {
    memberNameMap.set(m.id, m.name);
  }

  // Calendar failures degrade to an empty calendar instead of breaking
  // the whole page (e.g. while the events migration is not applied yet).
  // Processed before the tasksError branch below so a task loading error
  // does not silently discard successfully loaded events on ?tab=planer.
  const rawEvents = eventRows ?? [];
  const eventIds = rawEvents.map((event) => event.id);
  const { data: attendeeRows } = eventIds.length
    ? await supabase
      .from("calendar_event_attendees")
      .select("event_id, family_member_id")
      .in("event_id", eventIds)
    : { data: [] };
  const attendeesByEvent = new Map<string, { id: string; name: string }[]>();
  for (const attendee of attendeeRows ?? []) {
    const existing = attendeesByEvent.get(attendee.event_id) ?? [];
    existing.push({
      id: attendee.family_member_id,
      name: memberNameMap.get(attendee.family_member_id) ?? "Familienmitglied",
    });
    attendeesByEvent.set(attendee.event_id, existing);
  }
  const eventDocumentIds = [
    ...new Set(
      rawEvents
        .map((event) => event.document_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const eventDocumentTitles = new Map<string, string | null>();
  if (eventDocumentIds.length > 0) {
    const { data: eventDocumentRows } = await supabase
      .from("documents")
      .select("id, title")
      .in("id", eventDocumentIds);
    for (const doc of eventDocumentRows ?? []) {
      eventDocumentTitles.set(doc.id, doc.title);
    }
  }

  const events: CalendarEvent[] = rawEvents.map((event) => ({
    ...event,
    recurrence: event.recurrence as CalendarEvent["recurrence"],
    recurrence_exceptions: event.recurrence_exceptions ?? [],
    document_title: event.document_id
      ? eventDocumentTitles.get(event.document_id) ?? null
      : null,
    attendees: attendeesByEvent.get(event.id) ?? [],
  }));

  if (tasksError) {
    return {
      tasks: [],
      members,
      events,
      suggestions,
      familyId: family.id,
      error: "Aufgaben konnten nicht geladen werden. Bitte versuche es später nochmal.",
    };
  }

  if (!taskRows || taskRows.length === 0) {
    return {
      tasks: [],
      members,
      events,
      suggestions,
      familyId: family.id,
      error: null,
    };
  }

  const taskIds = taskRows.map((task) => task.id);
  const { data: linkRows } = await supabase
    .from("task_documents")
    .select("task_id, document_id")
    .in("task_id", taskIds);

  const allDocumentIds = [
    ...new Set([
      ...taskRows.map((task) => task.document_id),
      ...(linkRows ?? []).map((link) => link.document_id),
    ].filter((id): id is string => Boolean(id))),
  ];

  const titleMap = new Map<string, string | null>();
  if (allDocumentIds.length > 0) {
    const { data: documentRows } = await supabase
      .from("documents")
      .select("id, title")
      .in("id", allDocumentIds);

    for (const document of (documentRows ?? []) as Pick<DocumentRow, "id" | "title">[]) {
      titleMap.set(document.id, document.title);
    }
  }

  const linkedByTask = new Map<string, { id: string; title: string | null }[]>();
  for (const link of linkRows ?? []) {
    const existing = linkedByTask.get(link.task_id) ?? [];
    existing.push({
      id: link.document_id,
      title: titleMap.get(link.document_id) ?? null,
    });
    linkedByTask.set(link.task_id, existing);
  }

  const tasks = (taskRows as TaskRow[]).map((task) => ({
    ...task,
    document_title: task.document_id ? titleMap.get(task.document_id) ?? null : null,
    linked_documents: linkedByTask.get(task.id) ?? [],
    assigned_member_name: task.assigned_to ? memberNameMap.get(task.assigned_to) ?? null : null,
  }));

  return {
    tasks,
    members,
    events,
    suggestions,
    familyId: family.id,
    error: null,
  };
}

export default async function AufgabenPage() {
  const {
    tasks: initialTasks,
    members,
    events,
    suggestions,
    familyId,
    error,
  } = await loadInitialData();
  const taskKey = initialTasks
    .map((task) =>
      `${task.id}:${task.status}:${task.title}:${task.description ?? ""}:${task.due_date ?? ""}:${task.priority}:${(task.tags ?? []).join(",")}:${task.linked_documents?.length ?? 0}:${task.assigned_to ?? ""}`,
    )
    .join("|");

  return (
    <div className="app-page-stack">
      <PlannerView
        familyId={familyId}
        tasks={
          <AufgabenClient
            key={taskKey || `empty:${error ?? "ok"}`}
            initialTasks={initialTasks}
            members={members}
            familyId={familyId}
            initialError={error}
          />
        }
        calendar={
          <CalendarClient
            initialEvents={events}
            initialSuggestions={suggestions}
            familyId={familyId}
            members={members}
          />
        }
      />
    </div>
  );
}
