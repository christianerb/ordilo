import { ApiError, apiFetch } from "./api";
import {
  ACCEPTED_DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_FILE_SIZE,
  MAX_DOCUMENT_FILE_SIZE_LABEL,
} from "@ordilo/document-contract";
import { z } from "zod";

export const MAX_SCAN_FILE_SIZE = MAX_DOCUMENT_FILE_SIZE;
export const MAX_SCAN_FILE_SIZE_LABEL = MAX_DOCUMENT_FILE_SIZE_LABEL;

const acceptedMimeTypeSchema = z.enum(ACCEPTED_DOCUMENT_MIME_TYPES, {
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

export type ScanProcessingStep = "ocr" | "analysis";

async function postPipelineStep(path: string): Promise<void> {
  try {
    await apiFetch(path, { method: "POST" });
  } catch (error) {
    // A 409 means another server/client worker already claimed this state.
    // Treat it as a handoff instead of retrying the upload and creating a
    // duplicate document.
    if (error instanceof ApiError && error.status === 409) return;
    throw error;
  }
}

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
 * Completes the client-driven pipeline when the upload endpoint could not
 * enqueue server jobs. Both operations stay on authenticated server routes,
 * so provider credentials never enter the app. `startAt` lets a retry resume
 * analysis without repeating a successful OCR call.
 */
export async function continueScannedDocumentPipeline(
  documentId: string,
  startAt: ScanProcessingStep = "ocr",
  onStep?: (step: ScanProcessingStep) => void,
): Promise<void> {
  if (startAt === "ocr") {
    onStep?.("ocr");
    await postPipelineStep(`/api/documents/${documentId}/ocr`);
  }
  onStep?.("analysis");
  await postPipelineStep(`/api/documents/${documentId}/analyze`);
}
