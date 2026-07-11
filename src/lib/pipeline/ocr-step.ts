import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { runOcr, DatalabOcrError } from "@/lib/ai/ocr";

/**
 * Shared OCR pipeline step.
 *
 * Extracted from `POST /api/documents/[id]/ocr` so the same logic runs in
 * two contexts:
 *   - the synchronous API route (client-orchestrated pipeline)
 *   - the background job worker (`job_type = 'ocr'`, PIPELINE_MODE=async)
 *
 * The caller is responsible for the atomic status transition
 * (`uploaded|failed → ocr_processing`) BEFORE calling this, and for
 * marking the document failed if this throws.
 */

type Client = SupabaseClient<Database>;

/** Minimal document shape the OCR step needs. */
export interface OcrStepDocument {
  id: string;
  file_url: string | null;
  original_filename: string | null;
}

export interface OcrStepResult {
  page_count: number;
}

/**
 * Download the document's file from Storage, run Datalab OCR, and persist
 * the results (document_pages rows + ocr_text/page_count on the document,
 * status → ocr_done).
 *
 * @param dbClient - Supabase client for DB writes (RLS server client in the
 *                   route; service-role client in the worker).
 * @param storageClient - Service-role client for Storage download (the
 *                        documents bucket is private).
 * @throws {DatalabOcrError} on storage, Datalab, or DB persistence failure.
 */
export async function performOcrStep(
  dbClient: Client,
  storageClient: Client,
  document: OcrStepDocument,
): Promise<OcrStepResult> {
  // 1. Download the file from Storage ---------------------------------------
  if (!document.file_url) {
    throw new DatalabOcrError(
      "Diesem Dokument ist keine Datei zugeordnet.",
      "NO_FILE",
    );
  }

  const { data: downloadData, error: downloadError } = await storageClient
    .storage
    .from("documents")
    .download(document.file_url);

  if (downloadError || !downloadData) {
    throw new DatalabOcrError(
      "Datei konnte nicht aus dem Speicher geladen werden.",
      "STORAGE_DOWNLOAD_FAILED",
    );
  }

  const fileData =
    downloadData instanceof Blob ? downloadData : new Blob([downloadData]);

  // 2. Call Datalab OCR ------------------------------------------------------
  const ocrResult = await runOcr(
    fileData,
    document.original_filename || "document",
  );

  // 3. Store results immediately (Datalab evicts after 1 hour) ---------------
  // Delete any existing document_pages rows first so retries do not leave
  // duplicate rows from a previous OCR attempt.
  const { error: preInsertDeleteError } = await dbClient
    .from("document_pages")
    .delete()
    .eq("document_id", document.id);

  if (preInsertDeleteError) {
    throw new DatalabOcrError(
      "Bestehende OCR-Seiten konnten nicht gelöscht werden.",
      "DB_DELETE_FAILED",
    );
  }

  if (ocrResult.pages.length > 0) {
    const pageInserts = ocrResult.pages.map((page) => ({
      document_id: document.id,
      page_number: page.page_number,
      ocr_markdown: page.ocr_markdown,
      layout_json: page.layout_json as Record<string, unknown> | null,
    }));

    const { error: pagesError } = await dbClient
      .from("document_pages")
      .insert(pageInserts);

    if (pagesError) {
      throw new DatalabOcrError(
        "OCR-Ergebnisse konnten nicht gespeichert werden.",
        "DB_INSERT_FAILED",
      );
    }
  }

  // 4. Update the document: status, page_count, ocr_text ---------------------
  const { error: updateError } = await dbClient
    .from("documents")
    .update({
      status: "ocr_done",
      page_count: ocrResult.page_count,
      ocr_text: ocrResult.full_markdown,
      error_message: null,
    })
    .eq("id", document.id);

  if (updateError) {
    // Clean up orphaned document_pages rows — the document status update
    // failed, so the pages would be orphaned. If the cleanup ALSO fails,
    // log it (data-integrity concern) but still throw the primary error.
    const { error: cleanupDeleteError } = await dbClient
      .from("document_pages")
      .delete()
      .eq("document_id", document.id);

    if (cleanupDeleteError) {
      console.error(
        `[OCR] Cleanup failed: could not delete orphaned document_pages for document ${document.id}:`,
        cleanupDeleteError,
      );
    }

    throw new DatalabOcrError(
      "Dokument-Status konnte nicht aktualisiert werden.",
      "DB_UPDATE_FAILED",
    );
  }

  return { page_count: ocrResult.page_count };
}
