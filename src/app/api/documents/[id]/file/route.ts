import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { resolveDocumentWithOwnership } from "@/lib/supabase/document-helpers";

/** How long the signed URL stays valid, in seconds. */
const SIGNED_URL_TTL_SECONDS = 300;

/**
 * GET /api/documents/[id]/file
 *
 * Returns a short-lived signed URL for the document's original file in
 * Supabase Storage, so the client can offer an "Original ansehen" link
 * without exposing the storage bucket publicly.
 *
 * Flow:
 *   1. Authenticate the user (requireUser → 401 if no session)
 *   2. Resolve the document with RLS + ownership distinction (403 vs 404),
 *      reusing the same helper as the analyze/confirm/OCR routes.
 *   3. Create a signed URL (via the admin client, since the storage bucket
 *      is not publicly readable) for the document's `file_url` path.
 *   4. Return { url } — the client opens it directly (e.g. in a new tab).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) {
    return Response.json(auth.json, { status: auth.status });
  }

  const { id: documentId } = await params;

  const serverClient = await createServerClient();
  const adminClient = createAdminClient();

  const { document, error } = await resolveDocumentWithOwnership(
    serverClient,
    adminClient,
    documentId,
  );

  if (error) {
    return Response.json(error.body, { status: error.status });
  }

  const { data: signed, error: signError } = await adminClient.storage
    .from("documents")
    .createSignedUrl(document.file_url, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    return Response.json(
      {
        error: "Datei konnte nicht geladen werden.",
        code: "SIGNED_URL_FAILED",
      },
      { status: 500 },
    );
  }

  return Response.json({ url: signed.signedUrl }, { status: 200 });
}
