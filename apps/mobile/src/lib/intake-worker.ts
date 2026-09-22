import { ApiError } from "./api";
import { AI_CONSENT_REQUIRED_CODE } from "./ai-consent";
import { recordScanFailure } from "./analytics";
import {
  classifyScanFailureReason,
  loadPersistedScanQueue, mutateScanQueue, removeStagedScannedDocument,
  resumeScannedDocument, uploadScannedDocument,
  MAX_SCAN_FILE_SIZE_LABEL,
  type PersistedScanQueueItem,
} from "./scan";

const running = new Map<string, Promise<void>>();

function failureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    // Consent refusal (Apple 5.1.2(i)) shares the 403 with the family-
    // access refusal, so the machine code decides which one it is.
    if (error.code === AI_CONSENT_REQUIRED_CODE) return "Ordilo braucht deine Zustimmung zur KI-Verarbeitung. Du findest sie in den Einstellungen.";
    if (error.status === 413) return `Die Datei ist zu groß. Bitte wähle eine Datei bis ${MAX_SCAN_FILE_SIZE_LABEL}.`;
    if (error.status === 429) return "Das Tageslimit ist erreicht. Bitte versuch es morgen erneut.";
    if (error.status === 401) return "Bitte melde dich erneut an, um den Import fortzusetzen.";
    if (error.status === 403) return "Du hast keinen Zugriff mehr auf diese Familie. Deine Datei bleibt auf dem Gerät.";
  }
  return "Der Import braucht deine Hilfe. Bitte in der Dokumentaufnahme erneut versuchen.";
}

export async function waitForIntake(familyId: string): Promise<void> {
  await running.get(familyId);
}

/** The app owns transfers; the server owns analysis. Never wait for analysis here. */
export function drainIntake(familyId: string, isCurrent: () => boolean): Promise<void> {
  const existing = running.get(familyId);
  if (existing) return existing;
  const run = (async () => {
    const queue = await loadPersistedScanQueue(familyId);
    const pending = queue.filter((item) => item.state !== "failed");
    let cursor = 0;
    const work = async () => {
      while (isCurrent() && cursor < pending.length) {
        const item = pending[cursor++];
        let current: PersistedScanQueueItem = item;
        const patch = async (values: Partial<PersistedScanQueueItem>) => {
          current = { ...current, ...values };
          await mutateScanQueue(familyId, (items) => items.map((entry) => entry.id === item.id ? { ...entry, ...values } : entry));
        };
        try {
          if (!isCurrent()) return;
          if (!current.documentId) {
            await patch({ state: "uploading", error: undefined });
            if (!isCurrent()) return;
            const result = await uploadScannedDocument(current, familyId);
            await patch({ documentId: result.document_id, serverPipeline: result.server_pipeline, state: "processing" });
          }
          if (!current.serverPipeline) {
            if (!isCurrent()) return;
            await resumeScannedDocument(current.documentId!);
          }
          // Remove local bytes only after the durable handoff checkpoint.
          await mutateScanQueue(familyId, (items) => items.filter((entry) => entry.id !== item.id));
          await removeStagedScannedDocument(item.uri);
        } catch (error) {
          const retryable = error instanceof ApiError && (error.status === 0 || error.status >= 500 || error.status === 408);
          await patch({
            state: retryable ? (current.documentId ? "processing" : "queued") : "failed",
            error: retryable ? "Wartet auf Verbindung. Ordilo versucht es automatisch erneut." : failureMessage(error),
          });
          if (!retryable) {
            // A background failure nobody is watching still belongs in the
            // quality numbers — coarse codes only, never content.
            void recordScanFailure({
              familyId,
              stage: !current.documentId
                ? "upload"
                : current.processingStep === "analysis"
                  ? "analysis"
                  : "ocr",
              reason: classifyScanFailureReason(error),
            });
          }
        }
      }
    };
    // Keep the lock until both workers finish, even when one checkpoint fails.
    const outcomes = await Promise.allSettled([work(), work()]);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    if (rejected?.status === "rejected") throw rejected.reason;
  })();
  running.set(familyId, run);
  void run.finally(() => { if (running.get(familyId) === run) running.delete(familyId); }).catch(() => {});
  return run;
}
