import {
  detectMimeTypeFromBytes,
  type AcceptedMimeType,
  type FileValidationResult,
} from "./document";

/**
 * Member profile photo upload constraints.
 *
 * A tighter subset of the document upload rules (see `document.ts`):
 * images only, no PDF, and a smaller size cap since avatars are small,
 * roughly-square portraits rather than scanned pages.
 */
export const ACCEPTED_AVATAR_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AcceptedAvatarMimeType = (typeof ACCEPTED_AVATAR_MIME_TYPES)[number];

/** Maximum avatar upload size: 5 MB. */
export const MAX_AVATAR_FILE_SIZE = 5 * 1024 * 1024;

export const MAX_AVATAR_FILE_SIZE_LABEL = "5 MB";

/** File extensions accepted by the avatar file picker input. */
export const ACCEPTED_AVATAR_FILE_EXTENSIONS = ".jpg,.jpeg,.png,.webp";

/**
 * Validate an avatar file's type, size, and magic-byte signature.
 *
 * Reuses the magic-byte signature table from `document.ts` (JPEG/PNG/WebP
 * signatures are a subset of the document ones) but rejects PDF/GIF, which
 * are valid documents but not sensible profile photos.
 */
export function validateAvatarFile(
  mimeType: string,
  fileSize: number,
  bytes: Uint8Array,
): FileValidationResult {
  const acceptedMimes = ACCEPTED_AVATAR_MIME_TYPES as readonly string[];
  if (!acceptedMimes.includes(mimeType)) {
    return {
      valid: false,
      error: "Bitte ein JPEG-, PNG- oder WebP-Bild hochladen.",
      code: "UNSUPPORTED_FILE_TYPE",
    };
  }

  if (fileSize > MAX_AVATAR_FILE_SIZE) {
    return {
      valid: false,
      error: `Das Foto ist zu groß. Maximum: ${MAX_AVATAR_FILE_SIZE_LABEL}.`,
      code: "FILE_TOO_LARGE",
    };
  }

  const detected = detectMimeTypeFromBytes(bytes);
  if (!detected || !acceptedMimes.includes(detected as AcceptedMimeType)) {
    return {
      valid: false,
      error: "Der Dateiinhalt stimmt nicht mit dem angegebenen Dateityp überein.",
      code: "FILE_SIGNATURE_MISMATCH",
    };
  }

  return { valid: true, mimeType, fileSize };
}
