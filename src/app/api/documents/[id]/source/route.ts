import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { resolveDocumentWithOwnership } from "@/lib/supabase/document-helpers";
import { findSourceLocation } from "@/lib/source-locations";
import { jsonError } from "@/lib/api/respond";
import { parseJsonBody } from "@/lib/api/parse-json";
import { sourceRequestSchema } from "@/lib/schemas/document";

/**
 * Returns a single, unambiguous OCR source location for a field value.
 * Source text is never persisted or returned, only its normalized page bounds.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) return Response.json(auth.json, { status: auth.status });

  const parsed = await parseJsonBody(request, sourceRequestSchema, {
    invalidJson: "Ungültiger Vergleichswert.",
    invalidPayload: "Ungültiger Vergleichswert.",
    payloadCode: "INVALID_SOURCE_TEXT",
  });
  if (!parsed.ok) return parsed.response;
  const sourceText = parsed.data.text;

  const { id: documentId } = await params;
  const serverClient = await createServerClient();
  const adminClient = createAdminClient();
  const { error } = await resolveDocumentWithOwnership(
    serverClient,
    adminClient,
    documentId,
  );
  if (error) return Response.json(error.body, { status: error.status });

  const { data: pages, error: pagesError } = await serverClient
    .from("document_pages")
    .select("page_number, layout_json")
    .eq("document_id", documentId)
    .order("page_number", { ascending: true });
  if (pagesError) {
    return jsonError(
      "Original konnte nicht vorbereitet werden.",
      "DB_READ_FAILED",
      500,
    );
  }

  const matches = (pages ?? [])
    .map((page) =>
      findSourceLocation(page.layout_json, page.page_number, sourceText),
    )
    .filter((location): location is NonNullable<typeof location> => Boolean(location));

  return Response.json({ location: matches.length === 1 ? matches[0] : null });
}
