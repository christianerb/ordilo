import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { parseJsonBody } from "@/lib/api/parse-json";
import { methodNotAllowed } from "@/lib/api/respond";
import {
  streamAgenticAnswer,
  ChatError,
  type HistoryMessage,
} from "@/lib/ai/chat";
import type { ToolContext } from "@/lib/ai/tools";
import {
  chatRequestSchema,
  type ChatErrorResponse,
} from "@/lib/schemas/chat";
import {
  getOrCreateConversation,
  loadConversationMessages,
  saveUserMessage,
  saveAssistantMessage,
  rowsToHistory,
  autoGenerateTitle,
  updateConversationTitle,
} from "@/lib/ai/chat-history";
import { checkRateLimit, recordUsage } from "@/lib/ai/rate-limit";
import { recordProductEvent } from "@/lib/analytics/product-events";

/**
 * POST /api/chat — Agentic chat with OpenAI function calling (streaming).
 *
 * Returns a streaming response (NDJSON: one JSON object per line).
 *
 * Stream events:
 *   {"type":"text","content":"chunk"}               — answer text chunk
 *   {"type":"replace","content":"..."}              — replaces the text streamed so far
 *                                                     (guardrail correction or scratchpad
 *                                                     retraction before tool calls)
 *   {"type":"card","card":{...}}                     — structured answer card
 *   {"type":"sources","sources":[...]}              — accumulated document sources
 *   {"type":"confirmation_request",...}             — destructive action needs confirmation
 *   {"type":"conversation", "conversation_id":"..."} — conversation ID for persistence
 *   {"type":"done"}                                  — stream complete
 *   {"type":"error","error":"...","code":"..."}      — error
 *
 * Input:  { message: string (max 4000 chars), family_id: string (UUID),
 *           history?: HistoryMessage[], conversation_id?: string }
 *
 * Auth:   401 without session, 403 when the user is not a member of
 *         the family identified by family_id.
 * Rate:   429 (RATE_LIMIT_EXCEEDED) when daily message limit is reached.
 * Errors: 400 (invalid input), 403 (not a family member), 500 (server
 *         error) — returned as JSON before streaming begins. Stream-level
 *         errors are sent as NDJSON.
 */

export async function POST(request: Request): Promise<Response> {
  // Wall-clock start for the chat_metrics log — time-to-first-word is
  // measured from the user's perspective, auth and validation included.
  const requestStartedAt = Date.now();

  // 1. Authenticate
  const auth = await requireUser();
  if (auth.status) {
    const body: ChatErrorResponse = auth.json;
    return Response.json(body, { status: auth.status });
  }
  const user = auth.user;

  // 2. Parse & validate (Zod: non-empty message capped at
  //    MAX_CHAT_MESSAGE_LENGTH, UUID family_id, optional history and
  //    conversation_id)
  const parsed = await parseJsonBody(request, chatRequestSchema, {
    invalidPayload: "Anfrage ungültig (message und family_id erforderlich).",
    payloadCode: "INVALID_CHAT_INPUT",
  });
  if (!parsed.ok) return parsed.response;

  const { message, family_id: familyId, history: clientHistory } = parsed.data;
  const conversationIdParam = parsed.data.conversation_id;

  // 3. Dev-only failure simulation (header-controlled)
  if (request.headers.get("x-dev-simulate-failure") === "chat") {
    const body: ChatErrorResponse = {
      error: "Simulated OpenAI failure.",
      code: "OPENAI_API_ERROR",
    };
    return Response.json(body, { status: 500 });
  }

  // 4. Build server client
  const serverClient = await createServerClient();

  // 5-8. Membership check, rate limit, conversation history, and speaker
  //      identity are independent of each other — all of them only need
  //      the validated input — so they run concurrently instead of
  //      stacking sequential database round-trips onto every message's
  //      time-to-first-word.
  const [membershipResult, rateLimit, conversation, speakerName] =
    await Promise.all([
      // Membership: the client-supplied family_id is otherwise unverified:
      // a non-member would pass the rate-limit check (RLS hides the
      // chat_usage row, so "no row" reads as "under the limit") and
      // trigger OpenAI calls that recordUsage can never attribute. The
      // membership row is only visible under RLS when the user belongs to
      // the family, so "no row" means "no access" (for both non-members
      // and nonexistent families).
      serverClient
        .from("family_memberships")
        .select("family_id")
        .eq("family_id", familyId)
        .eq("user_id", user.id)
        .maybeSingle(),
      // Rate limit check — prevent cost runaway per family.
      checkRateLimit(serverClient, familyId),
      // Conversation LOOKUP (read-only): finds an existing conversation
      // and its history. Creating a new conversation is deferred until
      // the request is authorized (membership + rate limit below) —
      // otherwise rejected submissions would populate the chat history
      // with empty conversations.
      (async (): Promise<
        | {
            kind: "existing";
            conversationId: string;
            dbHistory: HistoryMessage[];
            needsTitle: boolean;
          }
        | { kind: "create" }
        | { kind: "fallback"; dbHistory: HistoryMessage[] }
      > => {
        try {
          if (!conversationIdParam) return { kind: "create" };

          const { data: conv } = await serverClient
            .from("chat_conversations")
            .select("id, title")
            .eq("id", conversationIdParam)
            .eq("family_id", familyId)
            .maybeSingle();

          if (!conv) return { kind: "create" };

          const rows = await loadConversationMessages(serverClient, conv.id);
          return {
            kind: "existing",
            conversationId: conv.id,
            dbHistory: rowsToHistory(rows),
            // If the conversation has no title, we'll auto-generate one
            // from this message.
            needsTitle: !conv.title,
          };
        } catch {
          // If persistence fails, fall back to client-provided history so
          // the chat still works. The conversation just won't be persisted.
          return { kind: "fallback", dbHistory: clientHistory };
        }
      })(),
      // Speaker identity — the family member linked to the current auth
      // user, so the assistant knows who it's talking to.
      (async (): Promise<string | null> => {
        try {
          const { data: linkedMember } = await serverClient
            .from("family_members")
            .select("name")
            .eq("family_id", familyId)
            .eq("linked_user_id", user.id)
            .maybeSingle();

          return linkedMember?.name ?? null;
        } catch {
          return null;
        }
      })(),
    ]);

  const { data: membership } = membershipResult;
  if (!membership) {
    const body: ChatErrorResponse = {
      error: "Kein Zugriff auf diese Familie.",
      code: "FAMILY_ACCESS_DENIED",
    };
    return Response.json(body, { status: 403 });
  }

  if (!rateLimit.allowed) {
    const body: ChatErrorResponse = {
      error: `Tageslimit erreicht (${rateLimit.used} Nachrichten heute). Bitte morgen erneut versuchen.`,
      code: "RATE_LIMIT_EXCEEDED",
    };
    return Response.json(body, { status: 429 });
  }

  // 8b. Resolve the conversation now that the request is authorized.
  //     Only this step may CREATE one — a rejected request (403/429
  //     above) never leaves an empty conversation behind.
  let conversationId = "";
  let dbHistory: HistoryMessage[];
  let needsTitle = false;

  if (conversation.kind === "existing") {
    conversationId = conversation.conversationId;
    dbHistory = conversation.dbHistory;
    needsTitle = conversation.needsTitle;
  } else if (conversation.kind === "create") {
    try {
      conversationId = await getOrCreateConversation(serverClient, familyId);
      // A freshly created conversation has no messages yet.
      dbHistory = [];
      needsTitle = true;
    } catch {
      // Persistence failure must not break the chat — fall back to the
      // client-provided history, the turn just won't be saved.
      dbHistory = clientHistory;
    }
  } else {
    dbHistory = conversation.dbHistory;
  }

  // Auto-generate a title for a new/untitled conversation once this is
  // its first message.
  if (conversationId && needsTitle && dbHistory.length === 0) {
    const title = autoGenerateTitle(message);
    void updateConversationTitle(serverClient, conversationId, title);
  }

  // 9. Save the user message to the conversation (best-effort)
  if (conversationId) {
    void saveUserMessage(serverClient, conversationId, familyId, message);
  }
  void recordProductEvent(serverClient, {
    userId: user.id,
    familyId,
    eventName: "chat_question_sent",
  });

  // 10. Build tool context with speaker identity
  const toolContext: ToolContext = {
    client: serverClient,
    familyId,
    sources: [],
    speakerName,
  };

  // 11. Merge DB history with client history (client history takes
  //     precedence as it may include the most recent exchanges not yet
  //     persisted). Use DB history if client history is empty.
  const effectiveHistory =
    clientHistory.length > 0 ? clientHistory : dbHistory;

  try {
    const stream = await streamAgenticAnswer(
      message,
      effectiveHistory,
      toolContext,
    );

    // Wrap the stream to intercept the final answer for persistence and
    // inject the conversation_id event at the start.
    const encoder = new TextEncoder();
    const wrappedStream = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        // Send conversation ID first so the client can reference it.
        if (conversationId) {
          ctrl.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "conversation",
                conversation_id: conversationId,
              }) + "\n",
            ),
          );
        }

        let fullAnswer = "";
        let answerCard = null;
        let streamError = false;
        // Latency/activity metrics, logged once per request so chat speed
        // is measurable instead of guessed (time-to-first-visible-word
        // from the user's perspective, tool calls per answer).
        let firstVisibleAt: number | null = null;
        let toolCallCount = 0;

        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.trim()) continue;
              ctrl.enqueue(encoder.encode(line + "\n"));

              // Intercept for persistence
              try {
                const data = JSON.parse(line);
                if (data.type === "text") {
                  fullAnswer += data.content;
                  firstVisibleAt ??= Date.now();
                } else if (data.type === "replace") {
                  // Guardrail correction or scratchpad retraction — the
                  // persisted answer mirrors what the client ends up seeing.
                  fullAnswer =
                    typeof data.content === "string" ? data.content : "";
                } else if (data.type === "card") {
                  answerCard = data.card;
                  firstVisibleAt ??= Date.now();
                } else if (data.type === "tool" && data.state === "start") {
                  toolCallCount += 1;
                } else if (data.type === "error") {
                  streamError = true;
                }
              } catch {
                // Ignore unparseable lines
              }
            }
          }

          // Flush remaining buffer
          if (buffer.trim()) {
            ctrl.enqueue(encoder.encode(buffer + "\n"));
          }
        } finally {
          reader.releaseLock();
        }

        // 12. Persist the assistant message (best-effort, non-blocking)
        if (conversationId && fullAnswer && !streamError) {
          void saveAssistantMessage(
            serverClient,
            conversationId,
            familyId,
            fullAnswer,
            toolContext.sources,
            answerCard,
          );
        }

        // 13. Record usage (best-effort, non-blocking)
        void recordUsage(serverClient, familyId, 0);

        // 14. One structured metrics line per request — queryable in the
        //     log drain for p50/p95 time-to-first-word and tool-call rate.
        console.info(
          JSON.stringify({
            event: "chat_metrics",
            family_id: familyId,
            conversation_id: conversationId || null,
            ttft_ms:
              firstVisibleAt === null
                ? null
                : firstVisibleAt - requestStartedAt,
            total_ms: Date.now() - requestStartedAt,
            tool_calls: toolCallCount,
            answer_type: answerCard ? "card" : "text",
            error: streamError,
          }),
        );

        ctrl.close();
      },
    });

    return new Response(wrappedStream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    if (err instanceof ChatError) {
      const body: ChatErrorResponse = {
        error: err.message,
        code: err.code,
      };
      return Response.json(body, { status: err.statusCode ?? 500 });
    }

    const body: ChatErrorResponse = {
      error: "Ein unerwarteter Fehler ist aufgetreten.",
      code: "CHAT_FAILED",
    };
    return Response.json(body, { status: 500 });
  }
}

export async function GET(): Promise<Response> {
  return methodNotAllowed();
}
