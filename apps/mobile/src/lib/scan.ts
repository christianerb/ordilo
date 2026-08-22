import { apiFetch } from "./api";
import { z } from "zod";

export const MAX_SCAN_FILE_SIZE = 4 * 1024 * 1024;
export const MAX_SCAN_FILE_SIZE_LABEL = "4 MB";

const acceptedMimeTypes = [
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
const acceptedMimeTypeSchema = z.enum(acceptedMimeTypes, {
  error: "Bitte wähle ein Bild oder eine PDF-Datei aus.",
});

export type ScannedDocument = {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
};

export type ScanUploadResponse = {
  document_id: string;
  status: "uploaded";
  server_pipeline: boolean;
};

const scannedDocumentSchema = z.object({
  mimeType: acceptedMimeTypeSchema,
  size: z
    .number()
    .nonnegative()
    .max(MAX_SCAN_FILE_SIZE, {
      error: `Die Datei ist zu groß. Maximum: ${MAX_SCAN_FILE_SIZE_LABEL}.`,
    })
    .optional(),
});

export function getScanMimeType(
  mimeType: string | null | undefined,
  filename: string,
): string {
  if (typeof mimeType === "string" && acceptedMimeTypeSchema.safeParse(mimeType).success) {
    return mimeType;
  }

  const extension = filename.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    default:
      return mimeType ?? "";
  }
}

export function validateScannedDocument(
  document: Pick<ScannedDocument, "mimeType" | "size">,
): string | null {
  const result = scannedDocumentSchema.safeParse(document);
  return result.success ? null : result.error.issues[0]?.message;
}

/**
 * Sends the same multipart payload as the web scanner. React Native accepts
 * a `{ uri, name, type }` descriptor in FormData; casting to Blob keeps the
 * DOM-oriented TypeScript definition out of the native call site.
 */
export async function uploadScannedDocument(
  document: ScannedDocument,
  familyId: string,
): Promise<ScanUploadResponse> {
  const formData = new FormData();
  formData.append(
    "file",
    {
      uri: document.uri,
      name: document.name,
      type: document.mimeType,
    } as unknown as Blob,
  );
  formData.append("family_id", familyId);

  const response = await apiFetch("/api/documents/upload", {
    method: "POST",
    body: formData,
  });
  return (await response.json()) as ScanUploadResponse;
}

/**
 * Starts OCR only when the server upload response says its job pipeline is
 * unavailable. The endpoint performs the work on the server and keeps
 * provider credentials out of the app.
 */
export async function triggerScannedDocumentOcr(documentId: string): Promise<void> {
  await apiFetch(`/api/documents/${documentId}/ocr`, { method: "POST" });
}
