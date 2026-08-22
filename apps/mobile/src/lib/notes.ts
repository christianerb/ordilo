import { apiFetch } from "./api";
import type { DocumentType, ReviewAnalysis } from "./document-review";

export type NoteAttachment = {
  uri: string;
  name: string;
  mimeType: string;
};

export type CreateNoteInput = {
  title: string;
  content: string;
  documentType: DocumentType;
  familyId: string;
  secret?: string;
  attachment?: NoteAttachment | null;
};

export type CreateNoteResponse = {
  document_id: string;
  status: "confirmed";
  server_pipeline: boolean;
};

export type DocumentUpdatePayload = Pick<
  ReviewAnalysis,
  | "document_type"
  | "title"
  | "summary"
  | "family_members"
  | "organizations"
  | "contacts"
  | "dates"
  | "amounts"
  | "suggested_category"
  | "tags"
>;

/**
 * Keeps credentials readable as a note while leaving the password out of
 * document text. The secret travels separately to the encrypted API field.
 */
export function buildCredentialsContent({
  title,
  url,
  username,
  description,
}: {
  title: string;
  url: string;
  username: string;
  description: string;
}): string {
  const fields = [
    `# ${title}`,
    url ? `- **URL:** ${url}` : "",
    username ? `- **Benutzername:** ${username}` : "",
    description,
  ].filter(Boolean);
  return fields.join("\n\n");
}

/**
 * The note body always comes from the RLS-scoped OCR text. Credential text
 * is a separate display value for credential metadata and must never replace
 * a normal note's user-entered content.
 */
export function getNoteContent(
  note: Pick<ReviewAnalysis, "ocr_text" | "credential_text">,
): string {
  return note.ocr_text?.trim() || "Diese Notiz hat keinen Text.";
}

/**
 * Sends the documented multipart note contract. React Native accepts the
 * URI descriptor as a FormData part at runtime; its DOM type does not.
 */
export async function createNote(input: CreateNoteInput): Promise<CreateNoteResponse> {
  const formData = new FormData();
  formData.append("title", input.title.trim());
  formData.append("content", input.content.trim());
  formData.append("document_type", input.documentType);
  formData.append("family_id", input.familyId);
  if (input.secret) formData.append("secret", input.secret);
  if (input.attachment) {
    formData.append(
      "file",
      {
        uri: input.attachment.uri,
        name: input.attachment.name,
        type: input.attachment.mimeType,
      } as unknown as Blob,
    );
  }

  const response = await apiFetch("/api/documents/notes", {
    method: "POST",
    body: formData,
  });
  return (await response.json()) as CreateNoteResponse;
}

/**
 * The existing protected PATCH route edits confirmed document metadata.
 * It intentionally cannot change note body text, attachments, or secrets.
 */
export async function updateConfirmedNote(
  documentId: string,
  payload: DocumentUpdatePayload,
): Promise<void> {
  await apiFetch(`/api/documents/${documentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function buildNoteUpdatePayload(
  note: ReviewAnalysis,
  changes: Pick<ReviewAnalysis, "title" | "summary" | "document_type">,
): DocumentUpdatePayload {
  return {
    document_type: changes.document_type,
    title: changes.title.trim(),
    summary: changes.summary.trim(),
    family_members: note.family_members,
    organizations: note.organizations,
    contacts: note.contacts,
    dates: note.dates,
    amounts: note.amounts,
    suggested_category: note.suggested_category,
    tags: note.tags,
  };
}
