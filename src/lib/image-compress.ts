/**
 * Client-side image downscaling before upload.
 *
 * Gallery photos from modern phones are 8–48 MP HEIC/JPEG files (3–15 MB).
 * Uploading them raw is the single slowest part of the mobile scan flow —
 * OCR works just as well on a ~2000 px JPEG. This module re-encodes large
 * images to a bounded JPEG before they enter the upload pipeline.
 *
 * It is strictly best-effort: any decode/encode failure returns the
 * original file untouched, so no capture is ever lost to this step. A
 * side benefit: formats the browser can decode but the backend rejects
 * (e.g. HEIC on Safari) come out as plain JPEG and pass validation.
 */

/** Longest edge of the re-encoded image, in pixels. */
const MAX_DIMENSION = 2048;

/** JPEG quality for the re-encode (documents stay crisply readable). */
const JPEG_QUALITY = 0.85;

/**
 * Accepted images smaller than this skip re-encoding entirely — the
 * savings would not be worth the CPU time on a phone.
 */
const SKIP_BELOW_BYTES = 900 * 1024;

/** MIME types the upload backend accepts as-is. */
const BACKEND_ACCEPTED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Fall through to the <img> path (older Safari, exotic formats).
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => {},
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Downscale and re-encode an image file for upload.
 *
 * - Non-images (PDFs) and animated-capable GIFs pass through untouched.
 * - Accepted images under {@link SKIP_BELOW_BYTES} pass through untouched.
 * - Everything else is decoded, scaled to at most {@link MAX_DIMENSION} px
 *   on the longest edge, and re-encoded as JPEG.
 * - If the re-encode fails or would GROW an already-accepted file, the
 *   original is returned.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return file;
  }

  const alreadyAccepted = BACKEND_ACCEPTED.has(file.type);
  if (alreadyAccepted && file.size < SKIP_BELOW_BYTES) {
    return file;
  }

  try {
    const decoded = await decodeImage(file);
    if (decoded.width === 0 || decoded.height === 0) {
      decoded.close();
      return file;
    }

    const scale = Math.min(
      1,
      MAX_DIMENSION / Math.max(decoded.width, decoded.height),
    );
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      decoded.close();
      return file;
    }

    // White backdrop so transparent PNG regions don't turn black in JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(decoded.source, 0, 0, width, height);
    decoded.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return file;

    // For files the backend already accepts, only swap in the re-encode
    // when it actually shrinks the payload.
    if (alreadyAccepted && blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "scan";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
