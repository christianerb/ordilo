import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { methodNotAllowed } from "@/lib/api/respond";
import {
  resolveDocumentWithOwnership,
  markDocumentFailed,
} from "@/lib/supabase/document-helpers";
import { EmbeddingError } from "@/lib/ai/embeddings";
import {
  buildDocumentEmbeddings,
  buildLabelEmbeddings,
} from "@/lib/pipeline/document-embeddings";
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
  ConfirmRpcLabelEmbedding,
  ConfirmRpcEntity,
  ConfirmRpcTask,
  ConfirmRpcFact,
  ConfirmRpcEvent,
  ConfirmRpcResult,
} from "@/types/database";
import { PIPELINE_VERSION } from "@/lib/ai/models";
import { normalizeFactValue } from "@/lib/schemas/extraction";
import {
  dedupeDates,
  dedupeAmounts,
  toIsoDateOrNull,
} from "@/lib/analysis-cleanup";
import { buildEntityRows } from "@/lib/pipeline/entity-rows";
import { canonicalizeCategoryForFamily } from "@/lib/categories-server";
import { getErrorCode } from "@/lib/pipeline/failure-tracking";
import { recordProductEvent } from "@/lib/analytics/product-events";

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
 *      transaction). On failure → keep the analyzed state, record
 *      diagnostics, and return a structured error.
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
 *        - RPC error      → preserve analyzed state + structured error
 *
 * Atomicity (VAL-CONFIRM-011):
 *   All DB mutations happen inside the single RPC call, which runs in one
 *   Postgres transaction. If any statement inside the RPC fails, the entire
 *   transaction rolls back (status reverts to 'analyzed', no partial
 *   graph/embedding/entity/task rows). The route keeps the analyzed state
 *   so the user can retry without running OCR or extraction again.
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

  // 4-5. Validate UUID, read document (RLS-scoped), distinguish 403 vs 404 --
  // resolveDocumentWithOwnership handles UUID validation (400), RLS-scoped
  // read (500 on error), and the admin-client existence check to
  // distinguish 403 (exists but not owned) from 404 (truly does not exist)
  // — VAL-CONFIRM-009. No mutations are performed in either case.
  const adminClient = createAdminClient();
  const { document, error: resolveError } = await resolveDocumentWithOwnership(
    serverClient,
    adminClient,
    documentId,
  );

  if (resolveError) {
    const body: ConfirmErrorResponse = resolveError.body;
    return Response.json(body, { status: resolveError.status });
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

  // 6a. Clean up duplicate dates/amounts and generic labels. New analyses
  //     arrive already cleaned by the analyze step; this covers payloads
  //     built from analyses stored before the cleanup existed, so the
  //     confirmed entities (search, detail views) are clean either way.
  payload.dates = dedupeDates(payload.dates);
  payload.amounts = dedupeAmounts(payload.amounts);

  // 6b. Canonicalize the category against the family's existing categories
  //     and collection names (documents.category === collection.name links
  //     a document into a collection — a canonical match files it there).
  //     Best-effort: on a read failure the suggested spelling is kept.
  payload.suggested_category = await canonicalizeCategoryForFamily(
    serverClient,
    familyId,
    payload.suggested_category,
  );

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

  // 8. Generate embeddings via OpenAI FIRST (outside the DB transaction) --
  // The external OpenAI call cannot be part of the Postgres transaction, so
  // it happens before the RPC. If it fails, no DB mutations have occurred
  // yet → no partial state. We preserve the analysis, record diagnostics,
  // and return a structured error.
  let embeddingsParam: ConfirmRpcEmbedding[];
  try {
    embeddingsParam = await buildDocumentEmbeddings({
      pages: pages ?? [],
      ocrTextFallback: document.ocr_text,
      metadata: payload,
    });
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

    await markDocumentFailed(serverClient, documentId, message, {
      stage: "embedding",
      code,
      cause: err,
      familyId,
      clearConfirmedAt: true,
      retryable: true,
    });

    const body: ConfirmErrorResponse = { error: message, code };
    return Response.json(body, { status: statusCode });
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

  // 9b. Label embeddings for the knowledge graph nodes.
  const labelEmbeddingsParam: ConfirmRpcLabelEmbedding[] =
    await buildLabelEmbeddings(payload);

  const entitiesParam: ConfirmRpcEntity[] = buildEntityRows(payload);
  const tasksParam: ConfirmRpcTask[] = buildTaskRows(payload);
  const factsParam: ConfirmRpcFact[] = buildFactRows(payload);
  const eventsParam: ConfirmRpcEvent[] = buildEventRows(payload);

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
      p_label_embeddings: labelEmbeddingsParam,
      p_entities: entitiesParam,
      p_tasks: tasksParam,
      p_facts: factsParam,
      p_events: eventsParam,
      p_pipeline_version: PIPELINE_VERSION,
    },
  );

  // 11. Handle the RPC result ----------------------------------------------
  if (rpcError) {
    // The RPC raised an exception → the transaction rolled back. No partial
    // graph/embedding/entity/task state persists. Keep the analysis
    // retryable and persist diagnostics (VAL-CONFIRM-011).
    const message = "Bestätigung fehlgeschlagen. Bitte erneut versuchen.";
    await markDocumentFailed(serverClient, documentId, message, {
      stage: "confirmation",
      code: getErrorCode(rpcError, "CONFIRM_RPC_FAILED"),
      cause: rpcError,
      familyId,
      clearConfirmedAt: true,
      retryable: true,
    });
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
    await markDocumentFailed(serverClient, documentId, message, {
      stage: "confirmation",
      code: "CONFIRM_UNEXPECTED_RESULT",
      cause: new Error(
        `Unexpected confirm_document result: ${JSON.stringify(result)}`,
      ),
      familyId,
      clearConfirmedAt: true,
      retryable: true,
    });
    const body: ConfirmErrorResponse = {
      error: message,
      code: "CONFIRM_UNEXPECTED_RESULT",
    };
    return Response.json(body, { status: 500 });
  }

  // Success ---------------------------------------------------------------

  await recordProductEvent(serverClient, {
    userId: auth.user.id,
    familyId,
    eventName: "document_confirmed",
  });

  const body: ConfirmSuccessResponse = {
    status: "confirmed",
    document_id: documentId,
    events_created: result.events_created ?? 0,
  };
  return Response.json(body, { status: 200 });
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

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
    // Unsanitised, a value like "Montag" reaches a Postgres `date` column
    // and rolls the whole confirm back as CONFIRM_RPC_FAILED.
    due_date: toIsoDateOrNull(task.due_date),
    confidence: task.confidence,
  }));
}

/**
 * Build the calendar event rows (as RPC params) from the confirm payload.
 *
 * These are the dates the user kept checked in the review step's planner
 * offer. Defence in depth: the RPC skips malformed rows, but a value like
 * "Montag" should never leave this route — an invalid date cast would roll
 * the whole confirm back.
 */
function buildEventRows(payload: ConfirmPayload): ConfirmRpcEvent[] {
  return payload.calendar_events
    .map((event) => ({
      date: toIsoDateOrNull(event.date),
      label: event.label.trim(),
    }))
    .filter(
      (event): event is ConfirmRpcEvent =>
        event.date !== null && event.label.length > 0,
    );
}

/**
 * Build the document_facts rows (as RPC params) from the confirm payload.
 *
 * `normalized_value` is computed server-side (lowercase, alphanumeric only)
 * so exact identifier lookup ("SN 4823-XK" ↔ "sn4823xk") is consistent
 * regardless of client formatting.
 */
function buildFactRows(payload: ConfirmPayload): ConfirmRpcFact[] {
  return payload.facts.map((fact) => ({
    fact_type: fact.fact_type,
    label: fact.label,
    value: fact.value,
    normalized_value: normalizeFactValue(fact.value),
    confidence: fact.confidence,
  }));
}

/**
 * GET /api/documents/[id]/confirm — method not allowed.
 */
export async function GET(): Promise<Response> {
  return methodNotAllowed();
}
