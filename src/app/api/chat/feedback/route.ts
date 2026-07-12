import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { ChatErrorResponse } from "@/lib/schemas/chat";
import { isTaskQuery, findMentionedMembers } from "@/lib/schemas/search";
import { FACT_TYPE_LABELS } from "@/lib/schemas/extraction";

/**
 * POST /api/chat/feedback — Submit feedback (thumbs up/down) on a chat message.
 *
 * Input:  {
 *   message_id: string,
 *   feedback: "positive" | "negative",
 *   reasons?: string[],   // fixed choices, e.g. ["falsche_antwort"]
 *   comment?: string      // optional free text from the user
 * }
 *
 * Besides updating `chat_messages.feedback`, a privacy-preserving
 * `chat_feedback_events` row is recorded: the question is classified
 * server-side into a coarse kind (fristen | nummern | personen | suche)
 * and then DISCARDED — only the kind, the answer's shape (source count,
 * length), the rating, the ticked reasons, and the user's own optional
 * comment are stored. Never the question, never the answer, never
 * document content.
 *
 * Auth:   401 without session.
 * Errors: 400 (invalid input), 500 (feedback update failed). The event
 *         insert is best-effort and never fails the request.
 */

const VALID_FEEDBACK = ["positive", "negative"] as const;
type ValidFeedback = (typeof VALID_FEEDBACK)[number];

const VALID_REASONS = new Set([
  "falsche_antwort",
  "falsches_dokument",
  "unvollstaendig",
]);

const MAX_COMMENT_LENGTH = 500;

/**
 * Classify a user question into a coarse kind for aggregate insights.
 * Heuristic only (no LLM call) — the content is discarded afterwards.
 */
function classifyQueryKind(
  question: string,
  memberNames: string[],
): "fristen" | "nummern" | "personen" | "suche" {
  const lower = question.toLowerCase();
  for (const label of Object.values(FACT_TYPE_LABELS)) {
    if (lower.includes(label.toLowerCase())) return "nummern";
  }
  if (isTaskQuery(question)) return "fristen";
  if (findMentionedMembers(question, memberNames).length > 0) {
    return "personen";
  }
  return "suche";
}

export async function POST(request: Request): Promise<Response> {
  // 1. Authenticate
  const auth = await requireUser();
  if (auth.status) {
    const body: ChatErrorResponse = auth.json;
    return Response.json(body, { status: auth.status });
  }

  // 2. Parse & validate
  let messageId: string;
  let feedback: ValidFeedback;
  let reasons: string[] = [];
  let comment: string | null = null;

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

    if (Array.isArray(json.reasons)) {
      reasons = json.reasons
        .filter((r: unknown): r is string => typeof r === "string")
        .filter((r: string) => VALID_REASONS.has(r))
        .slice(0, 3);
    }
    if (typeof json.comment === "string" && json.comment.trim()) {
      comment = json.comment.trim().slice(0, MAX_COMMENT_LENGTH);
    }
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

  // 4. Record the privacy-preserving feedback event (best-effort) ---------
  try {
    const { data: message } = await serverClient
      .from("chat_messages")
      .select("id, conversation_id, family_id, content, sources, created_at")
      .eq("id", messageId)
      .maybeSingle();

    if (message) {
      // The preceding user question — classified, then discarded.
      const { data: userMessages } = await serverClient
        .from("chat_messages")
        .select("content")
        .eq("conversation_id", message.conversation_id)
        .eq("role", "user")
        .lt("created_at", message.created_at)
        .order("created_at", { ascending: false })
        .limit(1);

      const { data: members } = await serverClient
        .from("family_members")
        .select("name")
        .eq("family_id", message.family_id);

      const question = userMessages?.[0]?.content ?? "";
      const queryKind = classifyQueryKind(
        question,
        (members ?? []).map((m) => m.name),
      );

      await serverClient.from("chat_feedback_events").insert({
        family_id: message.family_id,
        message_id: message.id,
        rating: feedback,
        reasons,
        comment,
        query_kind: queryKind,
        sources_count: Array.isArray(message.sources)
          ? message.sources.length
          : 0,
        answer_length: message.content?.length ?? 0,
      });
    }
  } catch {
    // Insights are a bonus — never fail the user's feedback action.
  }

  return Response.json({ success: true });
}
