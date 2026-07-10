import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { ChatErrorResponse } from "@/lib/schemas/chat";

/**
 * POST /api/chat/feedback — Submit feedback (thumbs up/down) on a chat message.
 *
 * Input:  { message_id: string, feedback: "positive" | "negative" }
 *
 * Auth:   401 without session.
 * Errors: 400 (invalid input), 404 (message not found), 500 (server error).
 */

const VALID_FEEDBACK = ["positive", "negative"] as const;
type ValidFeedback = (typeof VALID_FEEDBACK)[number];

export async function POST(request: Request): Promise<Response> {
  // 1. Authenticate
  const auth = await requireUser();
  if (auth.status) {
    const body: ChatErrorResponse = auth.json;
    return Response.json(body, { status: auth.status });
  }

  // 2. Parse & validate
  let messageId: string;
  let feedback: string;

  try {
    const json = await request.json();
    if (!json?.message_id || typeof json.message_id !== "string") {
      const body: ChatErrorResponse = {
        error: "message_id ist erforderlich.",
        code: "INVALID_FEEDBACK_INPUT",
      };
      return Response.json(body, { status: 400 });
    }
    if (!json.feedback || !VALID_FEEDBACK.includes(json.feedback)) {
      const body: ChatErrorResponse = {
        error: "feedback muss 'positive' oder 'negative' sein.",
        code: "INVALID_FEEDBACK_INPUT",
      };
      return Response.json(body, { status: 400 });
    }
    messageId = json.message_id;
    feedback = json.feedback as ValidFeedback;
  } catch {
    const body: ChatErrorResponse = {
      error: "Anfrage konnte nicht gelesen werden.",
      code: "INVALID_JSON",
    };
    return Response.json(body, { status: 400 });
  }

  // 3. Update the message's feedback column (RLS-scoped)
  const serverClient = await createServerClient();

  const { error } = await serverClient
    .from("chat_messages")
    .update({ feedback })
    .eq("id", messageId);

  if (error) {
    const body: ChatErrorResponse = {
      error: "Feedback konnte nicht gespeichert werden.",
      code: "FEEDBACK_UPDATE_FAILED",
    };
    return Response.json(body, { status: 500 });
  }

  return Response.json({ success: true });
}
