import { apiFetch } from "./api";
import { getSupabase } from "./supabase";

export type DocumentType =
  | "invoice"
  | "letter"
  | "contract"
  | "medical"
  | "school"
  | "insurance"
  | "tax"
  | "credentials"
  | "note"
  | "other";

export const documentTypeLabels: Record<DocumentType, string> = {
  invoice: "Rechnung",
  letter: "Brief",
  contract: "Vertrag",
  medical: "Arztbrief",
  school: "Schule",
  insurance: "Versicherung",
  tax: "Steuer",
  credentials: "Zugangsdaten",
  note: "Notiz",
  other: "Sonstiges",
};

export type ReviewAnalysis = {
  status: "analyzed" | "confirmed";
  document_type: DocumentType;
  title: string;
  summary: string;
  family_members: { person_id: string | null; name: string; confidence: number }[];
  organizations: { name: string; type: string; confidence: number }[];
  contacts: { name: string; organization: string; role: string; phone: string; email: string; confidence: number }[];
  dates: { date: string; type: string; label: string; confidence: number }[];
  amounts: { amount: string; currency: string; label: string; kind: string; value_date: string | null; confidence: number }[];
  tasks: { title: string; due_date: string | null; confidence: number }[];
  facts: { fact_type: string; label: string; value: string; confidence: number }[];
  suggested_category: string;
  tags: string[];
  needs_user_review: boolean;
};

type DocumentRow = {
  status: string;
  title: string | null;
  summary: string | null;
  document_type: string | null;
  category: string | null;
  tags: string[] | null;
};

const documentTypes = new Set<DocumentType>([
  "invoice", "letter", "contract", "medical", "school", "insurance", "tax", "credentials", "note", "other",
]);

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";
const confidence = (value: unknown) => typeof value === "number" ? value : 0;

/**
 * Rebuilds the existing web review payload from the same RLS-scoped tables.
 * This keeps mobile read-only until the user explicitly confirms it.
 */
export async function loadDocumentReview(documentId: string): Promise<ReviewAnalysis | null> {
  const supabase = getSupabase();
  const [{ data: document }, { data: entities }, { data: tasks }, { data: facts }] =
    await Promise.all([
      supabase.from("documents").select("status, title, summary, document_type, category, tags").eq("id", documentId).maybeSingle(),
      supabase.from("extracted_entities").select("*").eq("document_id", documentId),
      supabase.from("tasks").select("*").eq("document_id", documentId),
      supabase.from("document_facts").select("*").eq("document_id", documentId),
    ]);
  if (!document || !entities || !tasks) return null;

  const row = document as DocumentRow;
  const items = (entities as unknown[]).map(asRecord);
  const ofType = (type: string) => items.filter((entity) => entity.entity_type === type);
  const type = documentTypes.has(row.document_type as DocumentType)
    ? row.document_type as DocumentType
    : "other";
  const category = ofType("category")[0];
  if (row.status !== "analyzed" && row.status !== "confirmed") return null;

  return {
    status: row.status,
    document_type: type,
    title: row.title ?? "Dokument",
    summary: row.summary ?? "",
    family_members: ofType("person").map((entity) => ({ person_id: text(entity.linked_object_id) || null, name: text(entity.entity_value), confidence: confidence(entity.confidence) })),
    organizations: ofType("organization").map((entity) => {
      const details = asRecord(entity.metadata);
      return {
        name: text(entity.entity_value),
        type: text(details.type),
        confidence: confidence(entity.confidence),
      };
    }),
    contacts: ofType("contact").map((entity) => {
      const details = asRecord(entity.metadata);
      return { name: text(entity.entity_value), organization: text(details.organization), role: text(details.role), phone: text(details.phone), email: text(details.email), confidence: confidence(entity.confidence) };
    }),
    dates: ofType("date").map((entity) => {
      const details = asRecord(entity.metadata);
      return { date: text(entity.entity_value), type: text(details.type), label: text(details.label), confidence: confidence(entity.confidence) };
    }),
    amounts: ofType("amount").map((entity) => {
      const details = asRecord(entity.metadata);
      return { amount: text(entity.entity_value), currency: text(details.currency), label: text(details.label), kind: text(details.kind) || "other", value_date: text(details.value_date) || null, confidence: confidence(entity.confidence) };
    }),
    tasks: (tasks as unknown[]).map((task) => {
      const entry = asRecord(task);
      return { title: text(entry.title), due_date: text(entry.due_date) || null, confidence: confidence(entry.confidence) };
    }),
    facts: (facts ?? []).map((fact) => {
      const entry = asRecord(fact);
      return { fact_type: text(entry.fact_type) || "identifier", label: text(entry.label), value: text(entry.value), confidence: confidence(entry.confidence) };
    }),
    suggested_category: text(category?.entity_value) || row.category || "Sonstiges",
    tags: row.tags ?? ofType("tag").map((entity) => text(entity.entity_value)).filter(Boolean),
    needs_user_review: items.some((entity) => confidence(entity.confidence) < 0.7),
  };
}

export async function confirmDocumentReview(documentId: string, analysis: ReviewAnalysis): Promise<void> {
  const { status: _status, ...payload } = analysis;
  await apiFetch(`/api/documents/${documentId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, deletedTaskIndices: [], calendar_events: [] }),
  });
}

/** Only an analysed document is eligible for the atomic confirmation API. */
export function canReviewDocument(status: string): boolean {
  return status === "analyzed";
}
