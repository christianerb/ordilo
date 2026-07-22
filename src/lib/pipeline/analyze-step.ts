import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { runExtraction } from "@/lib/ai/extraction";
import { PIPELINE_VERSION } from "@/lib/ai/models";
import {
  computeNeedsUserReview,
  normalizeFactValue,
  type DocumentAnalysis,
  type FamilyContext,
} from "@/lib/schemas/extraction";
import { canonicalizeCategory } from "@/lib/categories";
import { buildDocumentEmbeddings } from "@/lib/pipeline/embed-step";

/**
 * Try to parse a date string from the LLM into ISO format (YYYY-MM-DD).
 * Returns null if the string cannot be parsed (e.g. "Montag", "nächste Woche").
 * Postgres `date` columns require ISO format; raw LLM output like "17.07."
 * or "Montag" would cause an insert error.
 */
function sanitizeDate(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  const s = value.trim();
  // Already ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // German format DD.MM.YYYY or DD.MM.
  const german = s.match(/^(\d{1,2})\.(\d{1,2})\.(?:\d{2,4})?/);
  if (german) {
    const day = german[1].padStart(2, "0");
    const month = german[2].padStart(2, "0");
    let year = german[3];
    if (!year) {
      year = String(new Date().getFullYear());
    } else if (year.length === 2) {
      year = "20" + year;
    }
    return `${year}-${month}-${day}`;
  }
  // Try Date.parse as a last resort
  const parsed = Date.parse(s);
  if (!isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  // Unparseable (e.g. "Montag", "nächste Woche") — return null
  return null;
}

/**
 * Shared analyze (LLM extraction) pipeline step.
 *
 * Extracted from `POST /api/documents/[id]/analyze` so the same logic runs
 * in the synchronous API route and in the background job worker
 * (`job_type = 'analyze'`).
 *
 * The caller is responsible for the atomic status transition to
 * `analyzing` BEFORE calling this, and for marking the document failed if
 * this throws.
 */

type Client = SupabaseClient<Database>;

/** Minimal document shape the analyze step needs. */
export interface AnalyzeStepDocument {
  id: string;
  family_id: string;
  ocr_text: string | null;
  /** Whether the document was previously confirmed (re-analyze support). */
  wasConfirmed: boolean;
}

/** Error thrown when a document has no OCR text to analyze. */
export class NoOcrTextError extends Error {
  readonly code = "NO_OCR_TEXT";
  constructor() {
    super("Kein OCR-Text vorhanden. Bitte zuerst OCR durchführen.");
    this.name = "NoOcrTextError";
  }
}

/**
 * Error thrown by pipeline DB operations, carrying a machine-readable code
 * (e.g. "DB_STORE_FAILED", "DB_UPDATE_FAILED") for structured API errors.
 */
export class PipelineStepError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "PipelineStepError";
    this.code = code;
  }
}

/**
 * Load the document's OCR text (per-page markdown, falling back to
 * documents.ocr_text).
 *
 * @throws {Error} on DB read failure.
 * @throws {NoOcrTextError} when no OCR text exists.
 */
export async function loadOcrText(
  client: Client,
  document: Pick<AnalyzeStepDocument, "id" | "ocr_text">,
): Promise<string> {
  const { data: pages, error: pagesError } = await client
    .from("document_pages")
    .select("ocr_markdown")
    .eq("document_id", document.id)
    .order("page_number", { ascending: true });

  if (pagesError) {
    throw new Error("OCR-Text konnte nicht geladen werden.");
  }

  const pageMarkdowns = (pages ?? [])
    .map((p) => p.ocr_markdown)
    .filter((md): md is string => Boolean(md && md.trim()));
  const ocrMarkdown = pageMarkdowns.join("\n\n");

  const fullOcrText = ocrMarkdown.trim() || (document.ocr_text ?? "").trim();
  if (!fullOcrText) throw new NoOcrTextError();
  return fullOcrText;
}

/**
 * Fetch the family context for the LLM system prompt (members, existing
 * categories, knowledge nodes).
 */
export async function fetchFamilyContext(
  client: Client,
  familyId: string,
): Promise<FamilyContext> {
  const { data: members, error: membersError } = await client
    .from("family_members")
    .select("id, name, role")
    .eq("family_id", familyId)
    .order("created_at", { ascending: true });

  if (membersError) {
    throw new Error("Familienmitglieder konnten nicht geladen werden.");
  }

  const { data: categoryDocs, error: categoriesError } = await client
    .from("documents")
    .select("category")
    .eq("family_id", familyId)
    .not("category", "is", null);

  if (categoriesError) {
    throw new Error("Kategorien konnten nicht geladen werden.");
  }

  const categories = [
    ...new Set(
      (categoryDocs ?? [])
        .map((d) => d.category)
        .filter((c): c is string => Boolean(c)),
    ),
  ];

  const { data: nodes, error: nodesError } = await client
    .from("knowledge_nodes")
    .select("type, label")
    .eq("family_id", familyId)
    .order("created_at", { ascending: true });

  if (nodesError) {
    throw new Error("Wissensknoten konnten nicht geladen werden.");
  }

  // Collection names — best-effort (collections are an optional recall
  // boost for category matching, not a hard dependency).
  const { data: collectionRows } = await client
    .from("collections")
    .select("name")
    .eq("family_id", familyId);
  const collections = (collectionRows ?? []).map((c) => c.name);

  return {
    members: (members ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
    })),
    categories,
    collections,
    knowledgeNodes: (nodes ?? []).map((n) => ({
      type: n.type,
      label: n.label,
    })),
  };
}

/**
 * Run the LLM extraction for a document whose status is already
 * `analyzing`, store the results, and transition to `analyzed`.
 *
 * When re-analyzing a previously confirmed document (`wasConfirmed = true`),
 * the function also generates new embeddings with the updated title/summary/
 * tags and transitions back to `confirmed` (not `analyzed`), keeping the
 * document searchable throughout the re-analysis.
 *
 * @returns The validated (and review-flagged) analysis.
 * @throws {ExtractionError | NoOcrTextError | Error} on any failure — the
 *         caller must mark the document failed.
 */
export async function performAnalyzeStep(
  client: Client,
  document: AnalyzeStepDocument,
): Promise<DocumentAnalysis> {
  const fullOcrText = await loadOcrText(client, document);

  const familyContext = await fetchFamilyContext(client, document.family_id);
  const analysis = await runExtraction(fullOcrText, familyContext);

  // Snap the suggested category to the family's canonical spelling —
  // prevents "Rechnung"/"Rechnungen" drift and keeps the collection link
  // (documents.category === collection.name) intact.
  analysis.suggested_category = canonicalizeCategory(
    analysis.suggested_category,
    familyContext.categories,
    familyContext.collections ?? [],
  );

  // Override the LLM's self-assessment with the deterministic threshold.
  analysis.needs_user_review = computeNeedsUserReview(analysis);

  try {
    await storeExtractionResults(
      client,
      document.id,
      document.family_id,
      analysis,
      document.wasConfirmed,
    );
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Ergebnisse konnten nicht gespeichert werden.";
    throw new PipelineStepError(message, "DB_STORE_FAILED");
  }

  // When re-analyzing a confirmed document, generate new embeddings with
  // the updated title/summary/tags and transition back to "confirmed".
  // This keeps the document searchable with the improved extraction.
  if (document.wasConfirmed) {
    try {
      const embeddings = await buildDocumentEmbeddings(client, document.id);
      const { error: rpcError } = await client.rpc(
        "replace_document_embeddings",
        {
          p_document_id: document.id,
          p_family_id: document.family_id,
          p_embeddings: embeddings,
          p_pipeline_version: PIPELINE_VERSION,
        },
      );
      if (rpcError) throw new Error("Embeddings konnten nicht aktualisiert werden.");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Re-Embedding fehlgeschlagen.";
      throw new PipelineStepError(message, "EMBEDDING_FAILED");
    }

    const { error: updateError } = await client
      .from("documents")
      .update({
        status: "confirmed",
        title: analysis.title,
        summary: analysis.summary,
        document_type: analysis.document_type,
        category: analysis.suggested_category,
        tags: analysis.tags,
        extraction_version: PIPELINE_VERSION,
        error_message: null,
      })
      .eq("id", document.id);

    if (updateError) {
      throw new PipelineStepError(
        "Dokument-Status konnte nicht aktualisiert werden.",
        "DB_UPDATE_FAILED",
      );
    }

    return analysis;
  }

  const { error: updateError } = await client
    .from("documents")
    .update({
      status: "analyzed",
      title: analysis.title,
      summary: analysis.summary,
      document_type: analysis.document_type,
      category: analysis.suggested_category,
      extraction_version: PIPELINE_VERSION,
      error_message: null,
    })
    .eq("id", document.id);

  if (updateError) {
    throw new PipelineStepError(
      "Dokument-Status konnte nicht aktualisiert werden.",
      "DB_UPDATE_FAILED",
    );
  }

  return analysis;
}

/**
 * Store the extraction results: replace extracted_entities, tasks, and
 * document_facts for the document. When re-analyzing a previously
 * confirmed document, also clear knowledge_edges. Embeddings are NOT
 * cleared here — they are replaced atomically by performAnalyzeStep
 * after generating new ones with the updated metadata.
 *
 * @throws {Error} if any DB operation fails.
 */
export async function storeExtractionResults(
  client: Client,
  documentId: string,
  familyId: string,
  analysis: DocumentAnalysis,
  wasConfirmed: boolean,
): Promise<void> {
  // 1. Clear prior results (re-analyze support) ----------------------------
  const { error: entitiesDeleteError } = await client
    .from("extracted_entities")
    .delete()
    .eq("document_id", documentId);

  if (entitiesDeleteError) {
    throw new Error("Vorherige Entitäten konnten nicht gelöscht werden.");
  }

  const { error: tasksDeleteError } = await client
    .from("tasks")
    .delete()
    .eq("document_id", documentId);

  if (tasksDeleteError) {
    throw new Error("Vorherige Aufgaben konnten nicht gelöscht werden.");
  }

  const { error: factsDeleteError } = await client
    .from("document_facts")
    .delete()
    .eq("document_id", documentId);

  if (factsDeleteError) {
    throw new Error("Vorherige Fakten konnten nicht gelöscht werden.");
  }

  if (wasConfirmed) {
    const { error: edgesDeleteError } = await client
      .from("knowledge_edges")
      .delete()
      .eq("source_document_id", documentId);

    if (edgesDeleteError) {
      throw new Error("Wissensgraph-Kanten konnten nicht gelöscht werden.");
    }
    // Note: embeddings are NOT deleted here when wasConfirmed. They are
    // replaced atomically by performAnalyzeStep after generating new ones
    // with the updated title/summary/tags. This keeps the document
    // searchable during re-analysis.
  }

  // 2. Insert new extracted_entities rows ----------------------------------
  type EntityInsert =
    Database["public"]["Tables"]["extracted_entities"]["Insert"];
  const entityInserts: EntityInsert[] = [];

  for (const member of analysis.family_members) {
    entityInserts.push({
      document_id: documentId,
      family_id: familyId,
      entity_type: "person",
      entity_value: member.name,
      normalized_value: member.name.toLowerCase().trim(),
      confidence: member.confidence,
      linked_object_id: member.person_id ?? null,
    });
  }

  for (const org of analysis.organizations) {
    entityInserts.push({
      document_id: documentId,
      family_id: familyId,
      entity_type: "organization",
      entity_value: org.name,
      normalized_value: org.name.toLowerCase().trim(),
      confidence: org.confidence,
    });
  }

  for (const date of analysis.dates) {
    entityInserts.push({
      document_id: documentId,
      family_id: familyId,
      entity_type: "date",
      entity_value: date.date,
      normalized_value: date.date,
      confidence: date.confidence,
    });
  }

  for (const amount of analysis.amounts) {
    entityInserts.push({
      document_id: documentId,
      family_id: familyId,
      entity_type: "amount",
      entity_value: `${amount.amount} ${amount.currency}`.trim(),
      normalized_value: amount.amount,
      confidence: amount.confidence,
    });
  }

  if (analysis.suggested_category) {
    entityInserts.push({
      document_id: documentId,
      family_id: familyId,
      entity_type: "category",
      entity_value: analysis.suggested_category,
      normalized_value: analysis.suggested_category.toLowerCase().trim(),
      confidence: 1.0,
    });
  }

  for (const tag of analysis.tags) {
    entityInserts.push({
      document_id: documentId,
      family_id: familyId,
      entity_type: "tag",
      entity_value: tag,
      normalized_value: tag.toLowerCase().trim(),
      confidence: 1.0,
    });
  }

  if (entityInserts.length > 0) {
    const { error: entitiesInsertError } = await client
      .from("extracted_entities")
      .insert(entityInserts);

    if (entitiesInsertError) {
      throw new Error("Entitäten konnten nicht gespeichert werden.");
    }
  }

  // 3. Insert new tasks rows -------------------------------------------------
  type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];
  const taskInserts: TaskInsert[] = analysis.tasks.map((task) => ({
    family_id: familyId,
    document_id: documentId,
    title: task.title,
    due_date: sanitizeDate(task.due_date),
    priority: task.priority,
    status: "open",
    confidence: task.confidence,
  }));

  if (taskInserts.length > 0) {
    const { error: tasksInsertError } = await client
      .from("tasks")
      .insert(taskInserts);

    if (tasksInsertError) {
      throw new Error("Aufgaben konnten nicht gespeichert werden.");
    }
  }

  // 4. Insert new document_facts rows (typed identifiers) --------------------
  type FactInsert = Database["public"]["Tables"]["document_facts"]["Insert"];
  const factInserts: FactInsert[] = analysis.facts.map((fact) => ({
    document_id: documentId,
    family_id: familyId,
    fact_type: fact.fact_type,
    label: fact.label,
    value: fact.value,
    normalized_value: normalizeFactValue(fact.value),
    confidence: fact.confidence,
  }));

  if (factInserts.length > 0) {
    const { error: factsInsertError } = await client
      .from("document_facts")
      .insert(factInserts);

    if (factsInsertError) {
      throw new Error("Fakten konnten nicht gespeichert werden.");
    }
  }
}
