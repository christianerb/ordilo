import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { isValidUuid } from "@/lib/supabase/document-helpers";

/**
 * DELETE /api/documents/[id]
 *
 * Deletes a document AND its Storage file.
 *
 * Previously the client deleted the DB row directly and attempted the
 * Storage removal with the browser client — which silently fails on the
 * private bucket (no storage RLS policies for users), leaving orphaned
 * files. This route does it properly:
 *
 *   1. Authenticate (401 without session)
 *   2. Read the document RLS-scoped (404 if not visible — no existence leak)
 *   3. Delete the DB row via the server client (RLS-enforced; cascades to
 *      pages, entities, tasks, facts, embeddings, edges)
 *   4. Remove the Storage object with the admin client (service role) —
 *      best-effort: a failure here never blocks the delete, but is logged.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) {
    return Response.json(auth.json, { status: auth.status });
  }

  const { id: documentId } = await params;
  if (!isValidUuid(documentId)) {
    return Response.json(
      { error: "Ungültige Dokument-ID.", code: "INVALID_DOCUMENT_ID" },
      { status: 400 },
    );
  }

  const serverClient = await createServerClient();

  // RLS-scoped read: non-owned/nonexistent → 404 (no existence leak).
  const { data: document, error: readError } = await serverClient
    .from("documents")
    .select("id, file_url")
    .eq("id", documentId)
    .maybeSingle();

  if (readError) {
    return Response.json(
      { error: "Dokument konnte nicht geladen werden.", code: "DB_READ_FAILED" },
      { status: 500 },
    );
  }
  if (!document) {
    return Response.json(
      { error: "Dokument nicht gefunden oder kein Zugriff.", code: "DOCUMENT_NOT_FOUND" },
      { status: 404 },
    );
  }

  // Delete the row (RLS-enforced; FK cascades clean up all derived data).
  const { error: deleteError } = await serverClient
    .from("documents")
    .delete()
    .eq("id", documentId);

  if (deleteError) {
    return Response.json(
      { error: "Dokument konnte nicht gelöscht werden.", code: "DB_DELETE_FAILED" },
      { status: 500 },
    );
  }

  // Best-effort Storage cleanup with the service-role client.
  if (document.file_url) {
    const adminClient = createAdminClient();
    const { error: storageError } = await adminClient.storage
      .from("documents")
      .remove([document.file_url]);
    if (storageError) {
      console.error(
        `[documents] Storage cleanup failed for ${documentId}:`,
        storageError,
      );
    }
  }

  return Response.json({ status: "deleted", document_id: documentId });
}

/**
 * GET /api/documents/[id] — method not allowed.
 */
export async function GET(): Promise<Response> {
  return Response.json(
    { error: "Methode nicht erlaubt.", code: "METHOD_NOT_ALLOWED" },
    { status: 405 },
  );
}
