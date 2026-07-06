import { describe, it, expect } from "vitest";
import {
  ACCEPTED_MIME_TYPES,
  MAX_FILE_SIZE,
  MAX_FILE_SIZE_LABEL,
  ACCEPTED_FILE_EXTENSIONS,
  IMAGE_MIME_TYPES,
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  STATUS_BADGE_CLASSES,
  PROCESSING_STATUSES,
  isProcessingStatus,
  getStatusLabel,
  getStatusBadgeClasses,
  validateFile,
  validateFileWithSignature,
  detectMimeTypeFromBytes,
  validateFileSignature,
  isImageMimeType,
  isPdfMimeType,
  uploadFamilyIdSchema,
  isValidTransition,
  OCR_ALLOWED_SOURCE_STATUSES,
} from "@/lib/schemas/document";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("upload constants", () => {
  it("ACCEPTED_MIME_TYPES includes images and PDF", () => {
    expect(ACCEPTED_MIME_TYPES).toContain("image/jpeg");
    expect(ACCEPTED_MIME_TYPES).toContain("image/png");
    expect(ACCEPTED_MIME_TYPES).toContain("image/webp");
    expect(ACCEPTED_MIME_TYPES).toContain("image/gif");
    expect(ACCEPTED_MIME_TYPES).toContain("application/pdf");
  });

  it("MAX_FILE_SIZE is 25 MB", () => {
    expect(MAX_FILE_SIZE).toBe(25 * 1024 * 1024);
  });

  it("MAX_FILE_SIZE_LABEL is a human-readable German label", () => {
    expect(MAX_FILE_SIZE_LABEL).toBe("25 MB");
  });

  it("ACCEPTED_FILE_EXTENSIONS includes pdf and image extensions", () => {
    expect(ACCEPTED_FILE_EXTENSIONS).toContain(".pdf");
    expect(ACCEPTED_FILE_EXTENSIONS).toContain(".jpg");
    expect(ACCEPTED_FILE_EXTENSIONS).toContain(".png");
  });

  it("IMAGE_MIME_TYPES does not include PDF", () => {
    expect(IMAGE_MIME_TYPES).not.toContain("application/pdf");
  });
});

// ---------------------------------------------------------------------------
// Document status labels and badges
// ---------------------------------------------------------------------------

describe("DOCUMENT_STATUSES", () => {
  it("includes all 7 pipeline statuses", () => {
    expect(DOCUMENT_STATUSES).toHaveLength(7);
    expect(DOCUMENT_STATUSES).toContain("uploaded");
    expect(DOCUMENT_STATUSES).toContain("ocr_processing");
    expect(DOCUMENT_STATUSES).toContain("ocr_done");
    expect(DOCUMENT_STATUSES).toContain("analyzing");
    expect(DOCUMENT_STATUSES).toContain("analyzed");
    expect(DOCUMENT_STATUSES).toContain("confirmed");
    expect(DOCUMENT_STATUSES).toContain("failed");
  });
});

describe("DOCUMENT_STATUS_LABELS", () => {
  it("provides a German label for every status", () => {
    for (const status of DOCUMENT_STATUSES) {
      const label = DOCUMENT_STATUS_LABELS[status];
      expect(label).toBeTruthy();
      expect(typeof label).toBe("string");
      // No English labels should slip through.
      expect(label).not.toBe(status);
    }
  });

  it("uses the expected German labels", () => {
    expect(DOCUMENT_STATUS_LABELS.uploaded).toBe("Hochgeladen");
    expect(DOCUMENT_STATUS_LABELS.ocr_processing).toBe("OCR läuft");
    expect(DOCUMENT_STATUS_LABELS.ocr_done).toBe("OCR fertig");
    expect(DOCUMENT_STATUS_LABELS.analyzing).toBe("Analyse läuft");
    expect(DOCUMENT_STATUS_LABELS.analyzed).toBe("Analysiert");
    expect(DOCUMENT_STATUS_LABELS.confirmed).toBe("Bestätigt");
    expect(DOCUMENT_STATUS_LABELS.failed).toBe("Fehlgeschlagen");
  });
});

describe("STATUS_BADGE_CLASSES", () => {
  it("provides CSS classes for every status", () => {
    for (const status of DOCUMENT_STATUSES) {
      expect(STATUS_BADGE_CLASSES[status]).toBeTruthy();
      expect(typeof STATUS_BADGE_CLASSES[status]).toBe("string");
    }
  });

  it("failed status uses destructive styling", () => {
    expect(STATUS_BADGE_CLASSES.failed).toContain("destructive");
  });
});

describe("PROCESSING_STATUSES", () => {
  it("includes ocr_processing and analyzing", () => {
    expect(PROCESSING_STATUSES.has("ocr_processing")).toBe(true);
    expect(PROCESSING_STATUSES.has("analyzing")).toBe(true);
  });

  it("does not include terminal statuses", () => {
    expect(PROCESSING_STATUSES.has("uploaded")).toBe(false);
    expect(PROCESSING_STATUSES.has("confirmed")).toBe(false);
    expect(PROCESSING_STATUSES.has("failed")).toBe(false);
    expect(PROCESSING_STATUSES.has("ocr_done")).toBe(false);
    expect(PROCESSING_STATUSES.has("analyzed")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

describe("isProcessingStatus", () => {
  it("returns true for ocr_processing", () => {
    expect(isProcessingStatus("ocr_processing")).toBe(true);
  });

  it("returns true for analyzing", () => {
    expect(isProcessingStatus("analyzing")).toBe(true);
  });

  it("returns false for uploaded", () => {
    expect(isProcessingStatus("uploaded")).toBe(false);
  });

  it("returns false for confirmed", () => {
    expect(isProcessingStatus("confirmed")).toBe(false);
  });

  it("returns false for unknown status", () => {
    expect(isProcessingStatus("unknown")).toBe(false);
  });
});

describe("getStatusLabel", () => {
  it("returns the German label for known statuses", () => {
    expect(getStatusLabel("uploaded")).toBe("Hochgeladen");
    expect(getStatusLabel("failed")).toBe("Fehlgeschlagen");
  });

  it("returns the raw status for unknown values", () => {
    expect(getStatusLabel("unknown")).toBe("unknown");
  });
});

describe("getStatusBadgeClasses", () => {
  it("returns badge classes for known statuses", () => {
    expect(getStatusBadgeClasses("uploaded")).toBe(STATUS_BADGE_CLASSES.uploaded);
    expect(getStatusBadgeClasses("failed")).toBe(STATUS_BADGE_CLASSES.failed);
  });

  it("falls back to uploaded classes for unknown statuses", () => {
    expect(getStatusBadgeClasses("unknown")).toBe(STATUS_BADGE_CLASSES.uploaded);
  });
});

describe("isImageMimeType", () => {
  it("returns true for image types", () => {
    expect(isImageMimeType("image/jpeg")).toBe(true);
    expect(isImageMimeType("image/png")).toBe(true);
    expect(isImageMimeType("image/webp")).toBe(true);
    expect(isImageMimeType("image/gif")).toBe(true);
  });

  it("returns false for PDF", () => {
    expect(isImageMimeType("application/pdf")).toBe(false);
  });

  it("returns false for non-image types", () => {
    expect(isImageMimeType("text/plain")).toBe(false);
    expect(isImageMimeType("video/mp4")).toBe(false);
  });
});

describe("isPdfMimeType", () => {
  it("returns true for PDF", () => {
    expect(isPdfMimeType("application/pdf")).toBe(true);
  });

  it("returns false for image types", () => {
    expect(isPdfMimeType("image/jpeg")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateFile
// ---------------------------------------------------------------------------

describe("validateFile", () => {
  it("accepts a valid JPEG image within size limit", () => {
    const result = validateFile("image/jpeg", 1024 * 1024);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.mimeType).toBe("image/jpeg");
      expect(result.fileSize).toBe(1024 * 1024);
    }
  });

  it("accepts a valid PNG image within size limit", () => {
    const result = validateFile("image/png", 500 * 1024);
    expect(result.valid).toBe(true);
  });

  it("accepts a valid PDF within size limit", () => {
    const result = validateFile("application/pdf", 10 * 1024 * 1024);
    expect(result.valid).toBe(true);
  });

  it("accepts a WebP image", () => {
    const result = validateFile("image/webp", 1024);
    expect(result.valid).toBe(true);
  });

  it("accepts a GIF image", () => {
    const result = validateFile("image/gif", 1024);
    expect(result.valid).toBe(true);
  });

  it("accepts a file exactly at the size limit", () => {
    const result = validateFile("application/pdf", MAX_FILE_SIZE);
    expect(result.valid).toBe(true);
  });

  // --- Unsupported file types ---

  it("rejects text/plain with German error and UNSUPPORTED_FILE_TYPE code", () => {
    const result = validateFile("text/plain", 1024);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("UNSUPPORTED_FILE_TYPE");
      expect(result.error).toContain("nicht unterstützt");
    }
  });

  it("rejects video/mp4 with German error", () => {
    const result = validateFile("video/mp4", 1024);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("UNSUPPORTED_FILE_TYPE");
    }
  });

  it("rejects application/octet-stream", () => {
    const result = validateFile("application/octet-stream", 1024);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("UNSUPPORTED_FILE_TYPE");
    }
  });

  it("rejects an executable file", () => {
    const result = validateFile("application/x-msdownload", 1024);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("UNSUPPORTED_FILE_TYPE");
    }
  });

  // --- Oversized files ---

  it("rejects a file larger than max size with German error and FILE_TOO_LARGE code", () => {
    const result = validateFile("application/pdf", MAX_FILE_SIZE + 1);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("FILE_TOO_LARGE");
      expect(result.error).toContain("zu groß");
      expect(result.error).toContain(MAX_FILE_SIZE_LABEL);
    }
  });

  it("rejects an oversized image with FILE_TOO_LARGE", () => {
    const result = validateFile("image/jpeg", MAX_FILE_SIZE + 1024);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("FILE_TOO_LARGE");
    }
  });
});

// ---------------------------------------------------------------------------
// uploadFamilyIdSchema
// ---------------------------------------------------------------------------

describe("uploadFamilyIdSchema", () => {
  it("accepts a valid UUID", () => {
    const result = uploadFamilyIdSchema.safeParse({
      family_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID string", () => {
    const result = uploadFamilyIdSchema.safeParse({
      family_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty family_id", () => {
    const result = uploadFamilyIdSchema.safeParse({
      family_id: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing family_id", () => {
    const result = uploadFamilyIdSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// State machine — isValidTransition
// ---------------------------------------------------------------------------

describe("isValidTransition", () => {
  it("allows uploaded → ocr_processing", () => {
    expect(isValidTransition("uploaded", "ocr_processing")).toBe(true);
  });

  it("allows ocr_processing → ocr_done", () => {
    expect(isValidTransition("ocr_processing", "ocr_done")).toBe(true);
  });

  it("allows ocr_processing → failed", () => {
    expect(isValidTransition("ocr_processing", "failed")).toBe(true);
  });

  it("allows ocr_done → analyzing", () => {
    expect(isValidTransition("ocr_done", "analyzing")).toBe(true);
  });

  it("allows analyzing → analyzed", () => {
    expect(isValidTransition("analyzing", "analyzed")).toBe(true);
  });

  it("allows analyzed → confirmed", () => {
    expect(isValidTransition("analyzed", "confirmed")).toBe(true);
  });

  it("allows failed → ocr_processing (retry OCR)", () => {
    expect(isValidTransition("failed", "ocr_processing")).toBe(true);
  });

  it("allows failed → analyzing (retry analysis)", () => {
    expect(isValidTransition("failed", "analyzing")).toBe(true);
  });

  // --- Invalid transitions ---

  it("rejects uploaded → ocr_done (skipping ocr_processing)", () => {
    expect(isValidTransition("uploaded", "ocr_done")).toBe(false);
  });

  it("rejects uploaded → confirmed (skipping entire pipeline)", () => {
    expect(isValidTransition("uploaded", "confirmed")).toBe(false);
  });

  it("rejects ocr_done → ocr_processing (going backwards)", () => {
    expect(isValidTransition("ocr_done", "ocr_processing")).toBe(false);
  });

  it("rejects confirmed → uploaded (going backwards)", () => {
    expect(isValidTransition("confirmed", "uploaded")).toBe(false);
  });

  it("rejects confirmed → ocr_processing (cannot re-run OCR from confirmed)", () => {
    expect(isValidTransition("confirmed", "ocr_processing")).toBe(false);
  });

  it("rejects uploaded → uploaded (self-transition)", () => {
    expect(isValidTransition("uploaded", "uploaded")).toBe(false);
  });

  it("rejects unknown source status", () => {
    expect(isValidTransition("unknown", "ocr_processing")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OCR_ALLOWED_SOURCE_STATUSES
// ---------------------------------------------------------------------------

describe("OCR_ALLOWED_SOURCE_STATUSES", () => {
  it("includes uploaded (initial OCR run)", () => {
    expect(OCR_ALLOWED_SOURCE_STATUSES.has("uploaded")).toBe(true);
  });

  it("includes failed (retry after OCR failure)", () => {
    expect(OCR_ALLOWED_SOURCE_STATUSES.has("failed")).toBe(true);
  });

  it("does not include ocr_processing (already processing)", () => {
    expect(OCR_ALLOWED_SOURCE_STATUSES.has("ocr_processing")).toBe(false);
  });

  it("does not include ocr_done (already OCR'd)", () => {
    expect(OCR_ALLOWED_SOURCE_STATUSES.has("ocr_done")).toBe(false);
  });

  it("does not include confirmed", () => {
    expect(OCR_ALLOWED_SOURCE_STATUSES.has("confirmed")).toBe(false);
  });

  it("does not include analyzed", () => {
    expect(OCR_ALLOWED_SOURCE_STATUSES.has("analyzed")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Magic-byte / file-signature validation
// ---------------------------------------------------------------------------

/** Build a Uint8Array from a list of byte values. */
function bytes(...vals: number[]): Uint8Array {
  return new Uint8Array(vals);
}

describe("detectMimeTypeFromBytes", () => {
  it("detects PDF from %PDF header", () => {
    const result = detectMimeTypeFromBytes(bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34));
    expect(result).toBe("application/pdf");
  });

  it("detects JPEG from FF D8 FF header", () => {
    const result = detectMimeTypeFromBytes(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10));
    expect(result).toBe("image/jpeg");
  });

  it("detects PNG from 89 50 4E 47 header", () => {
    const result = detectMimeTypeFromBytes(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00));
    expect(result).toBe("image/png");
  });

  it("detects GIF from GIF8 header", () => {
    const result = detectMimeTypeFromBytes(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61));
    expect(result).toBe("image/gif");
  });

  it("detects WebP from RIFF????WEBP header", () => {
    // RIFF + 4 size bytes (any) + WEBP
    const result = detectMimeTypeFromBytes(bytes(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x10, 0x00, 0x57, 0x45, 0x42, 0x50));
    expect(result).toBe("image/webp");
  });

  it("returns null for unknown file content (text)", () => {
    const result = detectMimeTypeFromBytes(bytes(0x68, 0x65, 0x6c, 0x6c, 0x6f)); // "hello"
    expect(result).toBeNull();
  });

  it("returns null for empty bytes", () => {
    expect(detectMimeTypeFromBytes(new Uint8Array(0))).toBeNull();
  });

  it("returns null for too-short bytes", () => {
    // Only 2 bytes — not enough for any signature
    expect(detectMimeTypeFromBytes(bytes(0x25, 0x50))).toBeNull();
  });

  it("returns null for executable content", () => {
    // MZ header (Windows executable)
    expect(detectMimeTypeFromBytes(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull();
  });
});

describe("validateFileSignature", () => {
  it("returns true when PDF bytes match PDF MIME type", () => {
    expect(validateFileSignature("application/pdf", bytes(0x25, 0x50, 0x44, 0x46))).toBe(true);
  });

  it("returns true when JPEG bytes match JPEG MIME type", () => {
    expect(validateFileSignature("image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
  });

  it("returns true when PNG bytes match PNG MIME type", () => {
    expect(validateFileSignature("image/png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true);
  });

  it("returns true when WebP bytes match WebP MIME type (wildcards ignored)", () => {
    expect(validateFileSignature("image/webp", bytes(0x52, 0x49, 0x46, 0x46, 0xaa, 0xbb, 0xcc, 0xdd, 0x57, 0x45, 0x42, 0x50))).toBe(true);
  });

  it("returns false when text content is claimed as PDF", () => {
    expect(validateFileSignature("application/pdf", bytes(0x68, 0x65, 0x6c, 0x6c, 0x6f))).toBe(false);
  });

  it("returns false when JPEG content is claimed as PDF", () => {
    expect(validateFileSignature("application/pdf", bytes(0xff, 0xd8, 0xff))).toBe(false);
  });

  it("returns false when PDF content is claimed as JPEG", () => {
    expect(validateFileSignature("image/jpeg", bytes(0x25, 0x50, 0x44, 0x46))).toBe(false);
  });

  it("returns false for unsupported MIME type", () => {
    expect(validateFileSignature("text/plain", bytes(0x68, 0x65, 0x6c, 0x6c, 0x6f))).toBe(false);
  });

  it("returns false for empty bytes", () => {
    expect(validateFileSignature("application/pdf", new Uint8Array(0))).toBe(false);
  });
});

describe("validateFileWithSignature", () => {
  it("accepts a valid PDF with correct magic bytes", () => {
    const result = validateFileWithSignature("application/pdf", 1024, bytes(0x25, 0x50, 0x44, 0x46));
    expect(result.valid).toBe(true);
  });

  it("accepts a valid JPEG with correct magic bytes", () => {
    const result = validateFileWithSignature("image/jpeg", 1024, bytes(0xff, 0xd8, 0xff, 0xe0));
    expect(result.valid).toBe(true);
  });

  it("accepts a valid PNG with correct magic bytes", () => {
    const result = validateFileWithSignature("image/png", 1024, bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a));
    expect(result.valid).toBe(true);
  });

  it("accepts a valid WebP with correct magic bytes", () => {
    const result = validateFileWithSignature(
      "image/webp",
      1024,
      bytes(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x10, 0x00, 0x57, 0x45, 0x42, 0x50),
    );
    expect(result.valid).toBe(true);
  });

  it("accepts a valid GIF with correct magic bytes", () => {
    const result = validateFileWithSignature("image/gif", 1024, bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61));
    expect(result.valid).toBe(true);
  });

  // --- Signature mismatch ---

  it("rejects text content claimed as PDF with FILE_SIGNATURE_MISMATCH", () => {
    const result = validateFileWithSignature("application/pdf", 1024, bytes(0x68, 0x65, 0x6c, 0x6c, 0x6f));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("FILE_SIGNATURE_MISMATCH");
      expect(result.error).toContain("Dateiinhalt");
      expect(result.error).toContain("überein");
    }
  });

  it("rejects JPEG content claimed as PDF", () => {
    const result = validateFileWithSignature("application/pdf", 1024, bytes(0xff, 0xd8, 0xff));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("FILE_SIGNATURE_MISMATCH");
    }
  });

  it("rejects PDF content claimed as JPEG", () => {
    const result = validateFileWithSignature("image/jpeg", 1024, bytes(0x25, 0x50, 0x44, 0x46));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("FILE_SIGNATURE_MISMATCH");
    }
  });

  // --- MIME type check still applies first ---

  it("rejects unsupported MIME type before checking signature", () => {
    const result = validateFileWithSignature("text/plain", 1024, bytes(0x68, 0x65, 0x6c, 0x6c, 0x6f));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("UNSUPPORTED_FILE_TYPE");
    }
  });

  // --- Size check still applies ---

  it("rejects oversized file with FILE_TOO_LARGE", () => {
    const result = validateFileWithSignature("application/pdf", MAX_FILE_SIZE + 1, bytes(0x25, 0x50, 0x44, 0x46));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("FILE_TOO_LARGE");
    }
  });

  // --- Error response shape ---

  it("error responses include both error and code fields", () => {
    const result = validateFileWithSignature("application/pdf", 1024, bytes(0x68, 0x65, 0x6c, 0x6c, 0x6f));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(typeof result.error).toBe("string");
      expect(typeof result.code).toBe("string");
    }
  });
});
