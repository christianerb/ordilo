import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { deleteConversation, updateConversationTitle } from "@/lib/ai/chat-history";

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
  } catch {
    return Response.json(
      { error: "Konversation konnte nicht gelöscht werden." },
      { status: 500 },
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

  try {
    const json = await request.json();
    if (!json?.title || typeof json.title !== "string") {
      return Response.json(
        { error: "Titel erforderlich." },
        { status: 400 },
      );
    }

    await updateConversationTitle(serverClient, id, json.title.trim());
    return Response.json({ success: true });
  } catch {
    return Response.json(
      { error: "Titel konnte nicht aktualisiert werden." },
      { status: 500 },
    );
  }
}
