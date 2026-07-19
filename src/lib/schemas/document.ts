import { z } from "zod";
import { FileText, ImageIcon, type LucideIcon } from "lucide-react";

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
  uploaded: "Eingegangen",
  ocr_processing: "Wird gelesen",
  ocr_done: "Gelesen",
  analyzing: "Wird verstanden",
  analyzed: "Bereit zum Durchsehen",
  confirmed: "Im Familienbuch",
  failed: "Hat nicht geklappt",
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
 * The three user-facing pipeline stages shown while a document is
 * captured, read, and understood — shared between the full-screen scan
 * wizard and the compact ReviewCard processing state so both narrate the
 * same real progress with the same German labels.
 */
export const PIPELINE_STEPS = [
  { key: "upload", label: "Foto wird hochgeladen" },
  { key: "ocr", label: "Text wird erkannt" },
  { key: "analysis", label: "Inhalt wird verstanden" },
] as const;

/**
 * How many of the three pipeline steps are complete for a given document
 * status — never a fabricated/decorative progress value, always derived
 * from the real, persisted status.
 */
export function getPipelineStepsCompleted(status: string): number {
  switch (status as DocumentStatus) {
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

// ---------------------------------------------------------------------------
// Magic-byte (file-signature) validation
// ---------------------------------------------------------------------------

/**
 * A file-signature definition: expected byte values at offset 0.
 * A value of -1 means "wildcard" (any byte matches at that position).
 */
interface FileSignature {
  bytes: number[];
}

/**
 * Magic-byte signatures for each accepted file type.
 *
 * These are lightweight file-signature checks that complement the MIME
 * type validation. Instead of trusting `File.type` alone (which is set
 * by the browser and can be spoofed or incorrect), we read the first few
 * bytes of the file and verify they match the expected magic bytes for
 * the claimed format.
 *
 * Signatures:
 * - PDF:  `%PDF` (0x25 0x50 0x44 0x46)
 * - JPEG: `FF D8 FF`
 * - PNG:  `89 50 4E 47 0D 0A 1A 0A`
 * - GIF:  `GIF8` (0x47 0x49 0x46 0x38)
 * - WebP: `RIFF` + 4 size bytes (wildcard) + `WEBP`
 */
const FILE_SIGNATURES: Record<AcceptedMimeType, FileSignature> = {
  "application/pdf": { bytes: [0x25, 0x50, 0x44, 0x46] },
  "image/jpeg": { bytes: [0xff, 0xd8, 0xff] },
  "image/png": { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  "image/gif": { bytes: [0x47, 0x49, 0x46, 0x38] },
  "image/webp": {
    bytes: [0x52, 0x49, 0x46, 0x46, -1, -1, -1, -1, 0x57, 0x45, 0x42, 0x50],
  },
};

/**
 * Check if a byte array matches a file signature.
 *
 * Wildcard bytes (-1 in the signature) match any value.
 *
 * @param bytes - The file's leading bytes.
 * @param sig - The file signature to check against.
 * @returns true if the bytes match the signature.
 */
function matchesSignature(bytes: Uint8Array, sig: FileSignature): boolean {
  if (bytes.length < sig.bytes.length) return false;
  for (let i = 0; i < sig.bytes.length; i++) {
    if (sig.bytes[i] !== -1 && bytes[i] !== sig.bytes[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Detect the MIME type of a file from its leading bytes (magic bytes).
 *
 * Checks the file's first bytes against known signatures for PDF, JPEG,
 * PNG, GIF, and WebP. Returns the detected MIME type or null if no
 * known signature matches.
 *
 * @param bytes - The file's leading bytes (at least 12 bytes recommended).
 * @returns The detected MIME type, or null if no signature matches.
 */
export function detectMimeTypeFromBytes(
  bytes: Uint8Array,
): AcceptedMimeType | null {
  for (const mimeType of ACCEPTED_MIME_TYPES) {
    const sig = FILE_SIGNATURES[mimeType];
    if (matchesSignature(bytes, sig)) {
      return mimeType;
    }
  }
  return null;
}

/**
 * Validate that a file's leading bytes match the expected magic bytes
 * for the claimed MIME type.
 *
 * @param mimeType - The claimed MIME type (e.g. from `File.type`).
 * @param bytes - The file's leading bytes.
 * @returns true if the bytes match the signature for the MIME type.
 */
export function validateFileSignature(
  mimeType: string,
  bytes: Uint8Array,
): boolean {
  const sig = FILE_SIGNATURES[mimeType as AcceptedMimeType];
  if (!sig) return false;
  return matchesSignature(bytes, sig);
}

/**
 * Validate a file's type, size, AND magic-byte signature.
 *
 * This is the comprehensive validation function for file uploads. It
 * performs three checks in order:
 *   1. MIME type is in the accepted list (images + PDF)
 *   2. File size is within the maximum limit
 *   3. The file's leading bytes match the expected magic bytes for the
 *      claimed MIME type (prevents content-type spoofing)
 *
 * Returns a German error message and code when invalid, so the result can
 * be surfaced directly in the UI.
 *
 * @param mimeType - The file's MIME type (e.g. from `File.type`).
 * @param fileSize - The file's size in bytes.
 * @param bytes - The file's leading bytes (for magic-byte validation).
 */
export function validateFileWithSignature(
  mimeType: string,
  fileSize: number,
  bytes: Uint8Array,
): FileValidationResult {
  // 1. Check MIME type and size (existing logic).
  const baseResult = validateFile(mimeType, fileSize);
  if (!baseResult.valid) return baseResult;

  // 2. Check magic-byte signature.
  if (!validateFileSignature(mimeType, bytes)) {
    return {
      valid: false,
      error: "Der Dateiinhalt stimmt nicht mit dem angegebenen Dateityp überein.",
      code: "FILE_SIGNATURE_MISMATCH",
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

/**
 * Get the appropriate file icon component for a given MIME type.
 *
 * Returns the Lucide icon component to render for a document based on its
 * MIME type: `ImageIcon` for image types, `FileText` for everything else
 * (including PDF).
 *
 * @param mimeType - A MIME type string, or null/undefined.
 * @returns A Lucide icon component.
 */
export function getFileIcon(mimeType: string | null | undefined): LucideIcon {
  if (mimeType && isImageMimeType(mimeType)) return ImageIcon;
  return FileText;
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
// Failed-stage derivation (retry routing)
// ---------------------------------------------------------------------------

/**
 * The pipeline stage at which a document failed.
 *
 * The document status machine uses a single generic `failed` status for
 * both OCR-stage and analysis-stage failures (see AGENTS.md). To route
 * retries correctly, the UI must know which stage failed:
 *   - `"ocr"` → retry via the OCR endpoint (`POST /api/documents/[id]/ocr`)
 *   - `"analysis"` → retry via the analyze endpoint
 *     (`POST /api/documents/[id]/analyze`)
 */
export type FailedStage = "ocr" | "analysis" | "confirmation";

/**
 * Derive the failing pipeline stage from the document's persisted state.
 *
 * A document that never produced OCR text (no `ocr_text` and no
 * `page_count`) failed at the OCR stage. A document that did produce OCR
 * text (OCR completed) but is now `failed` must have failed at the
 * analysis stage.
 *
 * This derivation is robust because the OCR route only stores `ocr_text`
 * and `page_count` on success (after Datalab returns `complete`). If
 * Datalab fails, those fields remain null, so the failure is correctly
 * attributed to the OCR stage.
 *
 * @param doc - A document row (or partial) with `ocr_text` and
 *              `page_count` fields.
 * @returns `"ocr"` if the failure occurred before OCR completed,
 *          `"analysis"` if OCR completed but the document later failed.
 */
export function getFailedStage(doc: {
  ocr_text?: string | null;
  page_count?: number | null;
  failure_stage?: string | null;
}): FailedStage {
  if (doc.failure_stage === "ocr") return "ocr";
  if (doc.failure_stage === "analysis") return "analysis";
  if (
    doc.failure_stage === "confirmation" ||
    doc.failure_stage === "embedding"
  ) {
    return "confirmation";
  }

  // OCR completed if there is any non-empty OCR text.
  if (doc.ocr_text && doc.ocr_text.trim().length > 0) {
    return "analysis";
  }
  // Fall back to page_count: OCR stores page_count on success.
  if (doc.page_count && doc.page_count > 0) {
    return "analysis";
  }
  return "ocr";
}

export function getFailedStageCopy(
  stage: FailedStage | string | null | undefined,
): string {
  switch (stage) {
    case "ocr":
      return "Das Dokument konnte nicht gelesen werden.";
    case "analysis":
      return "Der Inhalt konnte nicht ausgewertet werden.";
    case "confirmation":
    case "embedding":
      return "Das Dokument konnte nicht gespeichert werden.";
    default:
      return `${FAILED_CARD_COPY}.`;
  }
}

/**
 * Friendly German copy shown on the collapsed DocumentCard row for any
 * failed document.
 *
 * The raw backend/provider error (e.g. "OpenAI: API-Fehler",
 * "Could not parse PDF") is never surfaced to the user. This constant
 * ensures the same friendly German failed-state copy is rendered on the
 * collapsed document row as on the expanded ReviewCard
 * (VAL-REVIEW-014).
 */
export const FAILED_CARD_COPY = "Das hat nicht geklappt";

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

/**
 * Statuses from which the LLM analysis can be (re-)triggered.
 * Analysis starts from `ocr_done` (initial run), `analyzed` (re-analyze),
 * `confirmed` (re-analyze after confirmation), or `failed` (retry after a
 * prior analysis failure).
 */
export const ANALYZE_ALLOWED_SOURCE_STATUSES: ReadonlySet<string> = new Set([
  "ocr_done",
  "analyzed",
  "confirmed",
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
