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
  const { data: restoredDocument, error } = await supabase
    .from("documents")
    .update({ deleted_at: null })
    .eq("id", id)
    .not("deleted_at", "is", null)
    .is("purge_claim_id", null)
    .select("id")
    .maybeSingle();
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

  const { data: linkedTasks, error: linkedTasksError } = await supabase
    .from("tasks")
    .select("id, status_before_trash")
    .eq("trashed_by_document_id", id)
    .not("deleted_at", "is", null);
  if (linkedTasksError) {
    return jsonError(
      "Verknüpfte Aufgaben konnten nicht wiederhergestellt werden.",
      "TASKS_RESTORE_FAILED",
      500,
    );
  }

  const taskResults = await Promise.all(
    (linkedTasks ?? []).map((task) =>
      supabase
        .from("tasks")
        .update({
          status: task.status_before_trash ?? "open",
          deleted_at: null,
          status_before_trash: null,
          trashed_by_document_id: null,
        })
        .eq("id", task.id),
    ),
  );
  const taskUpdateError = taskResults.find((result) => result.error)?.error;
  if (taskUpdateError) {
    return jsonError(
      "Verknüpfte Aufgaben konnten nicht wiederhergestellt werden.",
      "TASKS_RESTORE_FAILED",
      500,
    );
  }

  return Response.json({ status: "restored", document_id: id });
}

export async function GET() {
  return methodNotAllowed("Methode nicht erlaubt.");
}
