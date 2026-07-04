import { z } from "zod";

/**
 * Document-related schemas, constants, and helpers.
 *
 * Covers upload validation (file type + size), the document status state
 * machine labels (German), and badge-variant mapping for status display.
 */

// ---------------------------------------------------------------------------
// File upload constraints
// ---------------------------------------------------------------------------

/**
 * Accepted MIME types for document uploads.
 * Images (JPEG, PNG, WebP, GIF) and PDF only — per the feature requirements.
 */
export const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;

export type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number];

/**
 * Maximum upload file size: 25 MB.
 * Generous enough for multi-page PDFs and high-res photos, while staying
 * well within Supabase Storage limits.
 */
export const MAX_FILE_SIZE = 25 * 1024 * 1024;

/**
 * Human-readable max size label for German UI messages.
 */
export const MAX_FILE_SIZE_LABEL = "25 MB";

/**
 * File extensions accepted by the file picker inputs.
 * Used in the `accept` attribute of `<input type="file">`.
 */
export const ACCEPTED_FILE_EXTENSIONS = ".pdf,.jpg,.jpeg,.png,.webp,.gif";

/**
 * Image MIME types (subset of ACCEPTED_MIME_TYPES).
 * Used to distinguish camera-capture inputs (images only) from PDF upload.
 */
export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

// ---------------------------------------------------------------------------
// Document status state machine
// ---------------------------------------------------------------------------

/**
 * All possible document statuses in the processing pipeline.
 *
 * State machine:
 *   uploaded → ocr_processing → ocr_done → analyzing → analyzed → confirmed
 *                 ↓                              ↓
 *               failed                         failed
 */
export const DOCUMENT_STATUSES = [
  "uploaded",
  "ocr_processing",
  "ocr_done",
  "analyzing",
  "analyzed",
  "confirmed",
  "failed",
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/**
 * German labels for each document status.
 * Used in status badges on document cards.
 */
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  uploaded: "Hochgeladen",
  ocr_processing: "OCR läuft",
  ocr_done: "OCR fertig",
  analyzing: "Analyse läuft",
  analyzed: "Analysiert",
  confirmed: "Bestätigt",
  failed: "Fehlgeschlagen",
};

/**
 * Badge visual variant for each document status.
 * Maps to Tailwind class strings that use the warm design-system palette.
 *
 * - uploaded: neutral/muted (just stored, not yet processed)
 * - ocr_processing: blue-soft info (in progress)
 * - ocr_done: petrol (completed step)
 * - analyzing: blue-soft info (in progress)
 * - analyzed: apricot (needs user attention — review)
 * - confirmed: green (done, confirmed)
 * - failed: red/destructive (error state)
 */
export const STATUS_BADGE_CLASSES: Record<DocumentStatus, string> = {
  uploaded:
    "bg-[var(--sand-light)] text-[var(--mist-dark)] border-[var(--mist-light)]",
  ocr_processing:
    "bg-[var(--blue-soft)] text-[var(--petrol)] border-[var(--petrol)]/20",
  ocr_done:
    "bg-[var(--petrol)]/10 text-[var(--petrol)] border-[var(--petrol)]/20",
  analyzing:
    "bg-[var(--blue-soft)] text-[var(--petrol)] border-[var(--petrol)]/20",
  analyzed:
    "bg-[var(--apricot)]/10 text-[var(--apricot)] border-[var(--apricot)]/20",
  confirmed:
    "bg-[#E8F5E9] text-[#2E7D32] border-[#2E7D32]/20",
  failed:
    "bg-[var(--destructive)]/10 text-[var(--destructive)] border-[var(--destructive)]/20",
};

/**
 * Statuses that represent an active processing state and should show an
 * animation (spinner/shimmer) on the document card.
 */
export const PROCESSING_STATUSES: ReadonlySet<DocumentStatus> = new Set([
  "ocr_processing",
  "analyzing",
]);

/**
 * Check if a status is a processing state (should show animation).
 */
export function isProcessingStatus(status: string): boolean {
  return PROCESSING_STATUSES.has(status as DocumentStatus);
}

/**
 * Get the German label for a document status.
 * Falls back to the raw status string if unknown (defensive).
 */
export function getStatusLabel(status: string): string {
  return DOCUMENT_STATUS_LABELS[status as DocumentStatus] ?? status;
}

/**
 * Get the badge CSS classes for a document status.
 * Falls back to the "uploaded" (neutral) styling if unknown.
 */
export function getStatusBadgeClasses(status: string): string {
  return STATUS_BADGE_CLASSES[status as DocumentStatus] ?? STATUS_BADGE_CLASSES.uploaded;
}

// ---------------------------------------------------------------------------
// File validation helpers
// ---------------------------------------------------------------------------

/**
 * Result of a file validation check.
 */
export type FileValidationResult =
  | { valid: true; mimeType: string; fileSize: number }
  | { valid: false; error: string; code: string };

/**
 * Validate a file's type and size against the upload constraints.
 *
 * Returns a German error message and code when invalid, so the result can
 * be surfaced directly in the UI.
 *
 * @param mimeType - The file's MIME type (e.g. "application/pdf").
 * @param fileSize - The file's size in bytes.
 */
export function validateFile(
  mimeType: string,
  fileSize: number,
): FileValidationResult {
  // Check MIME type — accept images and PDF only.
  const acceptedMimes = ACCEPTED_MIME_TYPES as readonly string[];
  if (!acceptedMimes.includes(mimeType)) {
    return {
      valid: false,
      error: "Dieser Dateityp wird nicht unterstützt. Bitte ein Bild oder PDF hochladen.",
      code: "UNSUPPORTED_FILE_TYPE",
    };
  }

  // Check file size.
  if (fileSize > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `Die Datei ist zu groß. Maximum: ${MAX_FILE_SIZE_LABEL}.`,
      code: "FILE_TOO_LARGE",
    };
  }

  return { valid: true, mimeType, fileSize };
}

/**
 * Check if a MIME type is an accepted image type.
 */
export function isImageMimeType(mimeType: string): boolean {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Check if a MIME type is PDF.
 */
export function isPdfMimeType(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

// ---------------------------------------------------------------------------
// Upload API response types
// ---------------------------------------------------------------------------

/**
 * Successful upload API response.
 */
export type UploadSuccessResponse = {
  document_id: string;
  status: "uploaded";
};

/**
 * Error upload API response.
 */
export type UploadErrorResponse = {
  error: string;
  code: string;
};

// ---------------------------------------------------------------------------
// Zod schema for upload form data validation (server-side)
// ---------------------------------------------------------------------------

/**
 * Schema for validating the family_id field in the upload form data.
 * The file itself is validated separately (MIME type + size) since Zod
 * does not handle File objects natively in form data.
 */
export const uploadFamilyIdSchema = z.object({
  family_id: z
    .string()
    .uuid("Ungültige Familien-ID"),
});

export type UploadFamilyIdInput = z.infer<typeof uploadFamilyIdSchema>;

// ---------------------------------------------------------------------------
// State machine — valid transitions
// ---------------------------------------------------------------------------

/**
 * Valid status transitions in the document processing pipeline.
 *
 *   uploaded → ocr_processing → ocr_done → analyzing → analyzed → confirmed
 *                 ↓                              ↓
 *               failed                         failed
 *
 * `failed` can retry to its preceding processing state:
 *   failed → ocr_processing (retry OCR from uploaded-stage failure)
 *   failed → analyzing      (retry analysis from ocr-stage failure)
 */
const VALID_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  uploaded: new Set(["ocr_processing"]),
  ocr_processing: new Set(["ocr_done", "failed"]),
  ocr_done: new Set(["analyzing", "failed"]),
  analyzing: new Set(["analyzed", "failed"]),
  analyzed: new Set(["confirmed", "analyzing", "failed"]),
  confirmed: new Set(["analyzing"]), // re-analyze from confirmed
  failed: new Set(["ocr_processing", "analyzing"]), // retry from failed
};

/**
 * Check whether a status transition is valid per the state machine.
 *
 * @param from - The current document status.
 * @param to - The target status.
 * @returns true if the transition is allowed, false otherwise.
 */
export function isValidTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.has(to) : false;
}

/**
 * Statuses from which OCR can be (re-)triggered.
 * OCR starts from `uploaded` (initial run) or `failed` (retry after a
 * prior OCR failure).
 */
export const OCR_ALLOWED_SOURCE_STATUSES: ReadonlySet<string> = new Set([
  "uploaded",
  "failed",
]);

// ---------------------------------------------------------------------------
// OCR API response types
// ---------------------------------------------------------------------------

/**
 * Successful OCR API response.
 */
export type OcrSuccessResponse = {
  status: "ocr_done";
  page_count: number;
};

/**
 * Error OCR API response (same shape as upload errors).
 */
export type OcrErrorResponse = {
  error: string;
  code: string;
};
