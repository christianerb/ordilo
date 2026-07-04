import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { runExtraction, ExtractionError } from "@/lib/ai/extraction";
import { ANALYZE_ALLOWED_SOURCE_STATUSES } from "@/lib/schemas/document";
import {
  computeNeedsUserReview,
  type DocumentAnalysis,
  type FamilyContext,
  type AnalyzeSuccessResponse,
  type AnalyzeErrorResponse,
} from "@/lib/schemas/extraction";
import type { Database } from "@/types/database";

/**
 * POST /api/documents/[id]/analyze
 *
 * Triggers LLM extraction for a document:
 *   1. Authenticate the user (requireUser → 401 if no session)
 *   2. Validate the document ID is a UUID
 *   3. Read the document (RLS-scoped) to check status and get family_id
 *   4. If not found → 404 (not 403, to avoid leaking existence)
 *   5. If status not in allowed set (ocr_done, analyzed, confirmed, failed) → 409
 *   6. Fetch OCR markdown from document_pages; if empty → 400 error (no OpenAI call)
 *   7. Atomically transition to `analyzing` (conditional on allowed source status)
 *   8. Fetch family context (family_members, existing categories, knowledge_nodes)
 *   9. Call OpenAI GPT-4.1 Mini with strict json_schema
 *  10. Validate response with Zod
 *  11. Compute needs_user_review based on confidence thresholds
 *  12. Clear prior extracted_entities and tasks (re-analyze support)
 *      — if from `confirmed`, also clear knowledge_edges and document_embeddings
 *  13. Store new extracted_entities rows (one per entity)
 *  14. Store new tasks rows
 *  15. Update document: status=analyzed, title, summary, document_type, category
 *  16. Return the full analysis JSON for the Review Card
 *
 * Failure handling:
 *   - If OpenAI fails, Zod validation fails, or a DB error occurs → set
 *     status to `failed` with error_message, return structured error.
 *   - The OPENAI_API_KEY is never exposed to the client.
 *
 * RLS: All queries use the server client (RLS-scoped), so a user who does
 * not own the document's family gets a 404 (not 403, to avoid leaking
 * existence). No OpenAI call is made for non-owned documents.
 *
 * Re-analyze: When the document is already in `analyzed` or `confirmed`
 * status, the route clears prior extracted_entities and tasks before
 * storing new results (no duplicates). When coming from `confirmed`,
 * knowledge_edges and document_embeddings are also cleared (they will be
 * regenerated on the next confirm).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  // 1. Authenticate --------------------------------------------------------
  const auth = await requireUser();
  if (auth.status) {
    const body: AnalyzeErrorResponse = auth.json;
    return Response.json(body, { status: auth.status });
  }

  // 2. Parse document ID from the route params -----------------------------
  const { id: documentId } = await params;

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(documentId)) {
    const body: AnalyzeErrorResponse = {
      error: "Ungültige Dokument-ID.",
      code: "INVALID_DOCUMENT_ID",
    };
    return Response.json(body, { status: 400 });
  }

  const serverClient = await createServerClient();

  // 3. Read the document (RLS-scoped) to check status and family_id --------
  const { data: document, error: readError } = await serverClient
    .from("documents")
    .select("id, family_id, status, ocr_text")
    .eq("id", documentId)
    .maybeSingle();

  if (readError) {
    const body: AnalyzeErrorResponse = {
      error: "Dokument konnte nicht geladen werden.",
      code: "DB_READ_FAILED",
    };
    return Response.json(body, { status: 500 });
  }

  // 4. Not found (or RLS blocked) → 404 -----------------------------------
  if (!document) {
    const body: AnalyzeErrorResponse = {
      error: "Dokument nicht gefunden oder kein Zugriff.",
      code: "DOCUMENT_NOT_FOUND",
    };
    return Response.json(body, { status: 404 });
  }

  // 5. Check status — must be in allowed source set -----------------------
  if (!ANALYZE_ALLOWED_SOURCE_STATUSES.has(document.status)) {
    const body: AnalyzeErrorResponse = {
      error: `Analyse kann für ein Dokument im Status „${document.status}" nicht gestartet werden.`,
      code: "INVALID_STATUS_TRANSITION",
    };
    return Response.json(body, { status: 409 });
  }

  // Record the previous status so we can detect re-analyze from `confirmed`.
  const wasConfirmed = document.status === "confirmed";

  // 6. Fetch OCR markdown from document_pages ------------------------------
  const { data: pages, error: pagesError } = await serverClient
    .from("document_pages")
    .select("ocr_markdown")
    .eq("document_id", documentId)
    .order("page_number", { ascending: true });

  if (pagesError) {
    const body: AnalyzeErrorResponse = {
      error: "OCR-Text konnte nicht geladen werden.",
      code: "DB_READ_FAILED",
    };
    return Response.json(body, { status: 500 });
  }

  // Concatenate page markdown into full OCR text.
  const pageMarkdowns = (pages ?? [])
    .map((p) => p.ocr_markdown)
    .filter((md): md is string => Boolean(md && md.trim()));
  const ocrMarkdown = pageMarkdowns.join("\n\n");

  // Also fall back to documents.ocr_text if page markdowns are empty.
  const fullOcrText =
    ocrMarkdown.trim() || (document.ocr_text ?? "").trim();

  // If no OCR text is available, return an error without calling OpenAI.
  if (!fullOcrText) {
    const body: AnalyzeErrorResponse = {
      error: "Kein OCR-Text vorhanden. Bitte zuerst OCR durchführen.",
      code: "NO_OCR_TEXT",
    };
    return Response.json(body, { status: 400 });
  }

  // 7. Atomic transition to `analyzing` -----------------------------------
  // Conditional on the status being in the allowed set. If a concurrent
  // request changed the status between our read (step 3) and this update,
  // the update matches 0 rows → 409.
  const { data: transitioned, error: transitionError } = await serverClient
    .from("documents")
    .update({
      status: "analyzing",
      error_message: null,
    })
    .eq("id", documentId)
    .in("status", [...ANALYZE_ALLOWED_SOURCE_STATUSES])
    .select("id")
    .maybeSingle();

  if (transitionError) {
    const body: AnalyzeErrorResponse = {
      error: "Status konnte nicht aktualisiert werden.",
      code: "DB_UPDATE_FAILED",
    };
    return Response.json(body, { status: 500 });
  }

  if (!transitioned) {
    // A concurrent request changed the status between our read and the
    // atomic transition. Return 409.
    const body: AnalyzeErrorResponse = {
      error: "Der Dokument-Status hat sich geändert. Bitte erneut versuchen.",
      code: "STATUS_CHANGED",
    };
    return Response.json(body, { status: 409 });
  }

  // 8. Fetch family context ------------------------------------------------
  const familyContext = await fetchFamilyContext(
    serverClient,
    document.family_id,
  );

  // 9. Call OpenAI extraction ----------------------------------------------
  let analysis: DocumentAnalysis;
  try {
    analysis = await runExtraction(fullOcrText, familyContext);
  } catch (err) {
    const isExtractionError = err instanceof ExtractionError;
    const message = isExtractionError
      ? err.message
      : "Analyse ist fehlgeschlagen. Bitte erneut versuchen.";
    const code = isExtractionError ? err.code : "EXTRACTION_FAILED";

    await markFailed(serverClient, documentId, message);

    const statusCode =
      isExtractionError && err instanceof ExtractionError
        ? err.statusCode &&
          err.statusCode >= 400 &&
          err.statusCode < 500
          ? err.statusCode
          : 502
        : 500;

    const body: AnalyzeErrorResponse = { error: message, code };
    return Response.json(body, { status: statusCode });
  }

  // 10. Compute needs_user_review based on confidence thresholds ----------
  // Override the LLM's self-assessment with our deterministic threshold.
  analysis.needs_user_review = computeNeedsUserReview(analysis);

  // 11-14. Store results --------------------------------------------------
  try {
    await storeExtractionResults(
      serverClient,
      documentId,
      document.family_id,
      analysis,
      wasConfirmed,
    );
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Ergebnisse konnten nicht gespeichert werden.";
    const code = err instanceof Error ? "DB_STORE_FAILED" : "EXTRACTION_FAILED";

    await markFailed(serverClient, documentId, message);

    const body: AnalyzeErrorResponse = { error: message, code };
    return Response.json(body, { status: 500 });
  }

  // 15. Update document status to analyzed --------------------------------
  const { error: updateError } = await serverClient
    .from("documents")
    .update({
      status: "analyzed",
      title: analysis.title,
      summary: analysis.summary,
      document_type: analysis.document_type,
      category: analysis.suggested_category,
      error_message: null,
    })
    .eq("id", documentId);

  if (updateError) {
    await markFailed(serverClient, documentId, "Dokument-Status konnte nicht aktualisiert werden.");

    const body: AnalyzeErrorResponse = {
      error: "Dokument-Status konnte nicht aktualisiert werden.",
      code: "DB_UPDATE_FAILED",
    };
    return Response.json(body, { status: 500 });
  }

  // 16. Return the full analysis JSON -------------------------------------
  const body: AnalyzeSuccessResponse = {
    ...analysis,
    document_id: documentId,
    status: "analyzed",
  };
  return Response.json(body, { status: 200 });
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Fetch the family context for the LLM system prompt.
 *
 * Queries:
 *   - family_members: name, role (for person matching)
 *   - documents: distinct categories (for category suggestions)
 *   - knowledge_nodes: type, label (for organization matching)
 *
 * All queries are RLS-scoped via the server client.
 */
async function fetchFamilyContext(
  client: Awaited<ReturnType<typeof createServerClient>>,
  familyId: string,
): Promise<FamilyContext> {
  // Fetch family members.
  const { data: members, error: membersError } = await client
    .from("family_members")
    .select("id, name, role")
    .eq("family_id", familyId)
    .order("created_at", { ascending: true });

  if (membersError) {
    throw new Error("Familienmitglieder konnten nicht geladen werden.");
  }

  // Fetch existing categories (distinct, non-null).
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

  // Fetch knowledge nodes.
  const { data: nodes, error: nodesError } = await client
    .from("knowledge_nodes")
    .select("type, label")
    .eq("family_id", familyId)
    .order("created_at", { ascending: true });

  if (nodesError) {
    throw new Error("Wissensknoten konnten nicht geladen werden.");
  }

  return {
    members: (members ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
    })),
    categories,
    knowledgeNodes: (nodes ?? []).map((n) => ({
      type: n.type,
      label: n.label,
    })),
  };
}

/**
 * Store the extraction results in the database.
 *
 * Steps:
 *   1. Clear prior extracted_entities and tasks for the document (re-analyze).
 *      If the document was previously confirmed, also clear knowledge_edges
 *      and document_embeddings.
 *   2. Insert new extracted_entities rows (one per entity).
 *   3. Insert new tasks rows.
 *
 * @throws {Error} if any DB operation fails.
 */
async function storeExtractionResults(
  client: Awaited<ReturnType<typeof createServerClient>>,
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

  // If re-analyzing from confirmed, also clear knowledge graph + embeddings.
  if (wasConfirmed) {
    const { error: edgesDeleteError } = await client
      .from("knowledge_edges")
      .delete()
      .eq("source_document_id", documentId);

    if (edgesDeleteError) {
      throw new Error("Wissensgraph-Kanten konnten nicht gelöscht werden.");
    }

    const { error: embeddingsDeleteError } = await client
      .from("document_embeddings")
      .delete()
      .eq("document_id", documentId);

    if (embeddingsDeleteError) {
      throw new Error("Embeddings konnten nicht gelöscht werden.");
    }
  }

  // 2. Insert new extracted_entities rows ----------------------------------
  type EntityInsert = Database["public"]["Tables"]["extracted_entities"]["Insert"];
  const entityInserts: EntityInsert[] = [];

  // Family members → person entities.
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

  // Organizations → organization entities.
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

  // Dates → date entities.
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

  // Amounts → amount entities.
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

  // Suggested category → category entity.
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

  // Tags → tag entities.
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

  // Insert all entities (batch).
  if (entityInserts.length > 0) {
    const { error: entitiesInsertError } = await client
      .from("extracted_entities")
      .insert(entityInserts);

    if (entitiesInsertError) {
      throw new Error("Entitäten konnten nicht gespeichert werden.");
    }
  }

  // 3. Insert new tasks rows -----------------------------------------------
  type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];
  const taskInserts: TaskInsert[] = analysis.tasks.map((task) => ({
    family_id: familyId,
    document_id: documentId,
    title: task.title,
    due_date: task.due_date ?? null,
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
}

/**
 * Mark a document as failed with an error message.
 *
 * Best-effort: errors are silently ignored so we don't mask the primary
 * error with a secondary DB error.
 */
async function markFailed(
  client: Awaited<ReturnType<typeof createServerClient>>,
  documentId: string,
  errorMessage: string,
): Promise<void> {
  try {
    await client
      .from("documents")
      .update({
        status: "failed",
        error_message: errorMessage,
      })
      .eq("id", documentId);
  } catch {
    // Best-effort.
  }
}

/**
 * GET /api/documents/[id]/analyze — method not allowed.
 */
export async function GET(): Promise<Response> {
  const body: AnalyzeErrorResponse = {
    error: "Methode nicht erlaubt. Bitte POST verwenden.",
    code: "METHOD_NOT_ALLOWED",
  };
  return Response.json(body, { status: 405 });
}
