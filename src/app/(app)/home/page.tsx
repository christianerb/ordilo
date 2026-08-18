import { redirect } from "next/navigation";
import { createClient, getMiddlewareFamily } from "@/lib/supabase/server";
import { HomeClient, type HomeMember } from "./home-client";
import {
  filterRecentDocuments,
  JOURNAL_DOCS_LIMIT,
  type HomeTask,
  type HomeDocument,
} from "@/lib/home-utils";

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
      .is("deleted_at", null)
      .eq("status", "analyzed")
      .order("created_at", { ascending: false })
      .limit(3),
    // 3b. Exact count of documents awaiting confirmation (for the
    //     briefing: "3 Dokumente warten auf dein OK").
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("family_id", family.id)
      .is("deleted_at", null)
      .eq("status", "analyzed"),
    // 3c. Total documents in the family book (all non-failed) — the quiet
    //     "… Dokumente sicher im Familienbuch" line in the journal header.
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("family_id", family.id)
      .is("deleted_at", null)
      .neq("status", "failed"),
    // The first-success nudge is deliberately based on confirmed documents
    // only: an uploaded or pending scan is not a lasting family result yet.
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("family_id", family.id)
      .is("deleted_at", null)
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
      .is("deleted_at", null)
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
      .is("deleted_at", null)
      .neq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(JOURNAL_DOCS_LIMIT),
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
      .in("id", taskDocIds)
      .is("deleted_at", null);
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
      autoOpenScan={autoOpenScan}
    />
  );
}
