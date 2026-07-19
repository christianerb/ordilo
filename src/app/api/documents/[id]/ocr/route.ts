import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { isValidUuid, markDocumentFailed } from "@/lib/supabase/document-helpers";
import { DatalabOcrError } from "@/lib/ai/ocr";
import { performOcrStep } from "@/lib/pipeline/ocr-step";
import { CLEAR_DOCUMENT_FAILURE } from "@/lib/pipeline/failure-tracking";
import {
  OCR_ALLOWED_SOURCE_STATUSES,
  type OcrSuccessResponse,
  type OcrErrorResponse,
} from "@/lib/schemas/document";

/**
 * POST /api/documents/[id]/ocr
 *
 * Triggers OCR processing for a document:
 *   1. Authenticate the user (requireUser → 401 if no session)
 *   2. Validate the document ID is a UUID
 *   3. Atomically transition the document from `uploaded` or `failed` to
 *      `ocr_processing` using a conditional UPDATE. This is race-safe:
 *      only one concurrent request can succeed in moving the document
 *      into `ocr_processing`. If 0 rows are updated, a follow-up read
 *      determines whether the document doesn't exist (→ 404) or is in
 *      the wrong state (→ 409).
 *   4. Download the file from Supabase Storage
 *   5. Call Datalab OCR (POST /api/v1/convert → poll until complete)
 *   6. Store one document_pages row per page (with per-page layout_json),
 *      concatenate to ocr_text, set page_count, update status to `ocr_done`
 *   7. Return { status: "ocr_done", page_count }
 *
 * Failure handling:
 *   - If Datalab fails, times out, or throws → set status to `failed`
 *     with error_message, return structured error { error, code }
 *   - The DATALAB_API_KEY is never exposed to the client.
 *
 * Long-running: OCR can take 10-60s. The route keeps the connection open
 * and polls Datalab server-side. The client sees `ocr_processing` via the
 * document list and shows a processing animation.
 *
 * RLS: The atomic update and all subsequent queries use the server client
 * (RLS-scoped), so a user who does not own the document's family gets a
 * 404 (not a 403, to avoid leaking existence). No Datalab call is made
 * for non-owned documents.
 *
 * Atomicity: The `uploaded|failed → ocr_processing` transition uses a
 * single conditional UPDATE with `WHERE id = ? AND status IN
 * ('uploaded', 'failed')` (via PostgREST's `.in()` filter). This ensures
 * that concurrent OCR start requests for the same document are rejected:
 * only the first request transitions the status, and the second finds
 * the document already in `ocr_processing` (not in the allowed set) and
 * gets 0 updated rows → 409.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  // 1. Authenticate --------------------------------------------------------
  const auth = await requireUser();
  if (auth.status) {
    const body: OcrErrorResponse = auth.json;
    return Response.json(body, { status: auth.status });
  }

  // 2. Parse document ID from the route params -----------------------------
  const { id: documentId } = await params;

  // Validate the document ID is a UUID (defensive — Next.js route matching
  // may pass non-UUID segments).
  if (!isValidUuid(documentId)) {
    const body: OcrErrorResponse = {
      error: "Ungültige Dokument-ID.",
      code: "INVALID_DOCUMENT_ID",
    };
    return Response.json(body, { status: 400 });
  }

  // 3. Atomic conditional transition to ocr_processing ---------------------
  // This single UPDATE atomically checks the current status AND transitions
  // to ocr_processing. Only a document in 'uploaded' or 'failed' state can
  // be transitioned. If another concurrent request already moved the
  // document to ocr_processing, this update matches 0 rows.
  //
  // The .select() returns the full updated row so we get the document data
  // (file_url, original_filename, etc.) without a separate fetch.
  //
  // RLS is enforced by the server client: a non-owner gets 0 rows (→ 404).
  const serverClient = await createServerClient();
  const { data: document, error: transitionError } = await serverClient
    .from("documents")
    .update({
      status: "ocr_processing",
      ...CLEAR_DOCUMENT_FAILURE,
    })
    .eq("id", documentId)
    .in("status", [...OCR_ALLOWED_SOURCE_STATUSES])
    .select()
    .maybeSingle();

  if (transitionError) {
    const body: OcrErrorResponse = {
      error: "Status konnte nicht aktualisiert werden.",
      code: "DB_UPDATE_FAILED",
    };
    return Response.json(body, { status: 500 });
  }

  // If the atomic update matched 0 rows, the document either doesn't exist
  // (or RLS blocks access) → 404, or it's in the wrong state → 409.
  // Do a follow-up read to determine the correct error code. This read is
  // not part of the transition — the transition is already atomic.
  if (!document) {
    const { data: existingDoc } = await serverClient
      .from("documents")
      .select("id, status")
      .eq("id", documentId)
      .maybeSingle();

    if (!existingDoc) {
      // 404 (not 403) to avoid leaking document existence to non-owners.
      const body: OcrErrorResponse = {
        error: "Dokument nicht gefunden oder kein Zugriff.",
        code: "DOCUMENT_NOT_FOUND",
      };
      return Response.json(body, { status: 404 });
    }

    // Document exists but is not in an allowed source state.
    const body: OcrErrorResponse = {
      error: `OCR kann für ein Dokument im Status „${existingDoc.status}“ nicht gestartet werden.`,
      code: "INVALID_STATUS_TRANSITION",
    };
    return Response.json(body, { status: 409 });
  }

  // 4-6. Download, OCR, persist (shared pipeline step) ---------------------
  // The same step runs in the background job worker (PIPELINE_MODE=async).
  const adminClient = createAdminClient();

  try {
    const ocrResult = await performOcrStep(serverClient, adminClient, document);

    // 7. Success ----------------------------------------------------------
    const body: OcrSuccessResponse = {
      status: "ocr_done",
      page_count: ocrResult.page_count,
    };
    return Response.json(body, { status: 200 });
  } catch (err) {
    // Any failure (Datalab error, timeout, DB error) → mark as failed.
    const isDatalabError = err instanceof DatalabOcrError;
    const message = isDatalabError
      ? err.message
      : "OCR ist fehlgeschlagen. Bitte erneut versuchen.";
    const code = isDatalabError ? err.code : "OCR_FAILED";

    await markDocumentFailed(serverClient, documentId, message, {
      stage: "ocr",
      code,
      cause: err,
      familyId: document.family_id,
    });

    // Determine HTTP status: 502 for upstream (Datalab) errors,
    // 500 for internal errors (storage/DB), 4xx for client/config issues.
    const internalCodes = new Set(["NO_FILE", "STORAGE_DOWNLOAD_FAILED"]);
    const statusCode = isDatalabError && err instanceof DatalabOcrError
      ? internalCodes.has(err.code)
        ? 500
        : (err.statusCode && err.statusCode >= 400 && err.statusCode < 500
          ? err.statusCode
          : 502)
      : 500;

    const body: OcrErrorResponse = { error: message, code };
    return Response.json(body, { status: statusCode });
  }
}

/**
 * GET /api/documents/[id]/ocr — method not allowed.
 */
export async function GET(): Promise<Response> {
  const body: OcrErrorResponse = {
    error: "Methode nicht erlaubt. Bitte POST verwenden.",
    code: "METHOD_NOT_ALLOWED",
  };
  return Response.json(body, { status: 405 });
}
