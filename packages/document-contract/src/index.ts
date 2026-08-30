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
