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
