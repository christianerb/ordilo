import type { UploadErrorResponse } from "@/lib/schemas/document";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/schemas/extraction";

/**
 * Success response from POST /api/documents/notes.
 */
type NoteSuccessResponse = {
  document_id: string;
  status: "ocr_done";
};

/**
 * Create a manual note document via POST /api/documents/notes.
 *
 * Sends multipart form data with title, content (markdown), document_type,
 * family_id, and an optional image attachment. The server creates the
 * document with status "ocr_done" so the analysis pipeline can pick it
 * up immediately.
 *
 * @param params.title       The note title.
 * @param params.content     Markdown text body.
 * @param params.documentType  Document type enum value.
 * @param params.familyId    The family ID.
 * @param params.file        Optional image attachment (File or null).
 * @returns Promise resolving to { document_id, status } on success.
 * @throws Error with a German message on failure.
 */
export async function createNote({
  title,
  content,
  documentType,
  familyId,
  category,
  file,
}: {
  title: string;
  content: string;
  documentType: DocumentType;
  familyId: string;
  /**
   * Optional collection name to file the note into. Stored as the
   * document's category (collections are backed by documents.category) and
   * preserved by the analyze step, so the note appears in that collection.
   */
  category?: string;
  file?: File | null;
}): Promise<NoteSuccessResponse> {
  const formData = new FormData();
  formData.append("title", title);
  formData.append("content", content);
  formData.append("document_type", documentType);
  formData.append("family_id", familyId);
  if (category) {
    formData.append("category", category);
  }
  if (file) {
    formData.append("file", file);
  }

  let response: Response;
  try {
    response = await fetch("/api/documents/notes", {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new Error("Netzwerkfehler. Bitte Verbindung überprüfen und erneut versuchen.");
  }

  if (response.ok) {
    return (await response.json()) as NoteSuccessResponse;
  }

  let errorBody: UploadErrorResponse;
  try {
    errorBody = (await response.json()) as UploadErrorResponse;
  } catch {
    throw new Error("Notiz konnte nicht gespeichert werden. Bitte erneut versuchen.");
  }
  throw new Error(errorBody.error || "Notiz konnte nicht gespeichert werden. Bitte erneut versuchen.");
}

export { DOCUMENT_TYPES, type DocumentType };
