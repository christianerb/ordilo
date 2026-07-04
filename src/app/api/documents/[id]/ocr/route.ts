import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { runOcr, DatalabOcrError } from "@/lib/ai/ocr";
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
 *   2. Fetch the document (RLS-scoped server client → 404 if not found)
 *   3. Verify family ownership (RLS enforces this; 403/404 if not owner)
 *   4. Validate state machine: only `uploaded` or `failed` can start OCR
 *      (409 for invalid source state)
 *   5. Set status to `ocr_processing` (before the Datalab call)
 *   6. Download the file from Supabase Storage
 *   7. Call Datalab OCR (POST /api/v1/convert → poll until complete)
 *   8. Store one document_pages row per page, concatenate to ocr_text,
 *      set page_count, update status to `ocr_done`
 *   9. Return { status: "ocr_done", page_count }
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
 * RLS: The document fetch uses the server client (RLS-scoped), so a user
 * who does not own the document's family gets a 404 (not a 403, to avoid
 * leaking existence). No Datalab call is made for non-owned documents.
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
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(documentId)) {
    const body: OcrErrorResponse = {
      error: "Ungültige Dokument-ID.",
      code: "INVALID_DOCUMENT_ID",
    };
    return Response.json(body, { status: 400 });
  }

  // 3. Fetch the document (RLS-scoped) ------------------------------------
  // Using the server client enforces RLS: a user who doesn't own the
  // document's family will get no row (→ 404).
  const serverClient = await createServerClient();
  const { data: document, error: docError } = await serverClient
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();

  if (docError || !document) {
    // 404 (not 403) to avoid leaking document existence to non-owners.
    const body: OcrErrorResponse = {
      error: "Dokument nicht gefunden oder kein Zugriff.",
      code: "DOCUMENT_NOT_FOUND",
    };
    return Response.json(body, { status: 404 });
  }

  // 4. State machine validation -------------------------------------------
  if (!OCR_ALLOWED_SOURCE_STATUSES.has(document.status)) {
    const body: OcrErrorResponse = {
      error: `OCR kann für ein Dokument im Status „${document.status}“ nicht gestartet werden.`,
      code: "INVALID_STATUS_TRANSITION",
    };
    return Response.json(body, { status: 409 });
  }

  // 5. Transition to ocr_processing (before the Datalab call) --------------
  // Clear any prior error_message when retrying from `failed`.
  const { error: transitionError } = await serverClient
    .from("documents")
    .update({
      status: "ocr_processing",
      error_message: null,
    })
    .eq("id", documentId);

  if (transitionError) {
    const body: OcrErrorResponse = {
      error: "Status konnte nicht aktualisiert werden.",
      code: "DB_UPDATE_FAILED",
    };
    return Response.json(body, { status: 500 });
  }

  // 6. Download the file from Storage -------------------------------------
  const adminClient = createAdminClient();

  let fileData: Blob;
  try {
    const { data: downloadData, error: downloadError } =
      await adminClient.storage.from("documents").download(document.file_url);

    if (downloadError || !downloadData) {
      throw new DatalabOcrError(
        "Datei konnte nicht aus dem Speicher geladen werden.",
        "STORAGE_DOWNLOAD_FAILED",
      );
    }

    // The Supabase JS SDK returns a Blob (or Blob-like object) from
    // storage.download(). Convert to a proper Blob for the Datalab client.
    fileData = downloadData instanceof Blob
      ? downloadData
      : new Blob([downloadData]);
  } catch (err) {
    // Could be the DatalabOcrError we threw above, or an unexpected error.
    const message =
      err instanceof DatalabOcrError
        ? err.message
        : "Datei konnte nicht aus dem Speicher geladen werden.";
    const code =
      err instanceof DatalabOcrError ? err.code : "STORAGE_DOWNLOAD_FAILED";

    await markFailed(serverClient, documentId, message);
    const body: OcrErrorResponse = { error: message, code };
    return Response.json(body, { status: 500 });
  }

  // 7. Call Datalab OCR ---------------------------------------------------
  try {
    const ocrResult = await runOcr(
      fileData,
      document.original_filename || "document",
    );

    // 8. Store results immediately (1-hour eviction window) ---------------
    // Insert one document_pages row per page.
    if (ocrResult.pages.length > 0) {
      const pageInserts = ocrResult.pages.map((page) => ({
        document_id: documentId,
        page_number: page.page_number,
        ocr_markdown: page.ocr_markdown,
        layout_json: page.layout_json,
      }));

      const { error: pagesError } = await serverClient
        .from("document_pages")
        .insert(pageInserts);

      if (pagesError) {
        throw new DatalabOcrError(
          "OCR-Ergebnisse konnten nicht gespeichert werden.",
          "DB_INSERT_FAILED",
        );
      }
    }

    // Update the document: status, page_count, ocr_text.
    const { error: updateError } = await serverClient
      .from("documents")
      .update({
        status: "ocr_done",
        page_count: ocrResult.page_count,
        ocr_text: ocrResult.full_markdown,
        error_message: null,
      })
      .eq("id", documentId);

    if (updateError) {
      throw new DatalabOcrError(
        "Dokument-Status konnte nicht aktualisiert werden.",
        "DB_UPDATE_FAILED",
      );
    }

    // 9. Success ----------------------------------------------------------
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

    await markFailed(serverClient, documentId, message);

    // Determine HTTP status: 502 for upstream (Datalab) errors,
    // 500 for internal errors, 4xx for client/config issues.
    const statusCode = isDatalabError && err instanceof DatalabOcrError
      ? (err.statusCode && err.statusCode >= 400 && err.statusCode < 500
        ? err.statusCode
        : 502)
      : 500;

    const body: OcrErrorResponse = { error: message, code };
    return Response.json(body, { status: statusCode });
  }
}

/**
 * Mark a document as failed with an error message.
 *
 * Helper that updates the document status to `failed` and stores the
 * error message. Used in all failure paths so the document list reflects
 * the failed state and the UI can show a retry affordance.
 *
 * Errors in this helper are silently ignored (best-effort) — the primary
 * error has already occurred and we don't want to mask it with a
 * secondary DB error.
 */
async function markFailed(
  client: Awaited<ReturnType<typeof createServerClient>>,
  documentId: string,
  errorMessage: string,
): Promise<void> {
  try {
    await client
      .from("documents")
      .update({
        status: "failed",
        error_message: errorMessage,
      })
      .eq("id", documentId);
  } catch {
    // Best-effort: if we can't update the status, the document stays at
    // ocr_processing. The UI will still show it as processing. This is
    // a degraded state but preferable to crashing the route handler.
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
