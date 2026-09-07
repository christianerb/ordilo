import { z } from "zod";
import { getSupabase } from "./supabase";
import { loadDocumentReview, type ReviewAnalysis } from "./document-review";
import { buildDocumentUpdatePayload, updateConfirmedDocument } from "./notes";

export type CorrectionBaseline = { document: ReviewAnalysis; revision: string };

async function revision(documentId: string): Promise<string> {
  const { data, error } = await getSupabase().rpc("document_correction_revision", { p_document_id: documentId });
  if (error || typeof data !== "string") throw new Error("Das Dokument konnte nicht zum Bearbeiten geladen werden.");
  return data;
}

/** Bracket separate RLS reads to avoid editing an internally mixed snapshot. */
export async function loadCorrectionBaseline(documentId: string): Promise<CorrectionBaseline> {
  const before = await revision(documentId);
  const document = await loadDocumentReview(documentId);
  const after = await revision(documentId);
  if (!document || !("summary" in document) || document.status !== "confirmed" || before !== after) {
    throw new Error("Das Dokument wurde inzwischen geändert. Bitte öffne es nochmal.");
  }
  return { document, revision: after };
}

const editableFields = z.object({
  title: z.string().trim().min(1).max(200),
  dates: z.array(z.object({ date: z.iso.date(), label: z.string() })),
  tasks: z.array(z.object({ title: z.string().trim().min(1).max(200), due_date: z.iso.date().nullable() })).max(100),
  facts: z.array(z.object({ label: z.string().trim().min(1).max(200), value: z.string().trim().min(1).max(1000) })).max(100),
});

export function buildCorrectionPayload(baseline: CorrectionBaseline, draft: ReviewAnalysis) {
  editableFields.parse(draft);
  return {
    ...buildDocumentUpdatePayload(draft, draft),
    corrections: {
      revision: baseline.revision,
      tasks: draft.tasks.map(({ id, title, due_date }) => ({ ...(id ? { id } : {}), title: title.trim(), due_date })),
      facts: draft.facts.map(({ id, label, value }) => ({ ...(id ? { id } : {}), label: label.trim(), value: value.trim() })),
      date_changes: draft.dates.flatMap((date) => {
        const previous = baseline.document.dates.find((entry) => entry.id && entry.id === date.id);
        if (!previous || !previous.label.trim() || !date.label.trim() || (previous.date === date.date && previous.label === date.label)) return [];
        return [{ previous_date: previous.date, previous_label: previous.label, date: date.date, label: date.label }];
      }),
    },
  };
}

export async function saveDocumentCorrections(id: string, baseline: CorrectionBaseline, draft: ReviewAnalysis): Promise<void> {
  await updateConfirmedDocument(id, buildCorrectionPayload(baseline, draft));
}
