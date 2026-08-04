import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/documents/[id]/person — re-assign a confirmed document's
 * person(s) AFTER confirmation.
 *
 * Before this endpoint, a document's person assignment was frozen the
 * moment it was confirmed: `ConfirmedAnalysisDetails` rendered persons as
 * plain text, and the only way to touch the assignment again was "Neu
 * lesen" (re-analyze), which discards every other edit. Facts already
 * have a lightweight post-confirm correction path (`/api/documents/[id]
 * /facts`); this mirrors it for persons.
 *
 *   PATCH { persons: Array<{ name: string; person_id: string | null }> }
 *
 * The full persons array replaces the document's person entities in one
 * transaction-less delete+insert (mirroring how `confirm_document` writes
 * them the first time) — simpler and less error-prone than patching a
 * single array index, since `extracted_entities` rows have no stable
 * index of their own.
 *
 * Auth: session client — RLS restricts the read/write to the user's
 * family. Any `person_id` supplied must reference a family member in the
 * same family; otherwise the request is rejected rather than silently
 * dropped, so a rejected assignment is never mistaken for a saved one.
 */

const MAX_PERSONS = 20;
const MAX_NAME_LENGTH = 200;

type RouteContext = { params: Promise<{ id: string }> };

interface PersonInput {
  name: string;
  person_id: string | null;
}

function parsePersons(body: unknown): PersonInput[] | null {
  if (!body || typeof body !== "object" || !("persons" in body)) return null;
  const raw = (body as { persons: unknown }).persons;
  if (!Array.isArray(raw) || raw.length > MAX_PERSONS) return null;

  const persons: PersonInput[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const name = (entry as { name?: unknown }).name;
    const personId = (entry as { person_id?: unknown }).person_id;
    if (typeof name !== "string") return null;
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > MAX_NAME_LENGTH) return null;
    if (personId !== null && typeof personId !== "string") return null;
    persons.push({ name: trimmedName, person_id: personId });
  }
  return persons;
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { id: documentId } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json(
      { error: "Nicht angemeldet.", code: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id, family_id")
    .eq("id", documentId)
    .maybeSingle();

  if (documentError || !document) {
    return Response.json(
      { error: "Dokument nicht gefunden.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const persons = parsePersons(body);
  if (!persons) {
    return Response.json(
      {
        error: "Bitte gib eine gültige Personenliste an.",
        code: "INVALID_INPUT",
      },
      { status: 400 },
    );
  }

  // Any referenced family member must belong to the same family — a
  // silently-ignored mismatch would look like a saved assignment that
  // then never appears anywhere.
  const personIds = [
    ...new Set(persons.map((p) => p.person_id).filter((id): id is string => id !== null)),
  ];
  if (personIds.length > 0) {
    const { data: members, error: membersError } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", document.family_id)
      .in("id", personIds);

    if (membersError) {
      return Response.json(
        { error: "Familienmitglieder konnten nicht geprüft werden.", code: "DB_READ_FAILED" },
        { status: 500 },
      );
    }
    const knownIds = new Set((members ?? []).map((m) => m.id));
    if (personIds.some((id) => !knownIds.has(id))) {
      return Response.json(
        {
          error: "Diese Person gehört nicht zu deiner Familie.",
          code: "PERSON_NOT_IN_FAMILY",
        },
        { status: 400 },
      );
    }
  }

  const { error: deleteError } = await supabase
    .from("extracted_entities")
    .delete()
    .eq("document_id", documentId)
    .eq("entity_type", "person");

  if (deleteError) {
    return Response.json(
      { error: "Speichern hat nicht geklappt.", code: "DELETE_FAILED" },
      { status: 500 },
    );
  }

  if (persons.length > 0) {
    const rows = persons.map((p) => ({
      document_id: documentId,
      family_id: document.family_id,
      entity_type: "person",
      entity_value: p.name,
      normalized_value: p.name.toLowerCase().trim(),
      confidence: 1.0,
      confirmed: true,
      linked_object_id: p.person_id,
    }));

    const { error: insertError } = await supabase
      .from("extracted_entities")
      .insert(rows);

    if (insertError) {
      return Response.json(
        { error: "Speichern hat nicht geklappt.", code: "INSERT_FAILED" },
        { status: 500 },
      );
    }
  }

  return Response.json({ status: "ok", persons });
}
