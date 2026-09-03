/**
 * Pure document-intake contract shared by web and native clients.
 *
 * Keep this package free of React, Next.js and native dependencies so every
 * platform validates against the exact same transport limits and MIME list.
 */
export const ACCEPTED_DOCUMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;

export type AcceptedDocumentMimeType =
  (typeof ACCEPTED_DOCUMENT_MIME_TYPES)[number];

export const MAX_DOCUMENT_FILE_SIZE = 4 * 1024 * 1024;
export const MAX_DOCUMENT_FILE_SIZE_LABEL = "4 MB";

export const DOCUMENT_PIPELINE_STATUSES = [
  "uploaded",
  "ocr_processing",
  "ocr_done",
  "analyzing",
  "analyzed",
  "confirmed",
  "failed",
] as const;

export type DocumentPipelineStatus =
  (typeof DOCUMENT_PIPELINE_STATUSES)[number];

export const DOCUMENT_PIPELINE_STEPS = [
  { key: "upload", label: "Dokument wird hochgeladen" },
  { key: "ocr", label: "Text wird erkannt" },
  { key: "analysis", label: "Inhalt wird verstanden" },
] as const;

export function getDocumentPipelineStepsCompleted(status: string): number {
  switch (status as DocumentPipelineStatus) {
    case "uploaded":
    case "ocr_processing":
      return 1;
    case "ocr_done":
    case "analyzing":
      return 2;
    case "analyzed":
    case "confirmed":
      return 3;
    default:
      return 0;
  }
}

/**
 * Builds the canonical text body for a credentials note.
 *
 * Web, native and chat all use this exact layout so the same login never
 * produces different previews depending on where it was created.
 */
export function buildCredentialsContent({
  title,
  url,
  username,
  description,
}: {
  title: string;
  url?: string;
  username?: string;
  description?: string;
}): string {
  const fields: string[] = [];
  if (url?.trim()) fields.push(`- **URL:** ${url.trim()}`);
  if (username?.trim()) {
    fields.push(`- **Benutzername:** ${username.trim()}`);
  }

  const body = [fields.join("\n"), description?.trim() ?? ""]
    .filter(Boolean)
    .join("\n\n");
  return body || `Zugangsdaten ${title.trim()}`;
}

/**
 * Turns confirmed note text into a compact, deterministic list preview.
 *
 * It only removes lightweight Markdown presentation. It never summarizes,
 * classifies or guesses what a value means.
 */
export function getManualNotePreview(
  content: string | null | undefined,
  title?: string | null,
): string | null {
  if (!content?.trim()) return null;

  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const normalizedTitle = title?.trim().toLocaleLowerCase("de");

  const previewParts = lines
    .map((line, index) => {
      const heading = line.replace(/^#{1,6}\s+/, "").trim();
      if (
        index === 0 &&
        normalizedTitle &&
        heading.toLocaleLowerCase("de") === normalizedTitle
      ) {
        return "";
      }
      return heading
        .replace(/^[-*]\s+/, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/`/g, "")
        .replace(/\s+/g, " ")
        .trim();
    })
    .filter(Boolean);

  const preview = previewParts.join(" · ") || title?.trim() || "";
  if (!preview) return null;
  return preview.length > 240 ? `${preview.slice(0, 239)}…` : preview;
}
