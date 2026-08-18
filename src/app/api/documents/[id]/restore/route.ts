import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/supabase/document-helpers";
import { jsonError, methodNotAllowed } from "@/lib/api/respond";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (auth.status) return Response.json(auth.json, { status: auth.status });
  const { id } = await params;
  if (!isValidUuid(id)) return jsonError("Ungültige Dokument-ID.", "INVALID_DOCUMENT_ID", 400);
  const supabase = await createClient();
  const { data: restoredDocument, error } = await supabase.rpc(
    "restore_document",
    { p_document_id: id },
  );
  if (error) {
    return jsonError(
      "Dokument konnte nicht wiederhergestellt werden.",
      "DB_RESTORE_FAILED",
      500,
    );
  }
  if (!restoredDocument) {
    return jsonError(
      "Dokument kann nicht mehr wiederhergestellt werden.",
      "DOCUMENT_NOT_RESTORABLE",
      409,
    );
  }

  return Response.json({ status: "restored", document_id: id });
}

export async function GET() {
  return methodNotAllowed("Methode nicht erlaubt.");
}
