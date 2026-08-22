import { apiFetch } from "./api";

export const MAX_SCAN_FILE_SIZE = 4 * 1024 * 1024;
export const MAX_SCAN_FILE_SIZE_LABEL = "4 MB";

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

const acceptedMimeTypes = new Set([
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function getScanMimeType(
  mimeType: string | null | undefined,
  filename: string,
): string {
  if (mimeType && acceptedMimeTypes.has(mimeType)) return mimeType;

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
  if (!acceptedMimeTypes.has(document.mimeType)) {
    return "Bitte wähle ein Bild oder eine PDF-Datei aus.";
  }
  if (document.size !== undefined && document.size > MAX_SCAN_FILE_SIZE) {
    return `Die Datei ist zu groß. Maximum: ${MAX_SCAN_FILE_SIZE_LABEL}.`;
  }
  return null;
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
