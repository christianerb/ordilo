import { createClient } from "@/lib/supabase/server";
import {
  FACT_TYPES,
  FACT_TYPE_LABELS,
  normalizeFactValue,
  type FactType,
} from "@/lib/schemas/extraction";

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
 *   PATCH  { fact_id, value, label? }              → correct a fact
 *   DELETE { fact_id }                             → remove a fact
 *
 * Auth: session client — RLS restricts every operation to the user's
 * family. User-provided facts are stored with confidence 1.0 and
 * confirmed=true (fact search only surfaces confirmed facts).
 */

const MAX_VALUE_LENGTH = 200;
const MAX_LABEL_LENGTH = 120;

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

function validateValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_VALUE_LENGTH) return null;
  return trimmed;
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { id } = await context.params;
  const resolved = await resolveDocument(id);
  if (!resolved.ok) return resolved.response;
  const { supabase, document } = resolved;

  let body: { fact_type?: string; value?: unknown; label?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const factType = FACT_TYPES.includes(body.fact_type as FactType)
    ? (body.fact_type as FactType)
    : null;
  const value = validateValue(body.value);
  if (!factType || !value) {
    return Response.json(
      {
        error: "Bitte gib eine gültige Nummer und ihren Typ an.",
        code: "INVALID_INPUT",
      },
      { status: 400 },
    );
  }
  const label =
    typeof body.label === "string" && body.label.trim()
      ? body.label.trim().slice(0, MAX_LABEL_LENGTH)
      : FACT_TYPE_LABELS[factType];

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
    return Response.json(
      { error: "Speichern hat nicht geklappt.", code: "INSERT_FAILED" },
      { status: 500 },
    );
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

  let body: { fact_id?: unknown; value?: unknown; label?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const factId = typeof body.fact_id === "string" ? body.fact_id : null;
  const value = validateValue(body.value);
  if (!factId || !value) {
    return Response.json(
      {
        error: "Bitte gib die Nummer und einen neuen Wert an.",
        code: "INVALID_INPUT",
      },
      { status: 400 },
    );
  }

  const label =
    typeof body.label === "string" && body.label.trim()
      ? body.label.trim().slice(0, MAX_LABEL_LENGTH)
      : undefined;
  const update = {
    value,
    normalized_value: normalizeFactValue(value),
    confidence: 1.0,
    confirmed: true,
    ...(label ? { label } : {}),
  };

  const { data: fact, error } = await supabase
    .from("document_facts")
    .update(update)
    .eq("id", factId)
    .eq("document_id", document.id)
    .select("id, fact_type, label, value")
    .maybeSingle();

  if (error || !fact) {
    return Response.json(
      { error: "Die Nummer wurde nicht gefunden.", code: "NOT_FOUND" },
      { status: 404 },
    );
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

  let body: { fact_id?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const factId = typeof body.fact_id === "string" ? body.fact_id : null;
  if (!factId) {
    return Response.json(
      { error: "Bitte gib an, welche Nummer entfernt werden soll.", code: "INVALID_INPUT" },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("document_facts")
    .delete()
    .eq("id", factId)
    .eq("document_id", document.id);

  if (error) {
    return Response.json(
      { error: "Entfernen hat nicht geklappt.", code: "DELETE_FAILED" },
      { status: 500 },
    );
  }
  return Response.json({ status: "ok" });
}
