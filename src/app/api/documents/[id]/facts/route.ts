import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api/respond";
import { parseJsonBody } from "@/lib/api/parse-json";
import {
  createFactSchema,
  updateFactSchema,
  deleteFactSchema,
} from "@/lib/schemas/facts";
import { FACT_TYPE_LABELS, normalizeFactValue } from "@/lib/schemas/extraction";

/**
 * POST|PATCH|DELETE /api/documents/[id]/facts — manage a document's typed
 * facts (serial numbers, contract numbers, IBANs, …) AFTER confirmation.
 *
 * Facts are the values families come back for; when the extraction got
 * one wrong (OCR misread) or missed one, this endpoint lets the user fix
 * or add it — from the document detail view or via the chat tool
 * `save_document_fact`. Changes are effective immediately: both the
 * confirmed detail view and the fact search read straight from
 * `document_facts`, so no reindex is needed.
 *
 *   POST   { fact_type, value, label? }            → add a fact
 *   PATCH  { fact_id, value?, label?, fact_type? } → correct a fact
 *   DELETE { fact_id }                             → remove a fact
 *
 * Auth: session client — RLS restricts every operation to the user's
 * family. User-provided facts are stored with confidence 1.0 and
 * confirmed=true (fact search only surfaces confirmed facts).
 */

type RouteContext = { params: Promise<{ id: string }> };

type ResolvedDocument =
  | { ok: false; response: Response }
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      document: { id: string; family_id: string };
    };

/** Resolve the document (RLS-scoped) or produce the error response. */
async function resolveDocument(documentId: string): Promise<ResolvedDocument> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: Response.json(
        { error: "Nicht angemeldet.", code: "UNAUTHENTICATED" },
        { status: 401 },
      ),
    };
  }

  const { data: document, error } = await supabase
    .from("documents")
    .select("id, family_id")
    .eq("id", documentId)
    .maybeSingle();

  if (error || !document) {
    return {
      ok: false,
      response: Response.json(
        { error: "Dokument nicht gefunden.", code: "NOT_FOUND" },
        { status: 404 },
      ),
    };
  }

  return { ok: true, supabase, document };
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { id } = await context.params;
  const resolved = await resolveDocument(id);
  if (!resolved.ok) return resolved.response;
  const { supabase, document } = resolved;

  const parsed = await parseJsonBody(request, createFactSchema, {
    invalidJson: "Bitte gib eine gültige Nummer und ihren Typ an.",
    invalidPayload: "Bitte gib eine gültige Nummer und ihren Typ an.",
    payloadCode: "INVALID_INPUT",
  });
  if (!parsed.ok) return parsed.response;

  const { fact_type: factType, value } = parsed.data;
  const label = parsed.data.label ?? FACT_TYPE_LABELS[factType];

  const { data: fact, error } = await supabase
    .from("document_facts")
    .insert({
      document_id: document.id,
      family_id: document.family_id,
      fact_type: factType,
      label,
      value,
      normalized_value: normalizeFactValue(value),
      // User-provided: full confidence, immediately searchable.
      confidence: 1.0,
      confirmed: true,
    })
    .select("id, fact_type, label, value")
    .single();

  if (error || !fact) {
    return jsonError("Speichern hat nicht geklappt.", "INSERT_FAILED", 500);
  }
  return Response.json({ status: "ok", fact });
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { id } = await context.params;
  const resolved = await resolveDocument(id);
  if (!resolved.ok) return resolved.response;
  const { supabase, document } = resolved;

  const parsed = await parseJsonBody(request, updateFactSchema, {
    invalidJson: "Bitte gib die Nummer und einen neuen Wert an.",
    invalidPayload: "Bitte gib die Nummer und einen neuen Wert an.",
    payloadCode: "INVALID_INPUT",
  });
  if (!parsed.ok) return parsed.response;

  const { fact_id: factId, value, label, fact_type: factType } = parsed.data;
  const update = {
    confidence: 1.0,
    confirmed: true,
    ...(value ? { value, normalized_value: normalizeFactValue(value) } : {}),
    ...(label ? { label } : {}),
    ...(factType ? { fact_type: factType } : {}),
  };

  const { data: fact, error } = await supabase
    .from("document_facts")
    .update(update)
    .eq("id", factId)
    .eq("document_id", document.id)
    .select("id, fact_type, label, value")
    .maybeSingle();

  if (error || !fact) {
    return jsonError("Die Nummer wurde nicht gefunden.", "NOT_FOUND", 404);
  }
  return Response.json({ status: "ok", fact });
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { id } = await context.params;
  const resolved = await resolveDocument(id);
  if (!resolved.ok) return resolved.response;
  const { supabase, document } = resolved;

  const parsed = await parseJsonBody(request, deleteFactSchema, {
    invalidJson: "Bitte gib an, welche Nummer entfernt werden soll.",
    invalidPayload: "Bitte gib an, welche Nummer entfernt werden soll.",
    payloadCode: "INVALID_INPUT",
  });
  if (!parsed.ok) return parsed.response;

  const { error } = await supabase
    .from("document_facts")
    .delete()
    .eq("id", parsed.data.fact_id)
    .eq("document_id", document.id);

  if (error) {
    return jsonError("Entfernen hat nicht geklappt.", "DELETE_FAILED", 500);
  }
  return Response.json({ status: "ok" });
}
