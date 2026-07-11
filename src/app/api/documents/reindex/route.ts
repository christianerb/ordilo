import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { getFamilyId } from "@/lib/supabase/client-helpers";
import { enqueueJob } from "@/lib/jobs";
import { PIPELINE_VERSION } from "@/lib/ai/models";

/**
 * POST /api/documents/reindex
 *
 * Enqueues `reindex` jobs for the current user's family: every confirmed
 * document whose embeddings were produced by an older pipeline version is
 * re-embedded by the job worker with the current PIPELINE_VERSION.
 *
 * Body (optional): { "force": true } — reindex ALL confirmed documents,
 * regardless of version (e.g. after tuning chunking parameters that do not
 * warrant a version bump).
 *
 * The jobs run in the background (`POST /api/jobs/run`); this endpoint
 * only enqueues and returns the count. Family scoping: the family is
 * resolved via the RLS server client; job rows are inserted with the
 * service-role client (authenticated users cannot write processing_jobs).
 */
export async function POST(request: Request): Promise<Response> {
  // 1. Authenticate ----------------------------------------------------------
  const auth = await requireUser();
  if (auth.status) {
    return Response.json(auth.json, { status: auth.status });
  }

  const serverClient = await createServerClient();
  const familyId = await getFamilyId(serverClient);
  if (!familyId) {
    return Response.json(
      { error: "Keine Familie gefunden.", code: "NO_FAMILY" },
      { status: 404 },
    );
  }

  let force = false;
  try {
    const body = await request.json();
    force = body?.force === true;
  } catch {
    // No body → default (only stale documents).
  }

  // 2. Find candidate documents (RLS-scoped) ---------------------------------
  const { data: docs, error: docsError } = await serverClient
    .from("documents")
    .select("id")
    .eq("family_id", familyId)
    .eq("status", "confirmed");

  if (docsError) {
    return Response.json(
      { error: "Dokumente konnten nicht geladen werden.", code: "DB_READ_FAILED" },
      { status: 500 },
    );
  }

  let candidateIds = (docs ?? []).map((d) => d.id);

  if (!force && candidateIds.length > 0) {
    // Only documents whose embeddings are stale (older pipeline_version)
    // or missing entirely.
    const { data: freshRows, error: freshError } = await serverClient
      .from("document_embeddings")
      .select("document_id")
      .eq("family_id", familyId)
      .gte("pipeline_version", PIPELINE_VERSION);

    if (freshError) {
      return Response.json(
        { error: "Embeddings konnten nicht geladen werden.", code: "DB_READ_FAILED" },
        { status: 500 },
      );
    }

    const freshDocIds = new Set((freshRows ?? []).map((r) => r.document_id));
    candidateIds = candidateIds.filter((id) => !freshDocIds.has(id));
  }

  // 3. Enqueue reindex jobs (idempotent per document) -------------------------
  const adminClient = createAdminClient();
  let enqueued = 0;
  for (const documentId of candidateIds) {
    const ok = await enqueueJob(adminClient, {
      family_id: familyId,
      document_id: documentId,
      job_type: "reindex",
    });
    if (ok) enqueued += 1;
  }

  return Response.json(
    {
      status: "enqueued",
      pipeline_version: PIPELINE_VERSION,
      documents: candidateIds.length,
      enqueued,
    },
    { status: 200 },
  );
}

/**
 * GET /api/documents/reindex — method not allowed.
 */
export async function GET(): Promise<Response> {
  return Response.json(
    { error: "Methode nicht erlaubt. Bitte POST verwenden.", code: "METHOD_NOT_ALLOWED" },
    { status: 405 },
  );
}
