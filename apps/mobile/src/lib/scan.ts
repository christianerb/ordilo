import { ApiError, apiFetch } from "./api";
import { getSupabase } from "./supabase";
import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
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
export type ScanQueueState = "queued" | "uploading" | "processing" | "failed";

export type PersistedScanQueueItem = ScannedDocument & {
  documentId?: string;
  error?: string;
  processingStep?: ScanProcessingStep;
  state: ScanQueueState;
};

export class ScanValidationError extends Error {}

const SCAN_QUEUE_DIRECTORY = `${FileSystem.documentDirectory}ordilo-scan/`;
const SCAN_QUEUE_MANIFEST = `${SCAN_QUEUE_DIRECTORY}queue.json`;
const PIPELINE_POLL_INTERVAL_MS = 1_000;
const PIPELINE_POLL_ATTEMPTS = 75;
let pendingQueueCheckpoint: Promise<void> = Promise.resolve();

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getDocumentStatus(documentId: string): Promise<string> {
  const { data, error } = await getSupabase()
    .from("documents")
    .select("status")
    .eq("id", documentId)
    .maybeSingle();
  if (error || !data) {
    throw new Error("Der Verarbeitungsstatus konnte nicht geladen werden.");
  }
  return data.status;
}

async function waitForPipelineStatus(
  documentId: string,
  expected: ReadonlySet<string>,
): Promise<void> {
  for (let attempt = 0; attempt < PIPELINE_POLL_ATTEMPTS; attempt++) {
    const status = await getDocumentStatus(documentId);
    if (expected.has(status)) return;
    if (status === "failed") {
      throw new Error("Die Verarbeitung des Dokuments ist fehlgeschlagen.");
    }
    await delay(PIPELINE_POLL_INTERVAL_MS);
  }
  throw new Error("Die Verarbeitung dauert zu lange. Bitte später erneut versuchen.");
}

async function postPipelineStep(path: string): Promise<void> {
  try {
    await apiFetch(path, { method: "POST" });
  } catch (error) {
    // A 409 means another server/client worker already claimed this state.
    // Treat it as a handoff instead of retrying the upload and creating a
    // duplicate document.
    if (error instanceof ApiError && error.status === 409) {
      const documentId = path.split("/")[3];
      if (path.endsWith("/ocr")) {
        await waitForPipelineStatus(
          documentId,
          new Set(["ocr_done", "analyzing", "analyzed", "confirmed"]),
        );
      } else {
        await waitForPipelineStatus(documentId, new Set(["analyzed", "confirmed"]));
      }
      return;
    }
    throw error;
  }
}

export async function stageScannedDocument(
  document: ScannedDocument,
): Promise<ScannedDocument> {
  await FileSystem.makeDirectoryAsync(SCAN_QUEUE_DIRECTORY, {
    intermediates: true,
  });
  const safeName = document.name.replace(/[^A-Za-z0-9._-]/g, "-");
  const uri = `${SCAN_QUEUE_DIRECTORY}${document.id}-${safeName}`;
  await FileSystem.copyAsync({ from: document.uri, to: uri });
  const info = await FileSystem.getInfoAsync(uri);
  const staged = {
    ...document,
    uri,
    size: info.exists ? info.size : document.size,
  };
  const validationError = validateScannedDocument(staged);
  if (validationError) {
    await removeStagedScannedDocument(uri);
    throw new ScanValidationError(validationError);
  }
  return staged;
}

export async function removeStagedScannedDocument(uri: string): Promise<void> {
  if (!uri.startsWith(SCAN_QUEUE_DIRECTORY)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

export async function loadPersistedScanQueue(): Promise<PersistedScanQueueItem[]> {
  try {
    const manifest = await FileSystem.getInfoAsync(SCAN_QUEUE_MANIFEST);
    if (!manifest.exists) return [];
    const parsed = JSON.parse(
      await FileSystem.readAsStringAsync(SCAN_QUEUE_MANIFEST),
    ) as PersistedScanQueueItem[];
    const valid = await Promise.all(
      parsed.map(async (item) => {
        const info = await FileSystem.getInfoAsync(item.uri);
        return info.exists ? item : null;
      }),
    );
    return valid.filter((item): item is PersistedScanQueueItem => item !== null);
  } catch {
    return [];
  }
}

export function persistScanQueue(
  queue: PersistedScanQueueItem[],
): Promise<void> {
  const checkpoint = pendingQueueCheckpoint.then(async () => {
    await FileSystem.makeDirectoryAsync(SCAN_QUEUE_DIRECTORY, {
      intermediates: true,
    });
    await FileSystem.writeAsStringAsync(
      SCAN_QUEUE_MANIFEST,
      JSON.stringify(queue),
    );
  });
  pendingQueueCheckpoint = checkpoint.catch(() => undefined);
  return checkpoint;
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

/** Streams the staged native file as a real multipart Blob. */
export async function uploadScannedDocument(
  document: ScannedDocument,
  familyId: string,
): Promise<ScanUploadResponse> {
  const formData = new FormData();
  const file = new File(document.uri);
  formData.append("file", file, document.name);
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
  onStep?: (step: ScanProcessingStep) => void | Promise<void>,
): Promise<void> {
  if (startAt === "ocr") {
    await onStep?.("ocr");
    await postPipelineStep(`/api/documents/${documentId}/ocr`);
  }
  await onStep?.("analysis");
  await postPipelineStep(`/api/documents/${documentId}/analyze`);
}
