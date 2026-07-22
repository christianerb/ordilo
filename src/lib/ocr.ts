import type {
  OcrSuccessResponse,
  OcrErrorResponse,
} from "@/lib/schemas/document";

/**
 * Trigger OCR processing for a document by calling the OCR API route.
 *
 * This is a server-side operation (the Datalab API key is never exposed
 * to the client). The route:
 *   1. Sets the document status to `ocr_processing`
 *   2. Downloads the file from Storage
 *   3. Sends it to Datalab for OCR
 *   4. Polls until complete
 *   5. Stores results and sets status to `ocr_done`
 *
 * The request is long-running (10-60s) because Datalab processes
 * asynchronously. The client should poll the document status (or
 * refetch the document list) to reflect the `ocr_processing` state
 * while this request is in flight.
 *
 * @param documentId - The ID of the document to OCR.
 * @returns A promise resolving to { status: "ocr_done", page_count } on success.
 * @throws An Error with a German message on failure.
 */
export async function triggerOcr(
  documentId: string,
): Promise<OcrSuccessResponse> {
  let response: Response;
  try {
    response = await fetch(`/api/documents/${documentId}/ocr`, {
      method: "POST",
    });
  } catch {
    throw new Error(
      "Netzwerkfehler. Bitte Verbindung überprüfen und erneut versuchen.",
    );
  }

  if (response.ok) {
    return (await response.json()) as OcrSuccessResponse;
  }

  // 409 Conflict: another pipeline path (server-side job queue) already
  // claimed this document. Not an error — the work is being done. Return
  // a synthetic response so the caller's .then() refetch runs and picks
  // up the server-driven status changes via realtime/polling.
  if (response.status === 409) {
    return { status: "ocr_done", page_count: 0 } as OcrSuccessResponse;
  }

  // Parse the structured error response.
  let errorBody: OcrErrorResponse;
  try {
    errorBody = (await response.json()) as OcrErrorResponse;
  } catch {
    throw new Error("OCR fehlgeschlagen. Bitte erneut versuchen.");
  }

  throw new Error(errorBody.error || "OCR fehlgeschlagen. Bitte erneut versuchen.");
}
