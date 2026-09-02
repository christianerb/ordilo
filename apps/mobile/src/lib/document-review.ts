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
  created_at: string;
  confirmed_at: string | null;
  original_filename: string | null;
  mime_type: string | null;
  page_count: number | null;
  ocr_text?: string | null;
  credential_text: string | null;
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
  created_at: string;
  confirmed_at: string | null;
  original_filename: string | null;
  mime_type: string | null;
  page_count: number | null;
  credential_text: string | null;
  document_type: DocumentType;
};

export type DocumentReview = ReviewAnalysis | UnavailableDocument;

export type ConfirmDocumentPayload = Omit<
  ReviewAnalysis,
  | "status"
  | "created_at"
  | "confirmed_at"
  | "original_filename"
  | "mime_type"
  | "page_count"
  | "ocr_text"
  | "credential_text"
> & {
  deletedTaskIndices: number[];
  calendar_events: { date: string; label: string }[];
};

export type OriginalFile = {
  url: string;
  mimeType: string | null;
};

export type ConfirmDocumentResult = {
  /** How many planner events the confirm created from the kept dates. */
  eventsCreated: number;
  /** How many tasks were kept on the family list. */
  tasksKept: number;
};

/** One line of "was das bedeutet": a date, a task, an amount or a number. */
export type DocumentConsequence =
  | { kind: "date"; index: number; label: string; date: string; dateLabel: string; relative: string | null }
  | { kind: "task"; index: number; title: string; dueDate: string | null; dueLabel: string | null }
  | { kind: "amount"; index: number; label: string; value: string; date: string | null }
  | { kind: "fact"; index: number; label: string; value: string };

type DocumentRow = {
  status: string;
  title: string | null;
  summary: string | null;
  document_type: string | null;
  category: string | null;
  tags: string[] | null;
  created_at: string;
  confirmed_at: string | null;
  original_filename: string | null;
  mime_type: string | null;
  page_count: number | null;
  ocr_text: string | null;
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

function jsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Rebuilds typed review entities from the columns written by buildEntityRows.
 * Legacy amount rows fall back to their display value.
 */
export function reconstructStoredEntities(rawEntities: unknown[]) {
  const items = rawEntities.map(asRecord);
  const ofType = (entityType: string) =>
    items.filter((entity) => entity.entity_type === entityType);

  const contacts = ofType("contact").flatMap((entity) => {
    const details = jsonRecord(entity.entity_value);
    const name = details ? text(details.name).trim() : "";
    const phone = details ? text(details.phone).trim() : "";
    const email = details ? text(details.email).trim() : "";
    if (!details || !name || (!phone && !email)) return [];
    return [{
      name,
      organization: text(details.organization),
      role: text(details.role),
      phone,
      email,
      confidence: confidence(entity.confidence),
    }];
  });

  const amounts = ofType("amount").map((entity) => {
    const displayParts = text(entity.entity_value).trim().split(/\s+/);
    const fallbackCurrency =
      displayParts.length > 1 ? displayParts.at(-1) ?? "EUR" : "EUR";
    const fallbackAmount =
      displayParts.length > 1
        ? displayParts.slice(0, -1).join(" ")
        : text(entity.entity_value);
    const storedKind = text(entity.amount_kind);
    return {
      amount: text(entity.normalized_value).trim() || fallbackAmount,
      currency: text(entity.currency).trim() || fallbackCurrency,
      label: text(entity.label),
      kind: amountKinds.has(storedKind as ReviewAnalysis["amounts"][number]["kind"])
        ? storedKind as ReviewAnalysis["amounts"][number]["kind"]
        : "other" as const,
      value_date: text(entity.value_date) || null,
      confidence: confidence(entity.confidence),
    };
  });

  return {
    items,
    familyMembers: ofType("person").map((entity) => ({
      person_id: text(entity.linked_object_id) || null,
      name: text(entity.entity_value),
      confidence: confidence(entity.confidence),
    })),
    organizations: ofType("organization").map((entity) => ({
      name: text(entity.entity_value),
      type: text(entity.normalized_value) || "organization",
      confidence: confidence(entity.confidence),
    })),
    contacts,
    dates: ofType("date").map((entity) => ({
      date: text(entity.entity_value),
      type: "date",
      label: text(entity.label),
      confidence: confidence(entity.confidence),
    })),
    amounts,
  };
}

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
      supabase.from("documents").select("status, title, summary, document_type, category, tags, created_at, confirmed_at, original_filename, mime_type, page_count, ocr_text").eq("id", documentId).maybeSingle(),
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
    return {
      status: row.status,
      title: row.title,
      created_at: row.created_at,
      confirmed_at: row.confirmed_at,
      original_filename: row.original_filename,
      mime_type: row.mime_type,
      page_count: row.page_count,
      credential_text: row.ocr_text,
      document_type: type,
    };
  }

  const reconstructed = reconstructStoredEntities(entities ?? []);
  const { items } = reconstructed;
  const ofType = (entityType: string) => items.filter((entity) => entity.entity_type === entityType);
  const category = ofType("category")[0];

  return {
    status: row.status,
    created_at: row.created_at,
    confirmed_at: row.confirmed_at,
    original_filename: row.original_filename,
    mime_type: row.mime_type,
    page_count: row.page_count,
    ocr_text: row.ocr_text,
    credential_text: row.ocr_text,
    document_type: type,
    title: row.title ?? "Dokument",
    summary: row.summary ?? "",
    family_members: reconstructed.familyMembers,
    organizations: reconstructed.organizations,
    contacts: reconstructed.contacts,
    dates: reconstructed.dates,
    amounts: reconstructed.amounts,
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

export type CredentialFields = {
  url: string | null;
  username: string | null;
};

const credentialField = /^-\s+\*\*(URL|Benutzername):\*\*\s*(.+)$/i;

/**
 * Only extracts the known credentials layout. Unknown document text remains
 * untouched instead of being guessed into a login field.
 */
export function parseCredentialFields(content: string | null): CredentialFields {
  const fields: CredentialFields = { url: null, username: null };
  if (!content) return fields;
  for (const line of content.split("\n")) {
    const match = credentialField.exec(line.trim());
    if (!match) continue;
    const value = match[2].trim();
    if (!value) continue;
    if (match[1].toLocaleLowerCase("de") === "url") fields.url ??= value;
    else fields.username ??= value;
  }
  return fields;
}

/**
 * Produces exactly the ConfirmPayload contract. UI-only state, especially
 * `status`, never crosses the network boundary. Empty edited rows mean the
 * user removed that entity and are omitted where the contract requires text.
 */
export function buildConfirmDocumentPayload(
  analysis: ReviewAnalysis,
  options: { calendarDateIndices?: number[] } = {},
): ConfirmDocumentPayload {
  const keptDates = new Set(options.calendarDateIndices ?? []);
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
    // Dates the family kept checked become planner events in the same
    // transaction as the confirmation — "Ordilo hat den Termin eingetragen".
    calendar_events: analysis.dates
      .map((date, index) => ({ date: date.date.trim(), label: date.label.trim(), index }))
      .filter((date) => keptDates.has(date.index) && /^\d{4}-\d{2}-\d{2}$/.test(date.date))
      .map((date) => ({ date: date.date, label: date.label || analysis.title.trim() || "Termin" })),
  };
}

export async function confirmDocumentReview(
  documentId: string,
  analysis: ReviewAnalysis,
  options: { calendarDateIndices?: number[] } = {},
): Promise<ConfirmDocumentResult> {
  if (!canReviewDocument(analysis.status)) {
    throw new Error("Only analysed documents can be confirmed.");
  }
  const payload = buildConfirmDocumentPayload(analysis, options);
  const response = await apiFetch(`/api/documents/${documentId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let eventsCreated = 0;
  try {
    const body = (await response.json()) as { events_created?: unknown };
    if (typeof body.events_created === "number") eventsCreated = body.events_created;
  } catch {
    // An empty or non-JSON body still means the confirm succeeded.
  }
  return { eventsCreated, tasksKept: payload.tasks.length };
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnly(value: string): Date | null {
  if (!DATE_ONLY.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Di., 8. Sep." — or the raw text when Ordilo could not read a date. */
export function formatReviewDate(value: string): string {
  const date = parseDateOnly(value.trim());
  if (!date) return value.trim();
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

/** "heute", "morgen", "in 6 Tagen", "vor 3 Tagen", null beyond ~8 weeks. */
export function formatRelativeDays(value: string, now = new Date()): string | null {
  const date = parseDateOnly(value.trim());
  if (!date) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return "heute";
  if (days === 1) return "morgen";
  if (days === -1) return "gestern";
  if (days > 1 && days <= 60) return `in ${days} Tagen`;
  if (days < -1 && days >= -60) return `vor ${Math.abs(days)} Tagen`;
  return null;
}

/** "84,20 €" from the loosely typed amount the extraction produces. */
export function formatReviewAmount(amount: string, currency: string): string {
  const normalized = amount.trim().replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return [amount.trim(), currency.trim()].filter(Boolean).join(" ");
  const code = (currency.trim() || "EUR").toUpperCase();
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: code }).format(value);
  } catch {
    return `${value.toFixed(2).replace(".", ",")} ${code}`;
  }
}

/**
 * What a document means for the family, in the order a person would act
 * on it: dates soonest first, then tasks, then money, then numbers worth
 * copying. This is the heart of the detail screen — the file itself
 * comes after.
 */
export function getDocumentConsequences(
  analysis: ReviewAnalysis,
  now = new Date(),
): DocumentConsequence[] {
  const dates: DocumentConsequence[] = analysis.dates
    .map((date, index) => ({ date, index }))
    .filter(({ date }) => date.date.trim() || date.label.trim())
    .sort((a, b) => a.date.date.localeCompare(b.date.date))
    .map(({ date, index }) => ({
      kind: "date" as const,
      index,
      label: date.label.trim() || "Termin",
      date: date.date.trim(),
      dateLabel: formatReviewDate(date.date),
      relative: formatRelativeDays(date.date, now),
    }));
  const tasks: DocumentConsequence[] = analysis.tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => task.title.trim())
    .map(({ task, index }) => ({
      kind: "task" as const,
      index,
      title: task.title.trim(),
      dueDate: task.due_date?.trim() || null,
      dueLabel: task.due_date?.trim() ? formatReviewDate(task.due_date) : null,
    }));
  const amounts: DocumentConsequence[] = analysis.amounts
    .map((amount, index) => ({ amount, index }))
    .filter(({ amount }) => amount.amount.trim())
    .map(({ amount, index }) => ({
      kind: "amount" as const,
      index,
      label: amount.label.trim() || (amount.kind === "total" ? "Gesamtbetrag" : "Betrag"),
      value: formatReviewAmount(amount.amount, amount.currency),
      date: amount.value_date?.trim() || null,
    }));
  const facts: DocumentConsequence[] = analysis.facts
    .map((fact, index) => ({ fact, index }))
    .filter(({ fact }) => fact.value.trim())
    .map(({ fact, index }) => ({
      kind: "fact" as const,
      index,
      label: fact.label.trim() || "Nummer",
      value: fact.value.trim(),
    }));
  return [...dates, ...tasks, ...amounts, ...facts];
}

/** Loads a short-lived, signed original file URL via the bearer-auth API. */
export async function loadOriginalFile(documentId: string): Promise<OriginalFile> {
  const file = await apiJson<OriginalFile>(`/api/documents/${documentId}/file`);
  if (!isSafeOriginalFileUrl(file.url)) {
    throw new Error("Invalid original file URL.");
  }
  return file;
}

/** Reveals an encrypted secret only after a deliberate press. */
export async function revealDocumentSecret(documentId: string): Promise<string> {
  const response = await apiJson<{ secret?: unknown }>(`/api/documents/${documentId}/secret`, {
    method: "POST",
  });
  return typeof response.secret === "string" ? response.secret : "";
}

/** Deletes via the protected API so the private storage original is removed too. */
export async function deleteDocument(documentId: string): Promise<void> {
  await apiFetch(`/api/documents/${documentId}`, { method: "DELETE" });
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
