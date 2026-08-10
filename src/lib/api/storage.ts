import { jsonError } from "@/lib/api/respond";

/**
 * Shared Storage helpers for upload-serving API routes
 * (/api/documents/upload, /api/documents/notes,
 * /api/family-members/[id]/photo, /api/documents/[id]/file).
 */

/** How long signed Storage URLs stay valid, in seconds. */
export const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Sanitize a user-provided filename for use in a Storage path: anything
 * outside [a-zA-Z0-9._-] becomes "_". Returns `fallback` when nothing
 * usable remains (e.g. a filename of only special characters).
 */
export function sanitizeFilename(name: string, fallback: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_") || fallback;
}

/** Build a Storage object path from segments ({family}/{id}/{filename}). */
export function buildStoragePath(...segments: string[]): string {
  return segments.join("/");
}

/** Discriminated result of {@link readFileHeaderBytes}. */
export type HeaderBytesResult =
  | { ok: true; headerBytes: Uint8Array }
  | { ok: false; response: Response };

/**
 * Read a file's leading bytes for magic-byte signature validation.
 *
 * Reads the whole file into memory (it is already buffered for the
 * Storage upload) and returns the first 16 bytes. Safe for the 4–5 MB
 * max file sizes and avoids platform-specific Blob.slice() issues.
 *
 * @param errorMessage - Per-route German copy for the 400 response when
 *                       the file cannot be read.
 */
export async function readFileHeaderBytes(
  file: File,
  errorMessage = "Datei konnte nicht gelesen werden. Bitte erneut versuchen.",
): Promise<HeaderBytesResult> {
  try {
    const fullBuffer = await file.arrayBuffer();
    return {
      ok: true,
      headerBytes: new Uint8Array(
        fullBuffer,
        0,
        Math.min(16, fullBuffer.byteLength),
      ),
    };
  } catch {
    return {
      ok: false,
      response: jsonError(errorMessage, "FILE_READ_ERROR", 400),
    };
  }
}
