import { redirect } from "next/navigation";
import { createClient, getMiddlewareFamily } from "@/lib/supabase/server";
import { DOCUMENT_LIST_COLUMNS } from "@/lib/scan/document-list-columns";
import type { DocumentRow } from "@/lib/scan/scan-context-types";
import { DokumenteClient } from "./dokumente-client";

/**
 * Dokumente page (server component).
 *
 * Loads the family's documents server-side (RLS-scoped, same column set
 * the ScanProvider uses) and hands them to the client component as
 * `initialDocuments` so the first paint renders the list immediately
 * instead of a spinner — matching how /suche, /aufgaben and /home pass
 * server-fetched initial data into their client components.
 *
 * The ScanProvider stays the live source of truth: the client component
 * only falls back to `initialDocuments` while the provider's own initial
 * load is in flight, then realtime/polling delta updates take over.
 */
export default async function DokumentePage() {
  const supabase = await createClient();

  // Fetch the user's family (RLS-scoped). On full page loads the
  // middleware already ran this query for the onboarding gate and hands
  // the result over via request headers — only RSC navigations need the
  // fallback query.
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
    redirect("/onboarding");
  }

  const { data } = await supabase
    .from("documents")
    .select(DOCUMENT_LIST_COLUMNS)
    .eq("family_id", family.id)
    .order("created_at", { ascending: false });

  // The trimmed selection carries every column except the heavy
  // `ocr_text`, which no list consumer reads (same cast the provider does).
  const initialDocuments = (data as DocumentRow[] | null) ?? [];

  return <DokumenteClient initialDocuments={initialDocuments} />;
}
