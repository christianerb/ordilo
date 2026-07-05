import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import {
  chunkPages,
  generateEmbeddings,
  embeddingToVectorString,
  EmbeddingError,
  type PageContent,
} from "@/lib/ai/embeddings";
import {
  confirmPayloadSchema,
  CONFIRM_ALLOWED_SOURCE_STATUSES,
  NODE_TYPE_DOCUMENT,
  NODE_TYPE_PERSON,
  NODE_TYPE_ORGANIZATION,
  EDGE_RELATION_PERSON,
  EDGE_RELATION_ORGANIZATION,
  type ConfirmSuccessResponse,
  type ConfirmErrorResponse,
  type ConfirmPayload,
} from "@/lib/schemas/confirm";
import type { Database } from "@/types/database";

/**
 * POST /api/documents/[id]/confirm
 *
 * Confirms the (possibly edited) analysis of a document:
 *   1. Authenticate the user (requireUser → 401 if no session)
 *   2. Validate the document ID is a UUID
 *   3. Parse & validate the request body with Zod (confirm payload)
 *   4. Read the document (RLS-scoped) to check status and family_id
 *   5. If not found via RLS → check admin client: exists but not owned → 403;
 *      truly does not exist → 404 (VAL-CONFIRM-009)
 *   6. If status not "analyzed" → 409 (reject, per VAL-CONFIRM-010)
 *   7. Fetch OCR text with page numbers (from document_pages or
 *      documents.ocr_text fallback)
 *   8. Conditional atomic transition: UPDATE ... SET status='confirmed'
 *      WHERE status='analyzed' — prevents double-submit; 0 rows → 409
 *   9. Clear prior knowledge_edges, document_embeddings, and document
 *      knowledge_node for this document (idempotency, per VAL-CONFIRM-012)
 *  10. Create/reuse knowledge_nodes:
 *      - Document node (type="document", label=title, properties={document_id})
 *      - Person nodes (type="person", label=name) — reused if exists per family
 *      - Organization nodes (type="organization", label=name) — reused if exists
 *  11. Create knowledge_edges linking document node → person/org nodes
 *      (relation_type, source_document_id, confidence, confirmed=true)
 *  12. Chunk OCR text page-aware (~500-token chunks, ~50-token overlap)
 *  13. Generate embeddings via OpenAI text-embedding-3-small
 *  14. Store document_embeddings rows with vector(1536) and metadata
 *      including page_number provenance (VAL-CONFIRM-005)
 *  15. Update extracted_entities: confirmed=true (and replace with edited values)
 *  16. Update tasks: confirmed=true (and replace with edited values, delete removed)
 *  17. Return { status: "confirmed", document_id }
 *
 * Atomicity (VAL-CONFIRM-011):
 *   - The analyzed→confirmed transition is performed conditionally
 *     (UPDATE ... WHERE status='analyzed') as the first mutation, so
 *     a double-submit or concurrent request cannot both proceed (only
 *     one matches the WHERE clause; the other gets 0 rows → 409).
 *   - All subsequent graph/embedding/entity/task mutations happen after
 *     the conditional transition. If any step fails, the document is
 *     marked 'failed' (clearing confirmed_at) so no partial confirmed
 *     state persists.
 *
 * Idempotency (VAL-CONFIRM-012):
 *   - Prior edges, embeddings, and the document node are cleared before
 *     inserting new ones, so retrying confirm (e.g. after a failure that
 *     left the document in "failed" or after re-analyze) does not create
 *     duplicates.
 *   - Person and organization nodes are reused (find by family_id + type +
 *     label), so multiple documents referencing the same person share a
 *     single node.
 *   - DB uniqueness constraints on knowledge_nodes, knowledge_edges, and
 *     document_embeddings absorb any concurrent duplicate inserts.
 *
 * RLS: All queries use the server client (RLS-scoped), so a user who does
 * not own the document's family gets no row. The route then uses the admin
 * (service-role) client to distinguish existence from ownership: if the
 * document exists but belongs to another family → 403; only if the document
 * truly does not exist → 404. No knowledge graph mutations or OpenAI calls
 * are made for non-owned documents (VAL-CONFIRM-009).
 *
 * Edited payload (VAL-CONFIRM-008):
 *   - The route uses the edited values from the payload (changed person,
 *     category, date, deleted tasks) rather than re-reading the original
 *     extraction. Entities and tasks are replaced with the payload values.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  // 1. Authenticate --------------------------------------------------------
  const auth = await requireUser();
  if (auth.status) {
    const body: ConfirmErrorResponse = auth.json;
    return Response.json(body, { status: auth.status });
  }

  // 2. Parse document ID from the route params -----------------------------
  const { id: documentId } = await params;

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(documentId)) {
    const body: ConfirmErrorResponse = {
      error: "Ungültige Dokument-ID.",
      code: "INVALID_DOCUMENT_ID",
    };
    return Response.json(body, { status: 400 });
  }

  // 3. Parse & validate the request body -----------------------------------
  let payload: ConfirmPayload;
  try {
    const json = await request.json();
    const result = confirmPayloadSchema.safeParse(json);
    if (!result.success) {
      const issue = result.error.issues[0];
      const detail = issue
        ? `${issue.path.join(".")}: ${issue.message}`
        : "Validierungsfehler.";
      const body: ConfirmErrorResponse = {
        error: `Payload ungültig (${detail}).`,
        code: "INVALID_PAYLOAD",
      };
      return Response.json(body, { status: 400 });
    }
    payload = result.data;
  } catch {
    const body: ConfirmErrorResponse = {
      error: "Payload konnte nicht gelesen werden.",
      code: "INVALID_JSON",
    };
    return Response.json(body, { status: 400 });
  }

  const serverClient = await createServerClient();

  // 4. Read the document (RLS-scoped) --------------------------------------
  const { data: document, error: readError } = await serverClient
    .from("documents")
    .select("id, family_id, status, ocr_text, title")
    .eq("id", documentId)
    .maybeSingle();

  if (readError) {
    const body: ConfirmErrorResponse = {
      error: "Dokument konnte nicht geladen werden.",
      code: "DB_READ_FAILED",
    };
    return Response.json(body, { status: 500 });
  }

  // 5. Not found (or RLS blocked) → distinguish 403 vs 404 -----------------
  // The RLS-scoped read returns no row for both non-existent AND non-owned
  // documents. Use the admin (service-role) client to check whether the
  // document exists at all: if it exists but belongs to another family,
  // return a structured 403; only return 404 when the document truly
  // does not exist (VAL-CONFIRM-009). No mutations are performed in
  // either case.
  if (!document) {
    const adminClient = createAdminClient();
    const { data: existingDoc } = await adminClient
      .from("documents")
      .select("id")
      .eq("id", documentId)
      .maybeSingle();

    if (existingDoc) {
      // Document exists but belongs to another family → 403
      const body: ConfirmErrorResponse = {
        error: "Kein Zugriff auf dieses Dokument.",
        code: "FORBIDDEN",
      };
      return Response.json(body, { status: 403 });
    }

    // Document truly does not exist → 404
    const body: ConfirmErrorResponse = {
      error: "Dokument nicht gefunden.",
      code: "DOCUMENT_NOT_FOUND",
    };
    return Response.json(body, { status: 404 });
  }

  // 6. Check status — must be "analyzed" -----------------------------------
  if (!CONFIRM_ALLOWED_SOURCE_STATUSES.has(document.status)) {
    const body: ConfirmErrorResponse = {
      error: `Bestätigung kann für ein Dokument im Status „${document.status}" nicht durchgeführt werden.`,
      code: "INVALID_STATUS_TRANSITION",
    };
    return Response.json(body, { status: 409 });
  }

  const familyId = document.family_id;

  // 7. Fetch OCR text (with page numbers for provenance) -------------------
  const { data: pages, error: pagesError } = await serverClient
    .from("document_pages")
    .select("ocr_markdown, page_number")
    .eq("document_id", documentId)
    .order("page_number", { ascending: true });

  if (pagesError) {
    const body: ConfirmErrorResponse = {
      error: "OCR-Text konnte nicht geladen werden.",
      code: "DB_READ_FAILED",
    };
    return Response.json(body, { status: 500 });
  }

  // Build page-aware content for embedding chunking.
  // Each non-empty page's markdown is chunked separately so that every
  // embedding row carries its originating page_number in metadata_json
  // (VAL-CONFIRM-005).
  const pageContents: PageContent[] = (pages ?? [])
    .filter((p) => p.ocr_markdown && p.ocr_markdown.trim())
    .map((p) => ({
      text: p.ocr_markdown!,
      page_number: p.page_number,
    }));

  // Fallback: if no page markdown is available, use documents.ocr_text
  // as a single "page" (page_number = 1) so embeddings are still generated.
  if (pageContents.length === 0) {
    const fallbackText = (document.ocr_text ?? "").trim();
    if (fallbackText) {
      pageContents.push({ text: fallbackText, page_number: 1 });
    }
  }

  // 8. Conditional atomic transition: analyzed → confirmed -----------------
  // This single UPDATE atomically checks the current status AND transitions
  // to 'confirmed'. Only a document in 'analyzed' state can be transitioned.
  // If a concurrent request changed the status between our read (step 4)
  // and this update, the update matches 0 rows → 409.
  //
  // This is the double-submit guard: two concurrent confirm requests
  // cannot both transition the same document (VAL-CONFIRM-011,
  // VAL-CONFIRM-012).
  const { data: transitioned, error: transitionError } = await serverClient
    .from("documents")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      title: payload.title,
      summary: payload.summary,
      document_type: payload.document_type,
      category: payload.suggested_category,
      error_message: null,
    })
    .eq("id", documentId)
    .eq("status", "analyzed")
    .select("id")
    .maybeSingle();

  if (transitionError) {
    const body: ConfirmErrorResponse = {
      error: "Status konnte nicht aktualisiert werden.",
      code: "DB_UPDATE_FAILED",
    };
    return Response.json(body, { status: 500 });
  }

  if (!transitioned) {
    // A concurrent request changed the status between our read and the
    // atomic transition. Return 409.
    const body: ConfirmErrorResponse = {
      error: "Der Dokument-Status hat sich geändert. Bitte erneut versuchen.",
      code: "STATUS_CHANGED",
    };
    return Response.json(body, { status: 409 });
  }

  // 9-15. Perform the confirm operations -----------------------------------
  // All graph/embedding/entity/task mutations happen AFTER the conditional
  // transition. If any step fails, the document is marked 'failed' so no
  // partial confirmed state persists (VAL-CONFIRM-011). On retry (after
  // re-analyze), the clear-before-insert pattern + uniqueness constraints
  // ensure no duplicates (VAL-CONFIRM-012).
  try {
    // 9. Clear prior edges, embeddings, and document node (idempotency) --
    await clearPriorGraphData(serverClient, documentId);

    // 10-11. Create knowledge graph (nodes + edges) ----------------------
    await createKnowledgeGraph(
      serverClient,
      familyId,
      documentId,
      payload,
    );

    // 12-13. Generate and store page-aware embeddings --------------------
    if (pageContents.length > 0) {
      await generateAndStoreEmbeddings(
        serverClient,
        familyId,
        documentId,
        pageContents,
      );
    }

    // 14-15. Update entities and tasks ------------------------------------
    await updateEntitiesAndTasks(
      serverClient,
      familyId,
      documentId,
      payload,
    );

    // 16. Success ---------------------------------------------------------
    const body: ConfirmSuccessResponse = {
      status: "confirmed",
      document_id: documentId,
    };
    return Response.json(body, { status: 200 });
  } catch (err) {
    const isEmbeddingError = err instanceof EmbeddingError;
    const message = err instanceof Error
      ? err.message
      : "Bestätigung fehlgeschlagen. Bitte erneut versuchen.";
    const code = isEmbeddingError
      ? (err as EmbeddingError).code
      : err instanceof Error
        ? "CONFIRM_FAILED"
        : "UNKNOWN_ERROR";

    await markFailed(serverClient, documentId, message);

    const statusCode =
      isEmbeddingError && err instanceof EmbeddingError
        ? err.statusCode &&
          err.statusCode >= 400 &&
          err.statusCode < 500
          ? err.statusCode
          : 502
        : 500;

    const body: ConfirmErrorResponse = { error: message, code };
    return Response.json(body, { status: statusCode });
  }
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Clear prior knowledge_edges and document_embeddings for a document.
 *
 * This ensures idempotency: if the user retries confirm (e.g. after a
 * prior failure that left partial data), no duplicate edges or embeddings
 * are created. Person and organization nodes are NOT deleted here — they
 * may be shared across documents and are reused by the knowledge graph
 * creation step.
 *
 * The document node is also deleted so a fresh one is created (with the
 * possibly edited title as label).
 */
async function clearPriorGraphData(
  client: Awaited<ReturnType<typeof createServerClient>>,
  documentId: string,
): Promise<void> {
  // Delete knowledge_edges for this document.
  const { error: edgesError } = await client
    .from("knowledge_edges")
    .delete()
    .eq("source_document_id", documentId);

  if (edgesError) {
    throw new Error("Vorherige Wissensgraph-Kanten konnten nicht gelöscht werden.");
  }

  // Delete document_embeddings for this document.
  const { error: embeddingsError } = await client
    .from("document_embeddings")
    .delete()
    .eq("document_id", documentId);

  if (embeddingsError) {
    throw new Error("Vorherige Embeddings konnten nicht gelöscht werden.");
  }

  // Delete the document's knowledge node (type="document").
  // Person and organization nodes are NOT deleted — they may be shared.
  const { error: nodeError } = await client
    .from("knowledge_nodes")
    .delete()
    .eq("type", NODE_TYPE_DOCUMENT)
    .eq("properties_json->>document_id", documentId);

  // Note: if no document node exists yet (first confirm), this deletes 0
  // rows, which is not an error.
  if (nodeError) {
    throw new Error("Vorheriger Dokument-Knoten konnte nicht gelöscht werden.");
  }
}

/**
 * Create the knowledge graph for the confirmed document.
 *
 * Steps:
 *   1. Create a document node (type="document", label=title)
 *   2. For each person in the payload: find or create a person node
 *      (type="person", label=name) — reused if exists per family
 *   3. For each organization: find or create an org node
 *      (type="organization", label=name) — reused if exists
 *   4. Create edges: document node → person nodes (relation="mentions")
 *      document node → organization nodes (relation="mentions")
 *
 * @returns The document node's UUID (used for edge creation).
 */
async function createKnowledgeGraph(
  client: Awaited<ReturnType<typeof createServerClient>>,
  familyId: string,
  documentId: string,
  payload: ConfirmPayload,
): Promise<string> {
  type NodeInsert = Database["public"]["Tables"]["knowledge_nodes"]["Insert"];
  type EdgeInsert = Database["public"]["Tables"]["knowledge_edges"]["Insert"];

  // 1. Create the document node --------------------------------------------
  const documentNodeLabel = payload.title || "Dokument";
  const documentNodeInsert: NodeInsert = {
    family_id: familyId,
    type: NODE_TYPE_DOCUMENT,
    label: documentNodeLabel,
    properties_json: { document_id: documentId },
  };

  const { data: documentNode, error: documentNodeError } = await client
    .from("knowledge_nodes")
    .insert(documentNodeInsert)
    .select("id")
    .single();

  if (documentNodeError || !documentNode) {
    throw new Error("Dokument-Knoten konnte nicht erstellt werden.");
  }

  const documentNodeId = documentNode.id;

  // 2-3. Find or create person and organization nodes ---------------------
  const edgeInserts: EdgeInsert[] = [];

  // Person nodes.
  for (const member of payload.family_members) {
    const personNode = await findOrCreateNode(
      client,
      familyId,
      NODE_TYPE_PERSON,
      member.name,
      member.person_id ? { person_id: member.person_id } : {},
    );

    edgeInserts.push({
      family_id: familyId,
      source_node_id: documentNodeId,
      target_node_id: personNode.id,
      relation_type: EDGE_RELATION_PERSON,
      confidence: member.confidence,
      source_document_id: documentId,
      confirmed: true,
    });
  }

  // Organization nodes.
  for (const org of payload.organizations) {
    const orgNode = await findOrCreateNode(
      client,
      familyId,
      NODE_TYPE_ORGANIZATION,
      org.name,
      { organization_type: org.type },
    );

    edgeInserts.push({
      family_id: familyId,
      source_node_id: documentNodeId,
      target_node_id: orgNode.id,
      relation_type: EDGE_RELATION_ORGANIZATION,
      confidence: org.confidence,
      source_document_id: documentId,
      confirmed: true,
    });
  }

  // 4. Insert all edges ----------------------------------------------------
  if (edgeInserts.length > 0) {
    const { error: edgesError } = await client
      .from("knowledge_edges")
      .insert(edgeInserts);

    if (edgesError) {
      throw new Error("Wissensgraph-Kanten konnten nicht erstellt werden.");
    }
  }

  return documentNodeId;
}

/**
 * Find an existing knowledge node by family_id, type, and label, or
 * create a new one if none exists.
 *
 * This ensures no duplicate person/organization nodes per family —
 * multiple documents referencing "Emma" share a single person node.
 *
 * @returns The node's UUID.
 */
async function findOrCreateNode(
  client: Awaited<ReturnType<typeof createServerClient>>,
  familyId: string,
  type: string,
  label: string,
  properties: Record<string, unknown>,
): Promise<{ id: string }> {
  // Try to find an existing node.
  const { data: existing, error: findError } = await client
    .from("knowledge_nodes")
    .select("id")
    .eq("family_id", familyId)
    .eq("type", type)
    .eq("label", label)
    .maybeSingle();

  if (findError) {
    throw new Error(`Knoten konnte nicht gesucht werden (${type}).`);
  }

  if (existing) {
    return existing;
  }

  // Create a new node.
  type NodeInsert = Database["public"]["Tables"]["knowledge_nodes"]["Insert"];
  const nodeInsert: NodeInsert = {
    family_id: familyId,
    type,
    label,
    properties_json: properties,
  };

  const { data: created, error: createError } = await client
    .from("knowledge_nodes")
    .insert(nodeInsert)
    .select("id")
    .single();

  if (createError || !created) {
    throw new Error(`Knoten konnte nicht erstellt werden (${type}: ${label}).`);
  }

  return created;
}

/**
 * Chunk page-aware OCR text, generate embeddings via OpenAI, and store
 * them in document_embeddings.
 *
 * Each page's text is chunked independently (~500-token chunks with
 * ~50-token overlap) so that every embedding row carries its originating
 * page_number in metadata_json, preserving page provenance for
 * page-aware search results (VAL-CONFIRM-005).
 *
 * Each chunk is embedded with text-embedding-3-small (1536 dimensions)
 * and stored with metadata containing document_id, page_number, and
 * chunk index.
 */
async function generateAndStoreEmbeddings(
  client: Awaited<ReturnType<typeof createServerClient>>,
  familyId: string,
  documentId: string,
  pages: PageContent[],
): Promise<void> {
  // Chunk each page separately, preserving page_number provenance.
  const chunks = chunkPages(pages);

  if (chunks.length === 0) return;

  // Generate embeddings for all chunks.
  const embeddings = await generateEmbeddings(chunks);

  // Build insert rows with page_number in metadata_json.
  type EmbeddingInsert =
    Database["public"]["Tables"]["document_embeddings"]["Insert"];
  const embeddingInserts: EmbeddingInsert[] = chunks.map((chunk, i) => ({
    document_id: documentId,
    family_id: familyId,
    chunk_text: chunk.text,
    embedding: embeddingToVectorString(embeddings[i]),
    metadata_json: {
      document_id: documentId,
      page_number: chunk.page_number,
      chunk_index: chunk.index,
      chunk_total: chunks.length,
    },
  }));

  // Insert all embedding rows.
  const { error: insertError } = await client
    .from("document_embeddings")
    .insert(embeddingInserts);

  if (insertError) {
    throw new Error("Embeddings konnten nicht gespeichert werden.");
  }
}

/**
 * Update extracted_entities and tasks for the document.
 *
 * Steps:
 *   1. Delete all existing extracted_entities for the document.
 *   2. Re-insert from the payload with confirmed=true (edited values).
 *   3. Delete all existing tasks for the document.
 *   4. Re-insert from the payload with confirmed=true (edited values,
 *      deleted tasks excluded).
 *
 * This replaces the original extraction with the user-confirmed values,
 * ensuring the database matches what the user actually confirmed.
 */
async function updateEntitiesAndTasks(
  client: Awaited<ReturnType<typeof createServerClient>>,
  familyId: string,
  documentId: string,
  payload: ConfirmPayload,
): Promise<void> {
  // 1. Delete existing entities.
  const { error: entitiesDeleteError } = await client
    .from("extracted_entities")
    .delete()
    .eq("document_id", documentId);

  if (entitiesDeleteError) {
    throw new Error("Vorherige Entitäten konnten nicht gelöscht werden.");
  }

  // 2. Re-insert entities from the payload with confirmed=true.
  type EntityInsert = Database["public"]["Tables"]["extracted_entities"]["Insert"];
  const entityInserts: EntityInsert[] = [];

  // Persons.
  for (const member of payload.family_members) {
    entityInserts.push({
      document_id: documentId,
      family_id: familyId,
      entity_type: "person",
      entity_value: member.name,
      normalized_value: member.name.toLowerCase().trim(),
      confidence: member.confidence,
      confirmed: true,
      linked_object_id: member.person_id ?? null,
    });
  }

  // Organizations.
  for (const org of payload.organizations) {
    entityInserts.push({
      document_id: documentId,
      family_id: familyId,
      entity_type: "organization",
      entity_value: org.name,
      normalized_value: org.name.toLowerCase().trim(),
      confidence: org.confidence,
      confirmed: true,
    });
  }

  // Dates.
  for (const date of payload.dates) {
    entityInserts.push({
      document_id: documentId,
      family_id: familyId,
      entity_type: "date",
      entity_value: date.date,
      normalized_value: date.date,
      confidence: date.confidence,
      confirmed: true,
    });
  }

  // Amounts.
  for (const amount of payload.amounts) {
    entityInserts.push({
      document_id: documentId,
      family_id: familyId,
      entity_type: "amount",
      entity_value: `${amount.amount} ${amount.currency}`.trim(),
      normalized_value: amount.amount,
      confidence: amount.confidence,
      confirmed: true,
    });
  }

  // Category.
  if (payload.suggested_category) {
    entityInserts.push({
      document_id: documentId,
      family_id: familyId,
      entity_type: "category",
      entity_value: payload.suggested_category,
      normalized_value: payload.suggested_category.toLowerCase().trim(),
      confidence: 1.0,
      confirmed: true,
    });
  }

  // Tags.
  for (const tag of payload.tags) {
    entityInserts.push({
      document_id: documentId,
      family_id: familyId,
      entity_type: "tag",
      entity_value: tag,
      normalized_value: tag.toLowerCase().trim(),
      confidence: 1.0,
      confirmed: true,
    });
  }

  if (entityInserts.length > 0) {
    const { error: entitiesInsertError } = await client
      .from("extracted_entities")
      .insert(entityInserts);

    if (entitiesInsertError) {
      throw new Error("Bestätigte Entitäten konnten nicht gespeichert werden.");
    }
  }

  // 3. Delete existing tasks.
  const { error: tasksDeleteError } = await client
    .from("tasks")
    .delete()
    .eq("document_id", documentId);

  if (tasksDeleteError) {
    throw new Error("Vorherige Aufgaben konnten nicht gelöscht werden.");
  }

  // 4. Re-insert tasks from the payload with confirmed=true.
  // Deleted tasks are already excluded from the payload's tasks array.
  type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];
  const taskInserts: TaskInsert[] = payload.tasks.map((task) => ({
    family_id: familyId,
    document_id: documentId,
    title: task.title,
    due_date: task.due_date ?? null,
    priority: task.priority,
    status: "open",
    confidence: task.confidence,
    confirmed: true,
  }));

  if (taskInserts.length > 0) {
    const { error: tasksInsertError } = await client
      .from("tasks")
      .insert(taskInserts);

    if (tasksInsertError) {
      throw new Error("Bestätigte Aufgaben konnten nicht gespeichert werden.");
    }
  }
}

/**
 * Mark a document as failed with an error message.
 *
 * Also clears confirmed_at so that a failed confirm (which may have set
 * confirmed_at during the conditional transition) does not leave a
 * stale confirmed_at value on a failed document.
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
        confirmed_at: null,
      })
      .eq("id", documentId);
  } catch {
    // Best-effort.
  }
}

/**
 * GET /api/documents/[id]/confirm — method not allowed.
 */
export async function GET(): Promise<Response> {
  const body: ConfirmErrorResponse = {
    error: "Methode nicht erlaubt. Bitte POST verwenden.",
    code: "METHOD_NOT_ALLOWED",
  };
  return Response.json(body, { status: 405 });
}
