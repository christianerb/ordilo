import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { runExtraction } from "@/lib/ai/extraction";
import {
  cleanupAnalysisEntities,
  toIsoDateOrNull,
} from "@/lib/analysis-cleanup";
import { PIPELINE_VERSION } from "@/lib/ai/models";
import {
  computeNeedsUserReview,
  normalizeFactValue,
  DOCUMENT_TYPES,
  type DocumentAnalysis,
  type FamilyContext,
} from "@/lib/schemas/extraction";
import { canonicalizeCategory } from "@/lib/categories";
import { stripCredentialFields } from "@/lib/credentials";
import { buildDocumentEmbeddings } from "@/lib/pipeline/embed-step";
import {
  previewFieldCount,
  type PartialAnalysisPreview,
} from "@/lib/ai/partial-json";
import { buildEntityRows } from "@/lib/pipeline/entity-rows";
import { getManualNotePreview } from "@ordilo/document-contract";

/** Minimum time between `partial_analysis` writes — keeps the realtime/
 * polling load down to a couple of updates per document instead of one
 * per streamed token. */
const PARTIAL_ANALYSIS_WRITE_INTERVAL_MS = 700;

/**
 * Throttled writer for the in-progress extraction preview: only persists
 * when the preview has grown (more fields recognized) and at most once
 * per interval. Best-effort — a failed write never fails the pipeline,
 * since this column is cosmetic (a live preview), not authoritative data.
 */
function makePartialAnalysisWriter(client: Client, documentId: string) {
  let lastWriteAt = 0;
  let lastFieldCount = 0;
  return (preview: PartialAnalysisPreview) => {
    const fieldCount = previewFieldCount(preview);
    if (fieldCount <= lastFieldCount) return;
    const now = Date.now();
    if (now - lastWriteAt < PARTIAL_ANALYSIS_WRITE_INTERVAL_MS) return;
    lastWriteAt = now;
    lastFieldCount = fieldCount;
    void client
      .from("documents")
      .update({ partial_analysis: preview as Record<string, unknown> })
      .eq("id", documentId)
      .then(() => {
        // Best-effort — nothing to do either way.
      });
  };
}

/**
 * Coerce an LLM date into ISO format for the Postgres `date` columns.
 * Shared with the confirm route so both paths sanitise identically.
 */
function sanitizeDate(value: string | null | undefined): string | null {
  return toIsoDateOrNull(value);
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
  /**
   * The document's current category, if any. A note created inside a
   * collection is pinned to that collection's category at creation time
   * (before analysis runs) — see the preservation guard below.
   */
  category?: string | null;
  /**
   * How the document entered the app. `"manual"` marks a hand-written
   * note: its title, type and collection come from the user, so analysis
   * enriches it (summary, tags, entities, search) without rewriting what
   * the user typed and picked.
   */
  source?: string | null;
  /** The user-given title, preserved for manual notes. */
  title?: string | null;
  /** The user-picked document type, preserved for manual notes. */
  document_type?: string | null;
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
  /**
   * True when the failure happened while the document's stored results
   * were being replaced. `storeExtractionResults` deletes the previous
   * entities, tasks, facts and knowledge edges before inserting the new
   * ones, and that sequence is not transactional — a failure in the middle
   * can leave a document with its old derived data already gone.
   *
   * Callers must keep such a document in the visible `failed` state so the
   * user can retry it. Only a non-destructive failure (the analysis never
   * touched the stored results — an OpenAI outage, a context read error, a
   * failed re-embedding after the results were fully written) may be
   * rolled back to `confirmed`.
   */
  readonly destructive: boolean;
  constructor(
    message: string,
    code: string,
    options: { destructive?: boolean } = {},
  ) {
    super(message);
    this.name = "PipelineStepError";
    this.code = code;
    this.destructive = options.destructive ?? false;
  }
}

/**
 * Whether a failed analysis may have left the document's stored results
 * half-replaced — see {@link PipelineStepError.destructive}.
 *
 * Unknown errors are treated as non-destructive: they are thrown before
 * the storage phase is reached (extraction, family context, OCR text), and
 * everything raised from inside that phase is a PipelineStepError.
 */
export function isDestructiveAnalysisFailure(err: unknown): boolean {
  return err instanceof PipelineStepError && err.destructive;
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
  const rawOcrText = await loadOcrText(client, document);
  // A login's URL and user name never travel to the LLM: they would come
  // back in the summary and the tags, and from there into every place a
  // document is quoted. The description is enriched as usual; if that is
  // all there was, the title carries the analysis.
  const fullOcrText =
    document.document_type === "credentials"
      ? stripCredentialFields(rawOcrText) || document.title || "Zugangsdaten"
      : rawOcrText;

  const familyContext = await fetchFamilyContext(client, document.family_id);
  // Collapse duplicate dates/amounts and strip generic labels ("Datum",
  // "Betrag") right after extraction, so stored results, the review card,
  // and the confirm payload all see clean entities.
  const analysis = cleanupAnalysisEntities(
    await runExtraction(
      fullOcrText,
      familyContext,
      makePartialAnalysisWriter(client, document.id),
    ),
  );

  // Snap the suggested category to the family's canonical spelling —
  // prevents "Rechnung"/"Rechnungen" drift and keeps the collection link
  // (documents.category === collection.name) intact.
  analysis.suggested_category = canonicalizeCategory(
    analysis.suggested_category,
    familyContext.categories,
    familyContext.collections ?? [],
  );

  // What the user typed and picked wins over what the model guesses.
  //
  // A note created inside a collection is pinned to that collection's
  // category at creation time (documents.category is set before analysis
  // runs). Preserve it instead of letting the LLM file the note somewhere
  // else — the user explicitly chose the collection. Manual notes are
  // created as `confirmed`, so the wasConfirmed check alone stopped
  // covering them and the model quietly re-filed pinned notes.
  const isManualNote = document.source === "manual";
  if (document.category && (isManualNote || !document.wasConfirmed)) {
    analysis.suggested_category = document.category;
  }

  // Same for the title, type and visible preview: on a note they are the user's own
  // input (the title field and the type dropdown in "Dokument anlegen"),
  // not something extracted from a scan. The model may still enrich tags,
  // dates, tasks and search data, but it must not replace the confirmed
  // text with a speculative summary such as "vermutlich ...".
  if (isManualNote) {
    if (document.title) analysis.title = document.title;
    analysis.summary =
      getManualNotePreview(fullOcrText, document.title) ?? document.title ?? "";
    if (document.document_type) {
      const userType = document.document_type;
      if ((DOCUMENT_TYPES as readonly string[]).includes(userType)) {
        analysis.document_type = userType as DocumentAnalysis["document_type"];
      }
    }
  }

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
    // Destructive: the prior entities/tasks/facts/edges may already be
    // deleted, so this document must stay visibly failed and retryable —
    // never be quietly restored to `confirmed`.
    throw new PipelineStepError(message, "DB_STORE_FAILED", {
      destructive: true,
    });
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
        partial_analysis: null,
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
      partial_analysis: null,
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
  const entityInserts: EntityInsert[] = buildEntityRows(analysis).map(
    (entity) => ({
      ...entity,
      document_id: documentId,
      family_id: familyId,
      confirmed: wasConfirmed,
    }),
  );

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
