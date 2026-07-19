import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import {
  resolveDocumentWithOwnership,
  markDocumentFailed,
} from "@/lib/supabase/document-helpers";
import { ExtractionError } from "@/lib/ai/extraction";
import {
  loadOcrText,
  performAnalyzeStep,
  NoOcrTextError,
  PipelineStepError,
} from "@/lib/pipeline/analyze-step";
import { CLEAR_DOCUMENT_FAILURE } from "@/lib/pipeline/failure-tracking";
import { ANALYZE_ALLOWED_SOURCE_STATUSES } from "@/lib/schemas/document";
import {
  type DocumentAnalysis,
  type AnalyzeSuccessResponse,
  type AnalyzeErrorResponse,
} from "@/lib/schemas/extraction";

/**
 * POST /api/documents/[id]/analyze
 *
 * Triggers LLM extraction for a document:
 *   1. Authenticate the user (requireUser → 401 if no session)
 *   2. Validate the document ID is a UUID
 *   3. Read the document (RLS-scoped) to check status and get family_id
 *   4. If not found via RLS → check admin client: exists but not owned → 403;
 *      truly does not exist → 404 (VAL-EXTRACT-007)
 *   5. If status not in allowed set (ocr_done, analyzed, confirmed, failed) → 409
 *   6. If there is no OCR text → 400 error (no OpenAI call)
 *   7. Atomically transition to `analyzing` (conditional on allowed source status)
 *   8. Run the shared analyze pipeline step (`performAnalyzeStep`): family
 *      context → OpenAI strict json_schema extraction → Zod validation →
 *      needs_user_review → store entities/tasks/facts → status=analyzed.
 *      The SAME step runs in the background job worker (PIPELINE_MODE=async).
 *   9. Return the full analysis JSON for the Review Card
 *
 * Failure handling:
 *   - If OpenAI fails, Zod validation fails, or a DB error occurs → set
 *     status to `failed` with error_message, return structured error.
 *   - The OPENAI_API_KEY is never exposed to the client.
 *
 * Re-analyze: When the document is already in `analyzed` or `confirmed`
 * status, prior extracted_entities/tasks/facts are cleared before storing
 * new results (no duplicates). When coming from `confirmed`,
 * knowledge_edges and document_embeddings are also cleared (they will be
 * regenerated on the next confirm).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  // 1. Authenticate --------------------------------------------------------
  const auth = await requireUser();
  if (auth.status) {
    const body: AnalyzeErrorResponse = auth.json;
    return Response.json(body, { status: auth.status });
  }

  // 2. Parse document ID from the route params -----------------------------
  const { id: documentId } = await params;

  const serverClient = await createServerClient();

  // 3-4. Validate UUID, read document (RLS-scoped), distinguish 403 vs 404 --
  const adminClient = createAdminClient();
  const { document, error: resolveError } = await resolveDocumentWithOwnership(
    serverClient,
    adminClient,
    documentId,
  );

  if (resolveError) {
    const body: AnalyzeErrorResponse = resolveError.body;
    return Response.json(body, { status: resolveError.status });
  }

  // 5. Check status — must be in allowed source set -----------------------
  if (!ANALYZE_ALLOWED_SOURCE_STATUSES.has(document.status)) {
    const body: AnalyzeErrorResponse = {
      error: `Analyse kann für ein Dokument im Status „${document.status}" nicht gestartet werden.`,
      code: "INVALID_STATUS_TRANSITION",
    };
    return Response.json(body, { status: 409 });
  }

  // Record the previous status so we can detect re-analyze from `confirmed`.
  const wasConfirmed = document.status === "confirmed";

  // 6. Verify OCR text exists BEFORE transitioning (no OpenAI call, no
  //    status change for documents without OCR text).
  try {
    await loadOcrText(serverClient, {
      id: documentId,
      ocr_text: document.ocr_text,
    });
  } catch (err) {
    if (err instanceof NoOcrTextError) {
      const body: AnalyzeErrorResponse = {
        error: err.message,
        code: err.code,
      };
      return Response.json(body, { status: 400 });
    }
    const body: AnalyzeErrorResponse = {
      error: "OCR-Text konnte nicht geladen werden.",
      code: "DB_READ_FAILED",
    };
    return Response.json(body, { status: 500 });
  }

  // 7. Atomic transition to `analyzing` -----------------------------------
  const { data: transitioned, error: transitionError } = await serverClient
    .from("documents")
    .update({
      status: "analyzing",
      ...CLEAR_DOCUMENT_FAILURE,
    })
    .eq("id", documentId)
    .in("status", [...ANALYZE_ALLOWED_SOURCE_STATUSES])
    .select("id")
    .maybeSingle();

  if (transitionError) {
    const body: AnalyzeErrorResponse = {
      error: "Status konnte nicht aktualisiert werden.",
      code: "DB_UPDATE_FAILED",
    };
    return Response.json(body, { status: 500 });
  }

  if (!transitioned) {
    const body: AnalyzeErrorResponse = {
      error: "Der Dokument-Status hat sich geändert. Bitte erneut versuchen.",
      code: "STATUS_CHANGED",
    };
    return Response.json(body, { status: 409 });
  }

  // 8. Run the shared analyze pipeline step --------------------------------
  // Any failure marks the document 'failed' so it is never stranded in
  // 'analyzing' (VAL-EXTRACT-008).
  let analysis: DocumentAnalysis;
  try {
    analysis = await performAnalyzeStep(serverClient, {
      id: documentId,
      family_id: document.family_id,
      ocr_text: document.ocr_text,
      wasConfirmed,
    });
  } catch (err) {
    const isExtractionError = err instanceof ExtractionError;
    const message = isExtractionError
      ? err.message
      : err instanceof Error
        ? err.message
        : "Analyse ist fehlgeschlagen. Bitte erneut versuchen.";
    const code = isExtractionError
      ? err.code
      : err instanceof PipelineStepError
        ? err.code
        : err instanceof Error
          ? "ANALYSIS_FAILED"
          : "EXTRACTION_FAILED";

    await markDocumentFailed(serverClient, documentId, message, {
      stage: "analysis",
      code,
      cause: err,
      familyId: document.family_id,
    });

    const statusCode =
      isExtractionError && err instanceof ExtractionError
        ? err.statusCode &&
          err.statusCode >= 400 &&
          err.statusCode < 500
          ? err.statusCode
          : 502
        : 500;

    const body: AnalyzeErrorResponse = { error: message, code };
    return Response.json(body, { status: statusCode });
  }

  // 9. Return the full analysis JSON ----------------------------------------
  const body: AnalyzeSuccessResponse = {
    ...analysis,
    document_id: documentId,
    status: "analyzed",
  };
  return Response.json(body, { status: 200 });
}

/**
 * GET /api/documents/[id]/analyze — method not allowed.
 */
export async function GET(): Promise<Response> {
  const body: AnalyzeErrorResponse = {
    error: "Methode nicht erlaubt. Bitte POST verwenden.",
    code: "METHOD_NOT_ALLOWED",
  };
  return Response.json(body, { status: 405 });
}
