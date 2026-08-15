import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import {
  isValidUuid,
  resolveDocumentWithOwnership,
} from "@/lib/supabase/document-helpers";
import { jsonError, methodNotAllowed } from "@/lib/api/respond";
import {
  documentUpdatePayloadSchema,
  type DocumentUpdatePayload,
  type DocumentUpdateSuccessResponse,
} from "@/lib/schemas/document-update";
import { dedupeDates, dedupeAmounts } from "@/lib/analysis-cleanup";
import { canonicalizeCategoryForFamily } from "@/lib/categories-server";
import { buildEntityRows } from "@/lib/pipeline/entity-rows";
import { PIPELINE_VERSION } from "@/lib/ai/models";
import { EmbeddingError } from "@/lib/ai/embeddings";
import {
  buildDocumentEmbeddings,
  buildLabelEmbeddings,
} from "@/lib/pipeline/document-embeddings";
import type {
  ConfirmRpcEmbedding,
  ConfirmRpcLabelEmbedding,
  UpdateDocumentRpcResult,
} from "@/types/database";

/**
 * DELETE /api/documents/[id]
 *
 * Deletes a document AND its Storage file.
 *
 * Previously the client deleted the DB row directly and attempted the
 * Storage removal with the browser client — which silently fails on the
 * private bucket (no storage RLS policies for users), leaving orphaned
 * files. This route does it properly:
 *
 *   1. Authenticate (401 without session)
 *   2. Read the document RLS-scoped (404 if not visible — no existence leak)
 *   3. Delete the DB row via the server client (RLS-enforced; cascades to
 *      pages, entities, tasks, facts, embeddings, edges)
 *   4. Remove the Storage object with the admin client (service role) —
 *      best-effort: a failure here never blocks the delete, but is logged.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) {
    return Response.json(auth.json, { status: auth.status });
  }

  const { id: documentId } = await params;
  if (!isValidUuid(documentId)) {
    return jsonError("Ungültige Dokument-ID.", "INVALID_DOCUMENT_ID", 400);
  }

  const serverClient = await createServerClient();

  // RLS-scoped read: non-owned/nonexistent → 404 (no existence leak).
  const { data: document, error: readError } = await serverClient
    .from("documents")
    .select("id, file_url")
    .eq("id", documentId)
    .maybeSingle();

  if (readError) {
    return jsonError(
      "Dokument konnte nicht geladen werden.",
      "DB_READ_FAILED",
      500,
    );
  }
  if (!document) {
    return jsonError(
      "Dokument nicht gefunden oder kein Zugriff.",
      "DOCUMENT_NOT_FOUND",
      404,
    );
  }

  // Delete the row (RLS-enforced; FK cascades clean up all derived data).
  const { error: deleteError } = await serverClient
    .from("documents")
    .delete()
    .eq("id", documentId);

  if (deleteError) {
    return jsonError(
      "Dokument konnte nicht gelöscht werden.",
      "DB_DELETE_FAILED",
      500,
    );
  }

  // Best-effort Storage cleanup with the service-role client.
  if (document.file_url) {
    const adminClient = createAdminClient();
    const { error: storageError } = await adminClient.storage
      .from("documents")
      .remove([document.file_url]);
    if (storageError) {
      console.error(
        `[documents] Storage cleanup failed for ${documentId}:`,
        storageError,
      );
    }
  }

  return Response.json({ status: "deleted", document_id: documentId });
}

/**
 * PATCH /api/documents/[id]
 *
 * Edits a document that is already in the family book.
 *
 * Before this route existed, the only way to fix a misread name, date, or
 * amount after confirming was "Neu lesen" — throwing the whole analysis
 * away and hoping the AI reads it better the second time. This applies the
 * user's corrections directly and keeps everything else untouched:
 *
 *   1. Authenticate (401 without session)
 *   2. Validate the payload (title, summary, persons, organizations,
 *      dates, amounts, collection, tags)
 *   3. Resolve the document RLS-scoped (403 when it belongs to another
 *      family, 404 when it does not exist)
 *   4. Reject anything that is not "confirmed" with a 409 — a document
 *      still in review is edited through the review + confirm flow
 *   5. Clean the payload the same way confirm does (duplicate dates and
 *      amounts, generic labels, canonical collection spelling)
 *   6. Rebuild the search embeddings from the document's OCR text and the
 *      corrected metadata (the chunk vectors carry the title, the synthetic
 *      questions carry persons, organization and tags), plus the graph
 *      label embeddings so a rename stays semantically matchable
 *   7. Call `update_confirmed_document`, which rewrites the document row,
 *      its knowledge graph, its embeddings, and its extracted entities in
 *      one transaction
 *
 * Deliberately untouched: `confirmed_at` and `status` (the document was
 * added once), tasks, and facts — both have their own edit surfaces, and
 * rewriting tasks here would reset their status and assignee.
 *
 * A failed update never marks the document failed: it stays confirmed and
 * readable with its previous values, and the user can simply try again.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) {
    return Response.json(auth.json, { status: auth.status });
  }

  const { id: documentId } = await params;

  let payload: DocumentUpdatePayload;
  try {
    const parsed = documentUpdatePayloadSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const detail = issue
        ? `${issue.path.join(".")}: ${issue.message}`
        : "Validierungsfehler.";
      return jsonError(
        `Änderungen ungültig (${detail}).`,
        "INVALID_PAYLOAD",
        400,
      );
    }
    payload = parsed.data;
  } catch {
    return jsonError(
      "Änderungen konnten nicht gelesen werden.",
      "INVALID_JSON",
      400,
    );
  }

  const serverClient = await createServerClient();
  const adminClient = createAdminClient();
  const { document, error: resolveError } = await resolveDocumentWithOwnership(
    serverClient,
    adminClient,
    documentId,
  );

  if (resolveError) {
    return Response.json(resolveError.body, { status: resolveError.status });
  }

  if (document.status !== "confirmed") {
    return jsonError(
      "Dieses Dokument ist noch nicht im Familienbuch. Bitte erst prüfen und übernehmen.",
      "INVALID_STATUS_TRANSITION",
      409,
    );
  }

  const familyId = document.family_id;

  payload.dates = dedupeDates(payload.dates);
  payload.amounts = dedupeAmounts(payload.amounts);
  payload.suggested_category = await canonicalizeCategoryForFamily(
    serverClient,
    familyId,
    payload.suggested_category,
  );

  // Search embeddings carry the metadata, not just the OCR text: chunk
  // vectors are contextualized with the title, and the synthetic question
  // vectors are generated from title, summary, type, persons, organization
  // and tags. A corrected name would otherwise keep matching the old one,
  // so every edit rebuilds them from the OCR the document already has.
  const { data: pages, error: pagesError } = await serverClient
    .from("document_pages")
    .select("ocr_markdown, page_number")
    .eq("document_id", documentId)
    .order("page_number", { ascending: true });

  if (pagesError) {
    return jsonError(
      "Dokument konnte nicht gelesen werden. Bitte nochmal versuchen.",
      "DB_READ_FAILED",
      500,
    );
  }

  let embeddings: ConfirmRpcEmbedding[];
  try {
    embeddings = await buildDocumentEmbeddings({
      pages: pages ?? [],
      ocrTextFallback: document.ocr_text,
      metadata: payload,
    });
  } catch (err) {
    // The document keeps its previous values and stays confirmed — this
    // failed before any write, so there is nothing to roll back.
    console.error(`[documents] Embedding rebuild failed for ${documentId}:`, err);
    return jsonError(
      "Änderungen konnten nicht gespeichert werden. Bitte nochmal versuchen.",
      err instanceof EmbeddingError ? err.code : "EMBEDDING_FAILED",
      502,
    );
  }

  // Label embeddings keep the knowledge graph semantically searchable
  // ("Kita" → "Kindergarten") after a rename. A failure here costs fuzzy
  // matching for the renamed node, not the edit.
  const labelEmbeddings: ConfirmRpcLabelEmbedding[] =
    await buildLabelEmbeddings(payload);

  const { data: rpcResult, error: rpcError } = await serverClient.rpc(
    "update_confirmed_document",
    {
      p_document_id: documentId,
      p_family_id: familyId,
      p_title: payload.title,
      p_summary: payload.summary,
      p_document_type: payload.document_type,
      p_category: payload.suggested_category,
      p_persons: payload.family_members.map((member) => ({
        name: member.name,
        person_id: member.person_id ?? null,
        confidence: member.confidence,
      })),
      p_organizations: payload.organizations.map((org) => ({
        name: org.name,
        type: org.type,
        confidence: org.confidence,
      })),
      p_embeddings: embeddings,
      p_label_embeddings: labelEmbeddings,
      p_entities: buildEntityRows(payload),
      // The vectors were just regenerated with the current model, so they
      // carry today's pipeline version — the reindex job must not treat
      // them as stale.
      p_pipeline_version: PIPELINE_VERSION,
    },
  );

  if (rpcError) {
    console.error(`[documents] Update failed for ${documentId}:`, rpcError);
    return jsonError(
      "Änderungen konnten nicht gespeichert werden. Bitte nochmal versuchen.",
      "UPDATE_RPC_FAILED",
      500,
    );
  }

  const result = rpcResult as UpdateDocumentRpcResult | null;

  if (result?.status === "status_changed") {
    return jsonError(
      "Der Dokument-Status hat sich geändert. Bitte neu laden.",
      "STATUS_CHANGED",
      409,
    );
  }

  if (result?.status !== "updated") {
    console.error(
      `[documents] Unexpected update result for ${documentId}:`,
      result,
    );
    return jsonError(
      "Änderungen konnten nicht gespeichert werden. Bitte nochmal versuchen.",
      "UPDATE_UNEXPECTED_RESULT",
      500,
    );
  }

  const body: DocumentUpdateSuccessResponse = {
    status: "updated",
    document_id: documentId,
  };
  return Response.json(body);
}

/**
 * GET /api/documents/[id] — method not allowed.
 */
export async function GET(): Promise<Response> {
  return methodNotAllowed("Methode nicht erlaubt.");
}
