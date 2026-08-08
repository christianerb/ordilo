import { createClient, getMiddlewareFamily } from "@/lib/supabase/server";
import type { TaskCardData, AssigneeOption } from "@/components/ordilo/task-card";
import type { CalendarEvent } from "@/lib/calendar";
import type { Database } from "@/types/database";
import { AufgabenClient } from "./aufgaben-client";
import { CalendarClient } from "./calendar-client";
import { PlannerView } from "./planner-view";

type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];

async function loadInitialData(): Promise<{
  tasks: TaskCardData[];
  members: AssigneeOption[];
  events: CalendarEvent[];
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
    return { tasks: [], members: [], events: [], familyId: null, error: null };
  }

  // Planner data only depends on the family id, not on other results —
  // fetch members, tasks, and calendar events concurrently.
  const [memberResult, taskResult, eventResult] = await Promise.all([
    supabase
      .from("family_members")
      .select("id, name, role")
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
      .select("id, title, note, starts_on, ends_on, all_day, starts_time, ends_time, recurrence, recurrence_until, recurrence_exceptions")
      .eq("family_id", family.id)
      .order("starts_on", { ascending: true }),
  ]);

  const { data: memberRows } = memberResult;
  const { data: taskRows, error: tasksError } = taskResult;
  const { data: eventRows } = eventResult;

  const members: AssigneeOption[] = (memberRows as MemberRow[] | null) ?? [];
  const memberNameMap = new Map<string, string>();
  for (const m of members) {
    memberNameMap.set(m.id, m.name);
  }

  if (tasksError) {
    return {
      tasks: [],
      members,
      events: [],
      familyId: family.id,
      error: "Aufgaben konnten nicht geladen werden. Bitte versuche es später nochmal.",
    };
  }

  // Calendar failures degrade to an empty calendar instead of breaking
  // the whole page (e.g. while the events migration is not applied yet).
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
  const events: CalendarEvent[] = rawEvents.map((event) => ({
    ...event,
    recurrence: event.recurrence as CalendarEvent["recurrence"],
    recurrence_exceptions: event.recurrence_exceptions ?? [],
    attendees: attendeesByEvent.get(event.id) ?? [],
  }));

  if (!taskRows || taskRows.length === 0) {
    return { tasks: [], members, events, familyId: family.id, error: null };
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

  return { tasks, members, events, familyId: family.id, error: null };
}

export default async function AufgabenPage() {
  const {
    tasks: initialTasks,
    members,
    events,
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
            familyId={familyId}
            members={members}
          />
        }
      />
    </div>
  );
}
