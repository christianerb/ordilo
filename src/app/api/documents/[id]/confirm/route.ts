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
  type ConfirmSuccessResponse,
  type ConfirmErrorResponse,
  type ConfirmPayload,
} from "@/lib/schemas/confirm";
import type {
  ConfirmRpcPerson,
  ConfirmRpcOrganization,
  ConfirmRpcEmbedding,
  ConfirmRpcEntity,
  ConfirmRpcTask,
  ConfirmRpcResult,
} from "@/types/database";

/**
 * POST /api/documents/[id]/confirm
 *
 * Confirms the (possibly edited) analysis of a document atomically within a
 * single Postgres transaction (VAL-CONFIRM-011, VAL-CONFIRM-012).
 *
 * Flow:
 *   1. Authenticate the user (requireUser → 401 if no session)
 *   2. Validate the document ID is a UUID
 *   3. Parse & validate the request body with Zod (confirm payload)
 *   4. Read the document (RLS-scoped) to check status and family_id
 *   5. If not found via RLS → check admin client: exists but not owned → 403;
 *      truly does not exist → 404 (VAL-CONFIRM-009)
 *   6. If status not "analyzed" → 409 (reject, per VAL-CONFIRM-010, before
 *      any external OpenAI call)
 *   7. Fetch OCR text with page numbers (from document_pages or
 *      documents.ocr_text fallback)
 *   8. Generate embeddings via OpenAI FIRST (external call, OUTSIDE the DB
 *      transaction). On failure → mark document failed + structured error
 *      (no DB mutations have happened yet, so no partial state).
 *   9. Build the RPC parameters (persons, organizations, precomputed
 *      embeddings, entities, tasks as JSONB arrays).
 *  10. Call the `confirm_document` RPC via supabase.rpc(...). The RPC
 *      performs, within a single Postgres transaction:
 *        - Conditional analyzed→confirmed transition (returns 'status_changed'
 *          without mutating if the row is not 'analyzed' — double-submit /
 *          concurrent transition guard)
 *        - Clears prior knowledge_edges / document_embeddings / document node
 *        - UPSERTs person/organization knowledge_nodes (ON CONFLICT DO
 *          UPDATE so concurrent confirms converge on the same node)
 *        - Creates the document node + knowledge_edges
 *        - Inserts the precomputed document_embeddings (page_number in
 *          metadata_json — VAL-CONFIRM-005)
 *        - Replaces extracted_entities (confirmed=true)
 *        - Replaces tasks (confirmed=true)
 *      On any failure the transaction rolls back — no partial graph,
 *      embedding, entity, or task state persists (VAL-CONFIRM-011).
 *  11. Inspect the RPC result:
 *        - "confirmed"   → 200 { status, document_id }
 *        - "status_changed" → 409 STATUS_CHANGED (no markFailed; the document
 *          was likely confirmed by a concurrent request)
 *        - RPC error      → mark document failed + structured error
 *
 * Atomicity (VAL-CONFIRM-011):
 *   All DB mutations happen inside the single RPC call, which runs in one
 *   Postgres transaction. If any statement inside the RPC fails, the entire
 *   transaction rolls back (status reverts to 'analyzed', no partial
 *   graph/embedding/entity/task rows). The route then marks the document
 *   'failed' (clearing confirmed_at) so the user can retry.
 *
 * Concurrency / idempotency (VAL-CONFIRM-012):
 *   - The conditional transition (UPDATE ... WHERE status='analyzed') inside
 *     the RPC ensures a double-submit or concurrent request cannot both
 *     proceed; the second sees 0 rows → 'status_changed' → 409.
 *   - Person/organization nodes are upserted with ON CONFLICT DO UPDATE, so
 *     concurrent confirms referencing the same person converge on the same
 *     node instead of one failing on the unique constraint.
 *   - Prior edges/embeddings/document node are cleared before inserting new
 *     ones, so retrying confirm (e.g. after re-analyze) does not create
 *     duplicates.
 *
 * RLS: All queries use the server client (RLS-scoped), so a user who does
 * not own the document's family gets no row. The route then uses the admin
 * (service-role) client to distinguish existence from ownership: if the
 * document exists but belongs to another family → 403; only if the document
 * truly does not exist → 404. The RPC is invoked via the server client, so
 * RLS is enforced inside the function as defence-in-depth (VAL-CONFIRM-009).
 *
 * Edited payload (VAL-CONFIRM-008):
 *   The route uses the edited values from the payload (changed person,
 *   category, date, deleted tasks) rather than re-reading the original
 *   extraction. Entities and tasks are built from the payload and passed to
 *   the RPC.
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
  // This early check avoids making an external OpenAI embeddings call for a
  // document that cannot be confirmed (e.g. already confirmed or failed).
  // The RPC re-checks the status conditionally as a double-submit guard.
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

  // 8. Generate embeddings via OpenAI FIRST (outside the DB transaction) --
  // The external OpenAI call cannot be part of the Postgres transaction, so
  // it happens before the RPC. If it fails, no DB mutations have occurred
  // yet → no partial state. We mark the document failed and return a
  // structured error.
  const chunks = chunkPages(pageContents);
  let embeddings: number[][] = [];
  if (chunks.length > 0) {
    try {
      embeddings = await generateEmbeddings(chunks);
    } catch (err) {
      const isEmbeddingError = err instanceof EmbeddingError;
      const message = err instanceof Error
        ? err.message
        : "Embedding-Erzeugung fehlgeschlagen.";
      const code = isEmbeddingError
        ? (err as EmbeddingError).code
        : "EMBEDDING_FAILED";
      const statusCode =
        isEmbeddingError &&
        err instanceof EmbeddingError &&
        err.statusCode &&
        err.statusCode >= 400 &&
        err.statusCode < 500
          ? err.statusCode
          : 502;

      await markFailed(serverClient, documentId, message);

      const body: ConfirmErrorResponse = { error: message, code };
      return Response.json(body, { status: statusCode });
    }
  }

  // 9. Build the RPC parameters --------------------------------------------
  const personsParam: ConfirmRpcPerson[] = payload.family_members.map(
    (member) => ({
      name: member.name,
      person_id: member.person_id ?? null,
      confidence: member.confidence,
    }),
  );

  const organizationsParam: ConfirmRpcOrganization[] =
    payload.organizations.map((org) => ({
      name: org.name,
      type: org.type,
      confidence: org.confidence,
    }));

  const embeddingsParam: ConfirmRpcEmbedding[] = chunks.map((chunk, i) => ({
    chunk_text: chunk.text,
    embedding: embeddingToVectorString(embeddings[i]),
    page_number: chunk.page_number,
    chunk_index: chunk.index,
    chunk_total: chunks.length,
  }));

  const entitiesParam: ConfirmRpcEntity[] = buildEntityRows(payload);
  const tasksParam: ConfirmRpcTask[] = buildTaskRows(payload);

  // 10. Call the confirm_document RPC (single transaction) -----------------
  const { data: rpcResult, error: rpcError } = await serverClient.rpc(
    "confirm_document",
    {
      p_document_id: documentId,
      p_family_id: familyId,
      p_title: payload.title,
      p_summary: payload.summary,
      p_document_type: payload.document_type,
      p_category: payload.suggested_category,
      p_persons: personsParam,
      p_organizations: organizationsParam,
      p_embeddings: embeddingsParam,
      p_entities: entitiesParam,
      p_tasks: tasksParam,
    },
  );

  // 11. Handle the RPC result ----------------------------------------------
  if (rpcError) {
    // The RPC raised an exception → the transaction rolled back. No partial
    // graph/embedding/entity/task state persists. Mark the document failed
    // so the user can retry (VAL-CONFIRM-011).
    const message = "Bestätigung fehlgeschlagen. Bitte erneut versuchen.";
    await markFailed(serverClient, documentId, message);
    const body: ConfirmErrorResponse = {
      error: message,
      code: "CONFIRM_RPC_FAILED",
    };
    return Response.json(body, { status: 500 });
  }

  const result = rpcResult as ConfirmRpcResult | null;

  if (result && result.status === "status_changed") {
    // The document was not in 'analyzed' (double-submit or concurrent
    // transition). The RPC performed no mutations. Return 409 without
    // marking the document failed — it was likely confirmed by a
    // concurrent request (VAL-CONFIRM-012).
    const body: ConfirmErrorResponse = {
      error: "Der Dokument-Status hat sich geändert. Bitte erneut versuchen.",
      code: "STATUS_CHANGED",
    };
    return Response.json(body, { status: 409 });
  }

  if (!result || result.status !== "confirmed") {
    // Unexpected RPC response shape — treat as a failure.
    const message = "Unerwartete Antwort der Bestätigungs-Funktion.";
    await markFailed(serverClient, documentId, message);
    const body: ConfirmErrorResponse = {
      error: message,
      code: "CONFIRM_UNEXPECTED_RESULT",
    };
    return Response.json(body, { status: 500 });
  }

  // Success ---------------------------------------------------------------
  const body: ConfirmSuccessResponse = {
    status: "confirmed",
    document_id: documentId,
  };
  return Response.json(body, { status: 200 });
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Build the extracted_entities rows (as RPC params) from the confirm
 * payload.
 *
 * The payload contains the (possibly edited) entities. We map each into the
 * shape expected by the confirm_document RPC. The RPC inserts them with
 * `confirmed = true` after clearing prior entities for the document
 * (VAL-CONFIRM-008: edited values are used, not the original extraction).
 */
function buildEntityRows(payload: ConfirmPayload): ConfirmRpcEntity[] {
  const entities: ConfirmRpcEntity[] = [];

  // Persons.
  for (const member of payload.family_members) {
    entities.push({
      entity_type: "person",
      entity_value: member.name,
      normalized_value: member.name.toLowerCase().trim(),
      confidence: member.confidence,
      linked_object_id: member.person_id ?? null,
    });
  }

  // Organizations.
  for (const org of payload.organizations) {
    entities.push({
      entity_type: "organization",
      entity_value: org.name,
      normalized_value: org.name.toLowerCase().trim(),
      confidence: org.confidence,
      linked_object_id: null,
    });
  }

  // Dates.
  for (const date of payload.dates) {
    entities.push({
      entity_type: "date",
      entity_value: date.date,
      normalized_value: date.date,
      confidence: date.confidence,
      linked_object_id: null,
    });
  }

  // Amounts.
  for (const amount of payload.amounts) {
    entities.push({
      entity_type: "amount",
      entity_value: `${amount.amount} ${amount.currency}`.trim(),
      normalized_value: amount.amount,
      confidence: amount.confidence,
      linked_object_id: null,
    });
  }

  // Category.
  if (payload.suggested_category) {
    entities.push({
      entity_type: "category",
      entity_value: payload.suggested_category,
      normalized_value: payload.suggested_category.toLowerCase().trim(),
      confidence: 1.0,
      linked_object_id: null,
    });
  }

  // Tags.
  for (const tag of payload.tags) {
    entities.push({
      entity_type: "tag",
      entity_value: tag,
      normalized_value: tag.toLowerCase().trim(),
      confidence: 1.0,
      linked_object_id: null,
    });
  }

  return entities;
}

/**
 * Build the tasks rows (as RPC params) from the confirm payload.
 *
 * Deleted tasks (per VAL-REVIEW-007) are already excluded from the payload's
 * `tasks` array, so they are not re-inserted. The RPC inserts them with
 * `confirmed = true` after clearing prior tasks for the document.
 */
function buildTaskRows(payload: ConfirmPayload): ConfirmRpcTask[] {
  return payload.tasks.map((task) => ({
    title: task.title,
    due_date: task.due_date ?? null,
    priority: task.priority,
    confidence: task.confidence,
  }));
}

/**
 * Mark a document as failed with an error message.
 *
 * Also clears confirmed_at so that a failed confirm (which the RPC may have
 * set during the conditional transition before rolling back) does not leave
 * a stale confirmed_at value on a failed document.
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
