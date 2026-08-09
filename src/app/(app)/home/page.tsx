import { redirect } from "next/navigation";
import { createClient, getMiddlewareFamily } from "@/lib/supabase/server";
import {
  HomeClient,
  type HomeCalendarEvent,
  type HomeMember,
} from "./home-client";
import { type HomeTask, type HomeDocument } from "@/lib/home-utils";
import { computeInsights } from "@/lib/ai/insights";
import { eventOccursOn, toCalendarDate, type CalendarEvent } from "@/lib/calendar";

/**
 * Today's calendar entries for the home cockpit: expands recurring series
 * for today, resolves an accent color (responsible member first, else the
 * first attendee), and sorts all-day entries before timed ones.
 */
async function loadTodayEvents(
  supabase: Awaited<ReturnType<typeof createClient>>,
  familyId: string,
): Promise<HomeCalendarEvent[]> {
  const today = toCalendarDate(new Date());
  const { data: rows } = await supabase
    .from("calendar_events")
    .select(
      "id, title, starts_on, ends_on, all_day, starts_time, ends_time, recurrence, recurrence_until, recurrence_exceptions, location, responsible_member_id",
    )
    .eq("family_id", familyId)
    .lte("starts_on", today)
    .or(`ends_on.gte.${today},recurrence.neq.none`)
    .limit(200);

  const occurring = (rows ?? []).filter((row) =>
    eventOccursOn(
      {
        ...row,
        recurrence: row.recurrence as CalendarEvent["recurrence"],
        recurrence_exceptions: row.recurrence_exceptions ?? [],
      },
      today,
    ),
  );
  if (occurring.length === 0) return [];

  const eventIds = occurring.map((row) => row.id);
  const [{ data: attendeeRows }, { data: memberRows }] = await Promise.all([
    supabase
      .from("calendar_event_attendees")
      .select("event_id, family_member_id")
      .in("event_id", eventIds),
    supabase
      .from("family_members")
      .select("id, avatar_color")
      .eq("family_id", familyId),
  ]);
  const colorByMember = new Map(
    (memberRows ?? []).map((m) => [m.id, m.avatar_color]),
  );
  const firstAttendee = new Map<string, string>();
  for (const attendee of attendeeRows ?? []) {
    if (!firstAttendee.has(attendee.event_id)) {
      firstAttendee.set(attendee.event_id, attendee.family_member_id);
    }
  }

  return occurring
    .map((row) => {
      const colorMemberId =
        row.responsible_member_id ?? firstAttendee.get(row.id) ?? null;
      return {
        id: row.id,
        title: row.title,
        starts_time: row.all_day ? null : row.starts_time,
        ends_time: row.all_day ? null : row.ends_time,
        location: row.location,
        color: colorMemberId
          ? colorByMember.get(colorMemberId) ?? null
          : null,
      };
    })
    .sort((a, b) => {
      if (a.starts_time === null && b.starts_time === null) return 0;
      if (a.starts_time === null) return -1;
      if (b.starts_time === null) return 1;
      return a.starts_time.localeCompare(b.starts_time);
    });
}

/**
 * Compute a warm German time-of-day greeting (server-side to avoid
 * hydration mismatch).
 * - 5–11: "Guten Morgen"
 * - 12–17: "Guten Tag"
 * - 18–4: "Guten Abend"
 */
function getGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Guten Morgen";
  if (hour >= 12 && hour < 18) return "Guten Tag";
  return "Guten Abend";
}

/**
 * Home dashboard (server component).
 *
 * Fetches all data needed by the Home dashboard (RLS-scoped via the server
 * Supabase client) and renders the interactive client component:
 *
 * - Family + members (for greeting and family display)
 * - Documents with status='analyzed' (for the review queue)
 * - Confirmed open tasks with due dates (for the three-day cockpit)
 * - A document count to distinguish a new family from a quiet one
 *
 * If the user has no family, they are redirected to onboarding.
 *
 * Cross-area state consistency: because this is a server component, data is
 * fresh on every navigation (no stale cache). After a document confirm on
 * /dokumente, navigating to /home reflects the new state immediately.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  // /home?scan=1 — the onboarding springboard: open the scan wizard
  // immediately so "Erstes Dokument scannen" lands IN the camera.
  const autoOpenScan = params.scan === "1";

  const supabase = await createClient();

  // 1. Resolve the user's family. The middleware provides it on full page
  // loads; RSC navigations use the RLS-scoped fallback query.
  const middlewareFamily = await getMiddlewareFamily();
  let family = middlewareFamily;
  if (!family) {
    const { data } = await supabase
      .from("families")
      .select("id, name")
      .limit(1)
      .maybeSingle();
    family = data;
  }

  if (!family) {
    redirect("/onboarding");
  }

  // These requests only depend on family.id, so they run concurrently
  // instead of as a sequential waterfall.
  const [
    { data: memberRows },
    { data: analyzedRows },
    { count: unconfirmedDocCount },
    { data: taskRows },
    { count: documentCount },
    insights,
    todayEvents,
  ] = await Promise.all([
    // 2. Fetch family members (for greeting area).
    supabase
      .from("family_members")
      .select("id, name, role, avatar_color")
      .eq("family_id", family.id)
      .order("created_at", { ascending: true }),
    // 3. Fetch the compact review queue. The exact count comes from the
    //    head query below, so the briefing sentence never underreports.
    supabase
      .from("documents")
      .select("id, title, original_filename, mime_type, status, created_at")
      .eq("family_id", family.id)
      .eq("status", "analyzed")
      .order("created_at", { ascending: false })
      .limit(3),
    // 3b. Exact count of documents awaiting confirmation (for the
    //     briefing: "3 Dokumente warten auf dein OK").
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("family_id", family.id)
      .eq("status", "analyzed"),
    // 4. Fetch confirmed open tasks. The client chooses the immediate
    //    three-day horizon and keeps the rest on /aufgaben.
    supabase
      .from("tasks")
      .select(
        "id, family_id, title, description, due_date, priority, status, confidence, confirmed, created_at, document_id, tags",
      )
      .eq("family_id", family.id)
      .eq("confirmed", true)
      .eq("status", "open")
      .order("created_at", { ascending: false }),
    // 6. Just enough information for the first-visit decision. Existing
    //    documents stay on /dokumente unless they need a confirmation.
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("family_id", family.id),
    // 7. Fetch proactive insights from the knowledge graph.
    computeInsights(supabase, family.id),
    // 8. Today's calendar entries. Failures degrade to an empty list —
    //    the cockpit must not break while migrations roll out.
    loadTodayEvents(supabase, family.id).catch(
      () => [] as HomeCalendarEvent[],
    ),
  ]);

  const members: HomeMember[] = (memberRows ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    role: m.role,
    avatar_color: m.avatar_color,
  }));

  const analyzedDocuments: HomeDocument[] = (analyzedRows ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    original_filename: d.original_filename,
    mime_type: d.mime_type,
    status: d.status,
    created_at: d.created_at,
  }));

  // 5. Fetch document titles for the tasks (for source-document links).
  //    Depends on taskRows, so it stays sequential after the batch above.
  const taskDocIds = [
    ...new Set(
      (taskRows ?? [])
        .map((t) => t.document_id)
        .filter((id): id is string => id !== null),
    ),
  ];

  const docTitleMap = new Map<string, string | null>();
  if (taskDocIds.length > 0) {
    const { data: taskDocs } = await supabase
      .from("documents")
      .select("id, title")
      .in("id", taskDocIds);
    for (const doc of taskDocs ?? []) {
      docTitleMap.set(doc.id, doc.title);
    }
  }

  const upcomingTasks: HomeTask[] = (taskRows ?? []).map((t) => ({
    id: t.id,
    family_id: t.family_id,
    title: t.title,
    description: t.description,
    due_date: t.due_date,
    priority: t.priority,
    status: t.status,
    confidence: t.confidence,
    confirmed: t.confirmed,
    created_at: t.created_at,
    tags: t.tags,
    document_id: t.document_id,
    document_title: t.document_id ? docTitleMap.get(t.document_id) ?? null : null,
  }));

  return (
    <HomeClient
      greeting={getGreeting()}
      familyName={family.name}
      members={members}
      analyzedDocuments={analyzedDocuments}
      unconfirmedDocCount={unconfirmedDocCount ?? 0}
      upcomingTasks={upcomingTasks}
      todayEvents={todayEvents}
      hasDocuments={(documentCount ?? 0) > 0}
      insights={insights}
      autoOpenScan={autoOpenScan}
    />
  );
}
