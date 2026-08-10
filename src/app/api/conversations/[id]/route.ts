import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { deleteConversation, updateConversationTitle } from "@/lib/ai/chat-history";
import { jsonError } from "@/lib/api/respond";
import { parseJsonBody } from "@/lib/api/parse-json";
import { updateConversationSchema } from "@/lib/schemas/conversations";

/**
 * DELETE /api/conversations/[id] — Delete a conversation and all its messages.
 *
 * PATCH /api/conversations/[id] — Rename a conversation.
 *   Body: { title: string }
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) {
    return Response.json(auth.json, { status: auth.status });
  }

  const { id } = await params;
  const serverClient = await createServerClient();

  try {
    await deleteConversation(serverClient, id);
    return Response.json({ success: true });
  } catch (err) {
    console.error("[conversations] Failed to delete conversation:", err);
    return jsonError(
      "Konversation konnte nicht gelöscht werden.",
      "DELETE_FAILED",
      500,
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) {
    return Response.json(auth.json, { status: auth.status });
  }

  const { id } = await params;
  const serverClient = await createServerClient();

  const parsed = await parseJsonBody(request, updateConversationSchema, {
    invalidJson: "Titel erforderlich.",
    invalidPayload: "Titel erforderlich.",
    payloadCode: "INVALID_INPUT",
  });
  if (!parsed.ok) return parsed.response;

  try {
    await updateConversationTitle(serverClient, id, parsed.data.title);
    return Response.json({ success: true });
  } catch (err) {
    console.error("[conversations] Failed to update conversation title:", err);
    return jsonError(
      "Titel konnte nicht aktualisiert werden.",
      "UPDATE_FAILED",
      500,
    );
  }
}
