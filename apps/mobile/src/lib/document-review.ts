import { apiJson, apiFetch } from "./api";
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

type ReviewStatus = "analyzed" | "confirmed";

export type ReviewAnalysis = {
  status: ReviewStatus;
  document_type: DocumentType;
  title: string;
  summary: string;
  family_members: { person_id: string | null; name: string; confidence: number }[];
  organizations: { name: string; type: string; confidence: number }[];
  contacts: { name: string; organization: string; role: string; phone: string; email: string; confidence: number }[];
  dates: { date: string; type: string; label: string; confidence: number }[];
  amounts: { amount: string; currency: string; label: string; kind: "total" | "paid" | "outstanding" | "per_person" | "recurring" | "other"; value_date: string | null; confidence: number }[];
  tasks: { title: string; due_date: string | null; confidence: number }[];
  facts: { fact_type: string; label: string; value: string; confidence: number }[];
  suggested_category: string;
  tags: string[];
  needs_user_review: boolean;
};

/** A document that cannot be edited yet, but can still receive a clear state. */
export type UnavailableDocument = {
  status: string;
  title: string | null;
  document_type: DocumentType;
};

export type DocumentReview = ReviewAnalysis | UnavailableDocument;

export type ConfirmDocumentPayload = Omit<ReviewAnalysis, "status"> & {
  deletedTaskIndices: number[];
  calendar_events: { date: string; label: string }[];
};

export type OriginalFile = {
  url: string;
  mimeType: string | null;
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
const amountKinds = new Set<ReviewAnalysis["amounts"][number]["kind"]>([
  "total", "paid", "outstanding", "per_person", "recurring", "other",
]);

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";
const confidence = (value: unknown) => typeof value === "number" ? value : 0;

function documentType(value: string | null): DocumentType {
  return documentTypes.has(value as DocumentType) ? value as DocumentType : "other";
}

/**
 * Rebuilds the web review payload from the same RLS-scoped tables. A document
 * outside the review states deliberately returns its status instead of a
 * fake, editable analysis.
 */
export async function loadDocumentReview(documentId: string): Promise<DocumentReview | null> {
  const supabase = getSupabase();
  const [{ data: document, error: documentError }, { data: entities, error: entitiesError }, { data: tasks, error: tasksError }, { data: facts, error: factsError }] =
    await Promise.all([
      supabase.from("documents").select("status, title, summary, document_type, category, tags").eq("id", documentId).maybeSingle(),
      supabase.from("extracted_entities").select("*").eq("document_id", documentId),
      supabase.from("tasks").select("*").eq("document_id", documentId),
      supabase.from("document_facts").select("*").eq("document_id", documentId),
    ]);

  if (documentError || entitiesError || tasksError || factsError) {
    throw new Error("Document review could not be loaded.");
  }
  if (!document) return null;

  const row = document as DocumentRow;
  const type = documentType(row.document_type);
  if (row.status !== "analyzed" && row.status !== "confirmed") {
    return { status: row.status, title: row.title, document_type: type };
  }

  const items = (entities ?? []).map(asRecord);
  const ofType = (entityType: string) => items.filter((entity) => entity.entity_type === entityType);
  const category = ofType("category")[0];

  return {
    status: row.status,
    document_type: type,
    title: row.title ?? "Dokument",
    summary: row.summary ?? "",
    family_members: ofType("person").map((entity) => ({ person_id: text(entity.linked_object_id) || null, name: text(entity.entity_value), confidence: confidence(entity.confidence) })),
    organizations: ofType("organization").map((entity) => {
      const details = asRecord(entity.metadata);
      return { name: text(entity.entity_value), type: text(details.type), confidence: confidence(entity.confidence) };
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
      const kind = text(details.kind);
      return {
        amount: text(entity.entity_value),
        currency: text(details.currency),
        label: text(details.label),
        kind: amountKinds.has(kind as ReviewAnalysis["amounts"][number]["kind"]) ? kind as ReviewAnalysis["amounts"][number]["kind"] : "other",
        value_date: text(details.value_date) || null,
        confidence: confidence(entity.confidence),
      };
    }),
    tasks: (tasks ?? []).map((task) => {
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

/**
 * Produces exactly the ConfirmPayload contract. UI-only state, especially
 * `status`, never crosses the network boundary. Empty edited rows mean the
 * user removed that entity and are omitted where the contract requires text.
 */
export function buildConfirmDocumentPayload(analysis: ReviewAnalysis): ConfirmDocumentPayload {
  return {
    document_type: analysis.document_type,
    title: analysis.title.trim(),
    summary: analysis.summary.trim(),
    family_members: analysis.family_members
      .map((member) => ({ ...member, name: member.name.trim() }))
      .filter((member) => Boolean(member.name)),
    organizations: analysis.organizations,
    contacts: analysis.contacts,
    dates: analysis.dates.filter((date) => Boolean(date.date.trim())),
    amounts: analysis.amounts,
    tasks: analysis.tasks
      .map((task) => ({ ...task, title: task.title.trim(), due_date: task.due_date?.trim() || null }))
      .filter((task) => Boolean(task.title)),
    facts: analysis.facts
      .map((fact) => ({ ...fact, label: fact.label.trim(), value: fact.value.trim() }))
      .filter((fact) => Boolean(fact.label && fact.value)),
    suggested_category: analysis.suggested_category.trim(),
    tags: analysis.tags.map((tag) => tag.trim()).filter(Boolean),
    needs_user_review: analysis.needs_user_review,
    deletedTaskIndices: [],
    calendar_events: [],
  };
}

export async function confirmDocumentReview(documentId: string, analysis: ReviewAnalysis): Promise<void> {
  if (!canReviewDocument(analysis.status)) {
    throw new Error("Only analysed documents can be confirmed.");
  }
  await apiFetch(`/api/documents/${documentId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildConfirmDocumentPayload(analysis)),
  });
}

/** Loads a short-lived, signed original file URL via the bearer-auth API. */
export async function loadOriginalFile(documentId: string): Promise<OriginalFile> {
  const file = await apiJson<OriginalFile>(`/api/documents/${documentId}/file`);
  if (!isSafeOriginalFileUrl(file.url)) {
    throw new Error("Invalid original file URL.");
  }
  return file;
}

/** Signed storage URLs must be HTTPS before handing them to the OS. */
export function isSafeOriginalFileUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export function isImageFile(mimeType: string | null): boolean {
  return Boolean(mimeType?.toLowerCase().startsWith("image/"));
}

/** Only an analysed document is eligible for the atomic confirmation API. */
export function canReviewDocument(status: string): status is "analyzed" {
  return status === "analyzed";
}
