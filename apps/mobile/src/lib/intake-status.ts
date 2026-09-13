import { getSupabase } from "./supabase";
import type { PersistedScanQueueItem, ScanProcessingStep } from "./scan";

/**
 * What the top-of-screen intake banner says while documents are on their
 * way in. Kept pure and away from the component so the copy — the part a
 * family actually reads — is testable, and so the four situations stay
 * genuinely distinct instead of all reading as one grey sentence.
 */
export type IntakeTone = "working" | "waiting" | "attention" | "error";

export interface IntakeStatus {
  tone: IntakeTone;
  /** One short line naming what is happening, with the count in it. */
  title: string;
  /** What that means for the reader right now. */
  detail: string;
  /** How many documents the banner is speaking for. */
  count: number;
}

function documents(count: number): string {
  return count === 1 ? "1 Dokument" : `${count} Dokumente`;
}

/** German name for the step a document is on, for the working line. */
const STEP_DETAIL: Record<ScanProcessingStep, string> = {
  ocr: "Ordilo entziffert gerade den Text.",
  analysis: "Ordilo sortiert gerade, was drinsteht.",
};

/**
 * The banner's content for a queue, or null when there is nothing to say.
 *
 * Order matters: something that needs a person beats progress, and
 * progress beats waiting — the reader should learn the most urgent thing
 * first, not an average of all of them.
 */
export function describeIntake(
  items: PersistedScanQueueItem[],
): IntakeStatus | null {
  if (items.length === 0) return null;

  const failed = items.filter((item) => item.state === "failed");
  if (failed.length > 0) {
    return {
      tone: "attention",
      title:
        failed.length === 1
          ? "Ein Import braucht dich"
          : `${failed.length} Importe brauchen dich`,
      detail: "Tipp hier, dann machen wir das zusammen fertig.",
      count: failed.length,
    };
  }

  const waiting = items.every((item) => item.state === "queued");
  if (waiting) {
    return {
      tone: "waiting",
      title:
        items.length === 1
          ? "1 Dokument wartet"
          : `${items.length} Dokumente warten`,
      detail: "Der Upload startet automatisch, sobald es geht.",
      count: items.length,
    };
  }

  // A single document can name its own step; several at once would turn
  // that into noise, so the group keeps the calm promise instead.
  const steps = new Set(
    items
      .map((item) => item.processingStep)
      .filter((step): step is ScanProcessingStep => Boolean(step)),
  );
  const detail =
    items.length === 1 && steps.size === 1
      ? STEP_DETAIL[[...steps][0]]
      : "Du kannst weitermachen. Ich melde mich, wenn es fertig ist.";

  return {
    tone: "working",
    title: `Ordilo liest ${documents(items.length)}`,
    detail,
    count: items.length,
  };
}

/** The queue itself could not be read — say so, and offer the retry. */
export function describeIntakeFailure(): IntakeStatus {
  return {
    tone: "error",
    title: "Eingang nicht lesbar",
    detail: "Tipp hier, um es nochmal zu versuchen.",
    count: 0,
  };
}

/** The screen-reader sentence: the whole banner in one breath. */
export function intakeStatusLabel(status: IntakeStatus): string {
  return `${status.title}. ${status.detail}`;
}

/**
 * Scan handoff: a scan ends in the review, not in the library. After one
 * document the scan flow follows it into the review itself; after several
 * it lands on a calm success state whose "Jetzt prüfen" opens the document
 * that has waited longest for a pair of eyes.
 */

/** What the success state says once several documents went in at once. */
export function describeScanCompletion(count: number): {
  title: string;
  detail: string;
} {
  return {
    title:
      count === 1
        ? "1 Dokument ist angekommen"
        : `${count} Dokumente sind angekommen`,
    detail:
      "Ordilo liest jetzt der Reihe nach mit. Du kannst gleich prüfen — oder später in der Ablage.",
  };
}

/** Statuses in which a document is on its way to (or ready for) a review. */
const OPEN_DOCUMENT_STATUSES = [
  "uploaded",
  "ocr_processing",
  "ocr_done",
  "analyzing",
  "analyzed",
];

/**
 * The oldest document that still needs a review. Failed documents are no
 * review target — there is nothing to check yet — and confirmed ones are
 * already done.
 */
export async function loadFirstOpenDocumentId(
  familyId: string,
): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from("documents")
    .select("id")
    .eq("family_id", familyId)
    .in("status", OPEN_DOCUMENT_STATUSES)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) {
    throw new Error(
      "Das Dokument konnte nicht gefunden werden. Bitte versuch es nochmal.",
    );
  }
  return data?.[0]?.id ?? null;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The handoff to the background worker is durable but not instant, so the
 * first document may need a moment to appear. Poll briefly, then give up
 * and let the caller fall back to the library, where the intake banner
 * keeps the family informed.
 */
export async function waitForFirstOpenDocument(
  familyId: string,
  options: {
    tries?: number;
    intervalMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<string | null> {
  const { tries = 20, intervalMs = 1_500, sleep = defaultSleep } = options;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const documentId = await loadFirstOpenDocumentId(familyId);
    if (documentId) return documentId;
    if (attempt < tries - 1) await sleep(intervalMs);
  }
  return null;
}
