import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HomeClient, type HomeDocument, type HomeMember } from "./home-client";
import type { HomeTask } from "@/lib/home-utils";

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
 * /scan, navigating to /home reflects the new state immediately.
 */
export default async function HomePage() {
  const supabase = await createClient();

  // 1. Fetch the user's family (RLS-scoped).
  const { data: family } = await supabase
    .from("families")
    .select("id, name")
    .limit(1)
    .maybeSingle();

  if (!family) {
    redirect("/onboarding");
  }

  // 2. Fetch family members (for greeting area).
  const { data: memberRows } = await supabase
    .from("family_members")
    .select("id, name, role, avatar_color")
    .eq("family_id", family.id)
    .order("created_at", { ascending: true });

  const members: HomeMember[] = (memberRows ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    role: m.role,
    avatar_color: m.avatar_color,
  }));

  // 3. Fetch analyzed documents (awaiting user confirmation).
  const { data: analyzedRows } = await supabase
    .from("documents")
    .select("id, title, original_filename, mime_type, status, created_at")
    .eq("family_id", family.id)
    .eq("status", "analyzed")
    .order("created_at", { ascending: false })
    .limit(5);

  const analyzedDocuments: HomeDocument[] = (analyzedRows ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    original_filename: d.original_filename,
    mime_type: d.mime_type,
    status: d.status,
    created_at: d.created_at,
  }));

  // 4. Fetch confirmed open tasks with due dates (for "Heute wichtig" and
  //    "Fristen"). We fetch all confirmed open tasks and let the client
  //    component filter them into the two sections.
  const { data: taskRows } = await supabase
    .from("tasks")
    .select(
      "id, family_id, title, due_date, priority, status, confidence, confirmed, created_at, document_id",
    )
    .eq("family_id", family.id)
    .eq("confirmed", true)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  // 5. Fetch document titles for the tasks (for source-document links).
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
    due_date: t.due_date,
    priority: t.priority,
    status: t.status,
    confidence: t.confidence,
    confirmed: t.confirmed,
    created_at: t.created_at,
    document_id: t.document_id,
    document_title: t.document_id ? docTitleMap.get(t.document_id) ?? null : null,
  }));

  // 6. Fetch recent documents (by created_at desc, any status).
  const { data: recentRows } = await supabase
    .from("documents")
    .select("id, title, original_filename, mime_type, status, created_at")
    .eq("family_id", family.id)
    .order("created_at", { ascending: false })
    .limit(5);

  const recentDocuments: HomeDocument[] = (recentRows ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    original_filename: d.original_filename,
    mime_type: d.mime_type,
    status: d.status,
    created_at: d.created_at,
  }));

  return (
    <HomeClient
      familyName={family.name}
      members={members}
      analyzedDocuments={analyzedDocuments}
      upcomingTasks={upcomingTasks}
      recentDocuments={recentDocuments}
    />
  );
}
