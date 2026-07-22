import { triggerOcr } from "@/lib/ocr";
import type { FailedStage } from "@/lib/schemas/document";

export async function retryFailedDocument(
  documentId: string,
  stage: FailedStage,
): Promise<void> {
  if (stage === "ocr") {
    await triggerOcr(documentId);
    return;
  }

  const response = await fetch(`/api/documents/${documentId}/analyze`, {
    method: "POST",
  });
  if (response.ok || response.status === 409) return;

  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  throw new Error(
    body?.error || "Analyse konnte nicht neu gestartet werden.",
  );
}
