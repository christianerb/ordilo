import { redirect } from "next/navigation";
import { createClient, getMiddlewareFamily } from "@/lib/supabase/server";
import { DOCUMENT_LIST_COLUMNS } from "@/lib/scan/document-list-columns";
import type { DocumentRow } from "@/lib/scan/scan-context-types";
import { DokumenteClient } from "./dokumente-client";
import type { ContactRow } from "./actions";
import { familyInboundEmail } from "@/lib/family-inbound-email";

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
export default async function DokumentePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const tab = (await searchParams).tab;
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

  const documentsPromise = supabase
    .from("documents")
    .select(DOCUMENT_LIST_COLUMNS)
    .eq("family_id", family.id)
    .order("created_at", { ascending: false });
  const contactsPromise =
    tab === "kontakte"
      ? supabase
          .from("contacts")
          .select("*")
          .eq("family_id", family.id)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [] as ContactRow[] });
  const notePreviewsPromise =
    tab === "notizen"
      ? supabase
          .from("documents")
          .select("id, ocr_text")
          .eq("family_id", family.id)
          .eq("source", "manual")
      : Promise.resolve({
          data: [] as Array<{ id: string; ocr_text: string | null }>,
        });
  const emailAliasPromise = supabase
    .from("family_email_aliases")
    .select("local_part")
    .eq("family_id", family.id)
    .maybeSingle();

  const [
    { data },
    { data: contactData },
    { data: notePreviewData },
    { data: emailAlias },
  ] = await Promise.all([
    documentsPromise,
    contactsPromise,
    notePreviewsPromise,
    emailAliasPromise,
  ]);

  // The trimmed selection carries every column except the heavy
  // `ocr_text`, which no list consumer reads (same cast the provider does).
  const initialDocuments = (data as DocumentRow[] | null) ?? [];

  return (
    <DokumenteClient
      initialDocuments={initialDocuments}
      initialContacts={(contactData as ContactRow[] | null) ?? []}
      initialNotePreviews={Object.fromEntries(
        (notePreviewData ?? []).map((note) => [
          note.id,
          note.ocr_text?.trim().slice(0, 180) ?? "",
        ]),
      )}
      inboundEmail={familyInboundEmail(
        emailAlias?.local_part ?? "",
        process.env.INBOUND_EMAIL_DOMAIN,
      )}
    />
  );
}
