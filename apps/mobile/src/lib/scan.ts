import { ApiError, apiFetch, getApiUrl } from "./api";
import { getSupabase } from "./supabase";
import * as FileSystem from "expo-file-system/legacy";
import {
  ACCEPTED_DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_FILE_SIZE,
  MAX_DOCUMENT_FILE_SIZE_LABEL,
  type DocumentPipelineStatus,
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
  serverPipeline?: boolean;
  state: ScanQueueState;
};

export class ScanValidationError extends Error {}

const SCAN_QUEUE_DIRECTORY = `${FileSystem.documentDirectory}ordilo-scan/`;
function queueDirectory(familyId?: string): string {
  if (familyId && !/^[a-zA-Z0-9-]+$/.test(familyId)) throw new Error("Ungültige Familie.");
  return familyId ? `${SCAN_QUEUE_DIRECTORY}${familyId}/` : SCAN_QUEUE_DIRECTORY;
}
const PIPELINE_POLL_INTERVAL_MS = 1_000;
const PIPELINE_POLL_ATTEMPTS = 75;
const ANALYSIS_POLL_ATTEMPTS = 200;
let pendingQueueCheckpoint: Promise<void> = Promise.resolve();

/** Serialize read/modify/write, including arrivals from another screen. */
export function mutateScanQueue(familyId: string, transform: (queue: PersistedScanQueueItem[]) => PersistedScanQueueItem[]): Promise<PersistedScanQueueItem[]> {
  const checkpoint = pendingQueueCheckpoint.then(async () => {
    const next = transform(await loadPersistedScanQueue(familyId));
    const directory = queueDirectory(familyId);
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    await FileSystem.writeAsStringAsync(`${directory}queue.json`, JSON.stringify(next));
    return next;
  });
  pendingQueueCheckpoint = checkpoint.then(() => {}, () => {});
  return checkpoint;
}

/** Inspect server state before retrying; a failed background job must restart, not just poll forever. */
export async function resumeScannedDocument(documentId: string, onStep?: (step: ScanProcessingStep) => void | Promise<void>, signal?: AbortSignal): Promise<void> {
  const { data, error } = await getSupabase().from("documents").select("status, failure_stage").eq("id", documentId).maybeSingle();
  if (error || !data) throw new Error("Das Dokument konnte nicht geladen werden. Bitte versuch es nochmal.");
  if (data.status === "uploaded" || data.status === "failed" || data.status === "ocr_done") {
    const step = data.status === "ocr_done" || (data.status === "failed" && data.failure_stage === "analyze") ? "analysis" : "ocr";
    await continueScannedDocumentPipeline(documentId, step, onStep, signal);
  }
}

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
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

async function waitForDocumentStatus(
  documentId: string,
  expected: ReadonlySet<string>,
  options: {
    attempts: number;
    intervalMs: number;
    failureMessage: string;
    onStatus?: (status: DocumentPipelineStatus) => void | Promise<void>;
    signal?: AbortSignal;
    timeoutMessage: string;
  },
): Promise<DocumentPipelineStatus> {
  let previousStatus: DocumentPipelineStatus | undefined;
  for (let attempt = 0; attempt < options.attempts; attempt++) {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const status = await getDocumentStatus(documentId) as DocumentPipelineStatus;
    if (status === "failed") {
      throw new Error(options.failureMessage);
    }
    if (status !== previousStatus) {
      await options.onStatus?.(status);
      previousStatus = status;
    }
    if (expected.has(status)) return status;
    await delay(options.intervalMs, options.signal);
  }
  throw new Error(options.timeoutMessage);
}

/**
 * Follow persisted server progress until review data is ready. This keeps the
 * UI honest when the upload route hands OCR and analysis to background jobs.
 */
export async function waitForScannedDocumentAnalysis(
  documentId: string,
  onStatus?: (status: DocumentPipelineStatus) => void | Promise<void>,
  pollIntervalMs = PIPELINE_POLL_INTERVAL_MS,
  maxAttempts = ANALYSIS_POLL_ATTEMPTS,
  signal?: AbortSignal,
): Promise<DocumentPipelineStatus> {
  return waitForDocumentStatus(
    documentId,
    new Set(["analyzed", "confirmed"]),
    {
      attempts: maxAttempts,
      intervalMs: pollIntervalMs,
      failureMessage: "Das Dokument konnte nicht verarbeitet werden.",
      onStatus,
      signal,
      timeoutMessage:
        "Die Verarbeitung dauert länger als erwartet. Du findest das Dokument in deiner Ablage.",
    },
  );
}

async function postPipelineStep(path: string, signal?: AbortSignal): Promise<void> {
  try {
    await apiFetch(path, {
      method: "POST",
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    // A 409 means another server/client worker already claimed this state.
    // Treat it as a handoff instead of retrying the upload and creating a
    // duplicate document.
    if (error instanceof ApiError && error.status === 409) {
      const documentId = path.split("/")[3];
      if (path.endsWith("/ocr")) {
        await waitForDocumentStatus(
          documentId,
          new Set(["ocr_done", "analyzing", "analyzed", "confirmed"]),
          {
            attempts: PIPELINE_POLL_ATTEMPTS,
            failureMessage: "Die Verarbeitung des Dokuments ist fehlgeschlagen.",
            intervalMs: PIPELINE_POLL_INTERVAL_MS,
            signal,
            timeoutMessage: "Die Verarbeitung dauert zu lange. Bitte später erneut versuchen.",
          },
        );
      } else {
        await waitForDocumentStatus(
          documentId,
          new Set(["analyzed", "confirmed"]),
          {
            attempts: PIPELINE_POLL_ATTEMPTS,
            failureMessage: "Die Verarbeitung des Dokuments ist fehlgeschlagen.",
            intervalMs: PIPELINE_POLL_INTERVAL_MS,
            signal,
            timeoutMessage: "Die Verarbeitung dauert zu lange. Bitte später erneut versuchen.",
          },
        );
      }
      return;
    }
    throw error;
  }
}

export async function stageScannedDocument(
  document: ScannedDocument,
  familyId?: string,
): Promise<ScannedDocument> {
  const directory = queueDirectory(familyId);
  await FileSystem.makeDirectoryAsync(directory, {
    intermediates: true,
  });
  const safeName = document.name.replace(/[^A-Za-z0-9._-]/g, "-");
  const uri = `${directory}${document.id}-${safeName}`;
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

export async function loadPersistedScanQueue(familyId?: string): Promise<PersistedScanQueueItem[]> {
  const manifestPath = `${queueDirectory(familyId)}queue.json`;
  try {
    const manifest = await FileSystem.getInfoAsync(manifestPath);
    if (!manifest.exists) return [];
    const parsed = z.array(z.object({
      id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
      uri: z.string().refine((uri) => uri.startsWith(queueDirectory(familyId))),
      name: z.string(), mimeType: acceptedMimeTypeSchema, size: z.number().nonnegative().optional(),
      documentId: z.string().optional(), error: z.string().optional(),
      processingStep: z.enum(["ocr", "analysis"]).optional(), serverPipeline: z.boolean().optional(),
      state: z.enum(["queued", "uploading", "processing", "failed"]),
    })).parse(JSON.parse(await FileSystem.readAsStringAsync(manifestPath)));
    const valid = await Promise.all(
      parsed.map(async (item) => {
        const info = await FileSystem.getInfoAsync(item.uri);
        // The server ID still permits recovery even if the OS removed a local copy.
        if (info.exists || item.documentId) return item;
        throw new Error("Eine Importdatei fehlt. Bitte teile sie erneut mit Ordilo.");
      }),
    );
    return valid;
  } catch {
    throw new Error("Gespeicherte Importe konnten nicht gelesen werden. Sie wurden nicht gelöscht. Bitte versuch es erneut.");
  }
}

export function persistScanQueue(
  queue: PersistedScanQueueItem[],
  familyId?: string,
): Promise<void> {
  const directory = queueDirectory(familyId);
  const manifestPath = `${directory}queue.json`;
  const checkpoint = pendingQueueCheckpoint.then(async () => {
    await FileSystem.makeDirectoryAsync(directory, {
      intermediates: true,
    });
    await FileSystem.writeAsStringAsync(
      manifestPath,
      JSON.stringify(queue),
    );
  });
  pendingQueueCheckpoint = checkpoint.catch(() => undefined);
  return checkpoint;
}

/** Merge new arrivals that another mounted intake screen has not seen yet. */
export function reconcileScanQueue(queue: PersistedScanQueueItem[], familyId: string, knownIds: string[]): Promise<PersistedScanQueueItem[]> {
  const checkpoint = pendingQueueCheckpoint.then(async () => {
    const current = await loadPersistedScanQueue(familyId);
    const known = new Set([...knownIds, ...queue.map((item) => item.id)]);
    const merged = [...queue, ...current.filter((item) => !known.has(item.id))];
    const directory = queueDirectory(familyId);
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    await FileSystem.writeAsStringAsync(`${directory}queue.json`, JSON.stringify(merged));
    return merged;
  });
  pendingQueueCheckpoint = checkpoint.then(() => {}, () => {});
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

/** Native background transfer keeps an already-started iOS upload alive across app switches. */
export async function uploadScannedDocument(
  document: ScannedDocument,
  familyId: string,
): Promise<ScanUploadResponse> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError("Bitte melde dich erneut an.", 401);
  let response: FileSystem.FileSystemUploadResult;
  try {
    response = await FileSystem.uploadAsync(`${getApiUrl()}/api/documents/upload`, document.uri, {
      httpMethod: "POST",
      sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: "file",
      mimeType: document.mimeType,
      parameters: { family_id: familyId, upload_key: document.id },
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new ApiError("Keine Verbindung. Dein Dokument bleibt gespeichert.", 0);
  }
  if (response.status < 200 || response.status >= 300) throw new ApiError("Der Upload konnte nicht abgeschlossen werden.", response.status);
  try {
    return z.object({ document_id: z.string().min(1), status: z.literal("uploaded"), server_pipeline: z.boolean() }).parse(JSON.parse(response.body));
  } catch {
    // Retry the same key after an uncertain response, never generate a new upload.
    throw new ApiError("Der Upload konnte noch nicht bestätigt werden.", 503);
  }
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
  signal?: AbortSignal,
): Promise<void> {
  if (startAt === "ocr") {
    await onStep?.("ocr");
    await postPipelineStep(`/api/documents/${documentId}/ocr`, signal);
  }
  await onStep?.("analysis");
  await postPipelineStep(`/api/documents/${documentId}/analyze`, signal);
}

/** Explicit upgrade recovery: the old queue had no family scope. Never infer it. */
export async function recoverLegacyScanQueue(familyId: string): Promise<void> {
  const legacy = await loadPersistedScanQueue();
  for (const item of legacy) {
    if (item.documentId) {
      const { data, error } = await getSupabase().from("documents").select("family_id").eq("id", item.documentId).maybeSingle();
      if (error || !data || data.family_id !== familyId) {
        throw new Error("Ein früherer Import gehört nicht zu dieser Familie. Er bleibt auf dem Gerät gespeichert.");
      }
    }
    const info = await FileSystem.getInfoAsync(item.uri);
    const staged = info.exists ? await stageScannedDocument(item, familyId) : { ...item, uri: `${queueDirectory(familyId)}${item.id}` };
    await reconcileScanQueue([{ ...item, ...staged, state: "queued" }], familyId, []);
    // Removing from the old manifest only after the new one is durable makes
    // crashes replay-safe without losing the original file.
    const remaining = await loadPersistedScanQueue();
    await persistScanQueue(remaining.filter((entry) => entry.id !== item.id));
    await removeStagedScannedDocument(item.uri);
  }
}
