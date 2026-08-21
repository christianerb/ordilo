import { redirect } from "next/navigation";
import { createClient, getMiddlewareFamily } from "@/lib/supabase/server";
import { HomeClient, type HomeMember } from "./home-client";
import {
  filterRecentDocuments,
  toLocalDateStr,
  JOURNAL_DOCS_LIMIT,
  type HomeTask,
  type HomeDocument,
} from "@/lib/home-utils";
import {
  HOME_EVENTS_HORIZON_DAYS,
  type HomeEventRow,
} from "@/lib/home-events";
import type { CalendarEvent } from "@/lib/calendar";
import type {
  InboundEmailDiscovery,
  InboundSuggestion,
} from "@/lib/inbound-suggestions";
import { MAX_EMAIL_SUGGESTIONS } from "@/lib/schemas/inbound-email";

/** How many forwarded emails the home screen asks about at once. */
const INBOUND_DISCOVERY_LIMIT = 3;

/**
 * The emails Ordilo read and made something of, together with the questions
 * still open on them — either a proposal nobody has answered yet, or the
 * keep-or-delete question about the email itself.
 */
async function loadInboundDiscoveries(
  supabase: ServerClient,
  familyId: string,
): Promise<InboundEmailDiscovery[]> {
  const { data: suggestionRows } = await supabase
    .from("inbound_suggestions")
    .select(
      "id, inbound_email_id, kind, title, starts_on, starts_time, ends_time, location, note",
    )
    .eq("family_id", familyId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    // A single email yields at most MAX_EMAIL_SUGGESTIONS proposals, so this
    // always reaches three distinct emails that still need an answer.
    .limit(INBOUND_DISCOVERY_LIMIT * MAX_EMAIL_SUGGESTIONS);

  const byEmail = new Map<string, InboundSuggestion[]>();
  for (const row of suggestionRows ?? []) {
    const list = byEmail.get(row.inbound_email_id) ?? [];
    list.push({
      id: row.id,
      kind: row.kind,
      title: row.title,
      starts_on: row.starts_on,
      starts_time: row.starts_time,
      ends_time: row.ends_time,
      location: row.location,
      note: row.note,
    });
    byEmail.set(row.inbound_email_id, list);
  }

  const candidateEmailIds = [...byEmail.keys()];
  const { data: retentionRows } = await supabase
    .from("inbound_emails")
    .select("id")
    .eq("family_id", familyId)
    .eq("retention", "pending")
    .order("received_at", { ascending: false })
    .limit(INBOUND_DISCOVERY_LIMIT);

  const unresolvedEmailIds = [
    ...candidateEmailIds,
    ...(retentionRows ?? []).map((row) => row.id),
  ];
  if (unresolvedEmailIds.length === 0) return [];

  const { data: emailRows } = await supabase
    .from("inbound_emails")
    .select("id, subject, from_address, received_at, retention")
    .eq("family_id", familyId)
    .in("id", unresolvedEmailIds)
    .order("received_at", { ascending: false });

  return (emailRows ?? [])
    .map((row) => ({
      id: row.id,
      subject: row.subject,
      fromAddress: row.from_address,
      receivedAt: row.received_at,
      retentionPending: row.retention === "pending",
      suggestions: byEmail.get(row.id) ?? [],
    }))
    // A fully answered email with its retention settled has nothing left to
    // say, and the home screen should not carry a card that only reports it.
    .filter(
      (discovery) =>
        discovery.suggestions.length > 0 || discovery.retentionPending,
    )
    .slice(0, INBOUND_DISCOVERY_LIMIT);
}

/**
 * Calendar events within Home's own horizon (today through
 * HOME_EVENTS_HORIZON_DAYS ahead), for the "Heute" timeline and the
 * "Demnächst" preview.
 *
 * Mirrors the digest email's query shape (lib/digest.ts / api/digest/run):
 * a recurring series can have started long before today, so the filter
 * keeps every series plus any one-off that has not ended yet — occurrence
 * expansion (expandHomeEventOccurrences) does the rest, client-side.
 */
async function loadHomeEventRows(
  supabase: ServerClient,
  familyId: string,
): Promise<HomeEventRow[]> {
  const today = toLocalDateStr(new Date());
  const horizon = toLocalDateStr(
    new Date(Date.now() + HOME_EVENTS_HORIZON_DAYS * 86_400_000),
  );

  const { data: rows } = await supabase
    .from("calendar_events")
    .select(
      "id, title, starts_on, ends_on, all_day, starts_time, ends_time, recurrence, recurrence_until, recurrence_exceptions, location, responsible_member_id",
    )
    .eq("family_id", familyId)
    .lte("starts_on", horizon)
    .or(`ends_on.gte.${today},recurrence.neq.none`);

  const eventRows = rows ?? [];
  const eventIds = eventRows.map((row) => row.id);
  const { data: attendeeRows } = eventIds.length
    ? await supabase
      .from("calendar_event_attendees")
      .select("event_id, family_member_id")
      .in("event_id", eventIds)
    : { data: [] };

  const memberIds = [
    ...new Set((attendeeRows ?? []).map((row) => row.family_member_id)),
  ];
  const memberNames = new Map<string, string>();
  if (memberIds.length > 0) {
    const { data: memberRows } = await supabase
      .from("family_members")
      .select("id, name")
      .in("id", memberIds);
    for (const member of memberRows ?? []) {
      memberNames.set(member.id, member.name);
    }
  }

  const namesByEvent = new Map<string, string[]>();
  for (const attendee of attendeeRows ?? []) {
    const list = namesByEvent.get(attendee.event_id) ?? [];
    const name = memberNames.get(attendee.family_member_id);
    if (name) list.push(name);
    namesByEvent.set(attendee.event_id, list);
  }

  return eventRows.map((row) => ({
    ...row,
    recurrence: row.recurrence as CalendarEvent["recurrence"],
    recurrence_exceptions: row.recurrence_exceptions ?? [],
    attendee_names: namesByEvent.get(row.id) ?? [],
  }));
}

/** How long journal thumbnail signed URLs stay valid, in seconds. */
const THUMB_SIGNED_URL_TTL_SECONDS = 300;

/** Thumbnail render size via Supabase image transforms (3:4 journal tile). */
const THUMB_TRANSFORM = { width: 480, height: 640, resize: "cover" } as const;

type ServerClient = Awaited<ReturnType<typeof createClient>>;

interface DocRowWithFile {
  id: string;
  mime_type: string | null;
  file_url: string | null;
}

/**
 * Resolve short-lived signed thumbnail URLs for image documents shown in
 * the home journal grid. PDFs and failures get no entry — the tile falls
 * back to its file-icon variant. Image transforms resize server-side; if
 * the plan does not support them, the tile's onError fallback catches it.
 *
 * Signs with the RLS-scoped server client (the service-role admin client
 * is reserved for API routes — AGENTS.md) and additionally guards the
 * path itself: only `file_url`s inside the current family's storage
 * folder (`{family_id}/...`) are ever signed, so a tampered row can never
 * turn this page into a signing oracle for another family's files.
 */
async function resolveThumbUrls(
  serverClient: ServerClient,
  familyId: string,
  docs: DocRowWithFile[],
  mergedFilePaths: Record<string, string>,
): Promise<Record<string, string>> {
  const imageDocs = docs.filter(
    (d) =>
      d.file_url &&
      (
        d.file_url.startsWith(`${familyId}/`)
        || mergedFilePaths[d.id] === d.file_url
      ) &&
      d.mime_type?.startsWith("image/"),
  );
  if (imageDocs.length === 0) return {};

  try {
    // Single createSignedUrl calls: only they support image transforms —
    // the batch createSignedUrls variant silently ignores them (it builds
    // plain /object/ URLs; the render/image path only exists per-file).
    const results = await Promise.all(
      imageDocs.map((d) =>
        serverClient.storage
          .from("documents")
          .createSignedUrl(d.file_url as string, THUMB_SIGNED_URL_TTL_SECONDS, {
            transform: THUMB_TRANSFORM,
          }),
      ),
    );

    const urls: Record<string, string> = {};
    for (let i = 0; i < imageDocs.length; i++) {
      const signedUrl = results[i].data?.signedUrl;
      if (signedUrl) urls[imageDocs[i].id] = signedUrl;
    }
    return urls;
  } catch {
    // Thumbnails are an enhancement, never a blocker for the page.
    return {};
  }
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
 * - Documents with status='analyzed' (for "Neue Dokumente zur Bestätigung")
 * - Confirmed open tasks with due dates (for "Heute wichtig" and "Fristen")
 * - Recent documents by created_at desc (for "Zuletzt gescannt")
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

  // 1. Fetch the user's family (RLS-scoped). On full page loads the
  //    middleware already ran this exact query for the onboarding gate and
  //    hands the result over via request headers — only RSC navigations
  //    (SPA tab switches) need the fallback query.
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

  // 2-4 + 6-7 only depend on family.id, not on each other's results, so
  // they run concurrently instead of as a sequential waterfall — this is
  // the single biggest lever for server-render latency on this page.
  const [
    { data: memberRows },
    { data: analyzedRows },
    { count: unconfirmedDocCount },
    { count: journalDocCount },
    { count: confirmedDocumentCount },
    { data: taskRows },
    { data: recentRows },
    inboundDiscoveries,
    eventRows,
  ] = await Promise.all([
    // 2. Fetch family members (for greeting area).
    supabase
      .from("family_members")
      .select("id, name, role, avatar_color")
      .eq("family_id", family.id)
      .order("created_at", { ascending: true }),
    // 3. Fetch analyzed documents (awaiting user confirmation). Capped for
    //    the journal grid; the exact count comes from the head query below
    //    so the briefing sentence never underreports.
    supabase
      .from("documents")
      .select("id, title, original_filename, mime_type, status, created_at, file_url, summary")
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
    // 3c. Total documents in the family book (all non-failed) — the quiet
    //     "… Dokumente sicher im Familienbuch" line in the journal header.
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("family_id", family.id)
      .neq("status", "failed"),
    // The first-success nudge is deliberately based on confirmed documents
    // only: an uploaded or pending scan is not a lasting family result yet.
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("family_id", family.id)
      .eq("status", "confirmed"),
    // 4. Fetch confirmed open tasks with due dates (for "Heute wichtig" and
    //    "Fristen"). We fetch all confirmed open tasks and let the client
    //    component filter them into the two sections.
    supabase
      .from("tasks")
      .select(
        "id, family_id, title, description, due_date, status, confidence, confirmed, created_at, document_id, tags",
      )
      .eq("family_id", family.id)
      .eq("confirmed", true)
      .eq("status", "open")
      .order("created_at", { ascending: false }),
    // 6. Fetch recent documents (by created_at desc, excluding failed).
    //    VAL-CROSS-013: failed documents must NOT surface on /home — they
    //    remain visible only on /dokumente. The DB query excludes them
    //    here, and filterRecentDocuments provides a second layer of
    //    defense.
    // Fetch enough recent rows that the journal grid still fills up after
    // mergeJournalDocuments removes the overlap with the analyzed
    // documents (the newest confirmed docs often ARE the analyzed ones).
    supabase
      .from("documents")
      .select("id, title, original_filename, mime_type, status, created_at, file_url, summary")
      .eq("family_id", family.id)
      .neq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(JOURNAL_DOCS_LIMIT),
    // 7. What Ordilo found in forwarded emails and is still waiting on an
    //    answer for.
    loadInboundDiscoveries(supabase, family.id),
    // 8. Calendar events within the Home horizon, for the "Heute" timeline
    //    and the "Demnächst" preview.
    loadHomeEventRows(supabase, family.id),
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
    summary: d.summary,
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
    status: t.status,
    confidence: t.confidence,
    confirmed: t.confirmed,
    created_at: t.created_at,
    tags: t.tags,
    document_id: t.document_id,
    document_title: t.document_id ? docTitleMap.get(t.document_id) ?? null : null,
  }));

  const recentDocuments: HomeDocument[] = filterRecentDocuments(
    (recentRows ?? []).map((d) => ({
      id: d.id,
      title: d.title,
      original_filename: d.original_filename,
      mime_type: d.mime_type,
      status: d.status,
      created_at: d.created_at,
      summary: d.summary,
    })),
    JOURNAL_DOCS_LIMIT,
  );

  // 8. Resolve journal thumbnails for image documents (best-effort — a
  //    failure just means the icon fallback renders).
  const thumbnailDocs = [
    ...(analyzedRows ?? []),
    ...(recentRows ?? []),
  ];
  const thumbnailDocumentIds = [
    ...new Set(thumbnailDocs.map((document) => document.id)),
  ];
  const { data: mergedPathRows } = thumbnailDocumentIds.length
    ? await supabase
      .from("family_merge_document_paths")
      .select("document_id, file_url")
      .eq("family_id", family.id)
      .in("document_id", thumbnailDocumentIds)
    : { data: [] };
  const mergedFilePaths = Object.fromEntries(
    (mergedPathRows ?? []).map((path) => [path.document_id, path.file_url]),
  );
  const thumbUrls = await resolveThumbUrls(
    supabase,
    family.id,
    thumbnailDocs,
    mergedFilePaths,
  );

  return (
    <HomeClient
      familyId={family.id}
      greeting={getGreeting()}
      familyName={family.name}
      members={members}
      analyzedDocuments={analyzedDocuments}
      unconfirmedDocCount={unconfirmedDocCount ?? 0}
      journalDocCount={journalDocCount ?? 0}
      confirmedDocumentCount={confirmedDocumentCount ?? 0}
      upcomingTasks={upcomingTasks}
      recentDocuments={recentDocuments}
      thumbUrls={thumbUrls}
      eventRows={eventRows}
      inboundDiscoveries={inboundDiscoveries}
      autoOpenScan={autoOpenScan}
    />
  );
}
