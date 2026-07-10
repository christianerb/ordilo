import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  streamAgenticAnswer,
  ChatError,
  type HistoryMessage,
} from "@/lib/ai/chat";
import type { ToolContext } from "@/lib/ai/tools";
import type { ChatErrorResponse } from "@/lib/schemas/chat";
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

/**
 * POST /api/chat — Agentic chat with OpenAI function calling (streaming).
 *
 * Returns a streaming response (NDJSON: one JSON object per line).
 *
 * Stream events:
 *   {"type":"text","content":"chunk"}               — answer text chunk
 *   {"type":"card","card":{...}}                     — structured answer card
 *   {"type":"sources","sources":[...]}              — accumulated document sources
 *   {"type":"confirmation_request",...}             — destructive action needs confirmation
 *   {"type":"conversation", "conversation_id":"..."} — conversation ID for persistence
 *   {"type":"done"}                                  — stream complete
 *   {"type":"error","error":"...","code":"..."}      — error
 *
 * Input:  { message: string, family_id: string, history?: HistoryMessage[] }
 *
 * Auth:   401 without session.
 * Rate:   429 (RATE_LIMIT_EXCEEDED) when daily message limit is reached.
 * Errors: 400 (invalid input), 500 (server error) — returned as JSON
 *         before streaming begins. Stream-level errors are sent as NDJSON.
 */

export async function POST(request: Request): Promise<Response> {
  // 1. Authenticate
  const auth = await requireUser();
  if (auth.status) {
    const body: ChatErrorResponse = auth.json;
    return Response.json(body, { status: auth.status });
  }
  const user = auth.user;

  // 2. Parse & validate
  let message: string;
  let familyId: string;
  let clientHistory: HistoryMessage[] = [];
  let conversationIdParam: string | undefined;

  try {
    const json = await request.json();
    if (
      !json?.message ||
      typeof json.message !== "string" ||
      !json.family_id
    ) {
      const body: ChatErrorResponse = {
        error: "Anfrage ungültig (message und family_id erforderlich).",
        code: "INVALID_CHAT_INPUT",
      };
      return Response.json(body, { status: 400 });
    }
    message = json.message;
    familyId = json.family_id;
    if (json.history && Array.isArray(json.history)) {
      clientHistory = json.history;
    }
    if (json.conversation_id && typeof json.conversation_id === "string") {
      conversationIdParam = json.conversation_id;
    }
  } catch {
    const body: ChatErrorResponse = {
      error: "Anfrage konnte nicht gelesen werden.",
      code: "INVALID_JSON",
    };
    return Response.json(body, { status: 400 });
  }

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

  // 5. Rate limit check — prevent cost runaway per family
  const rateLimit = await checkRateLimit(serverClient, familyId);
  if (!rateLimit.allowed) {
    const body: ChatErrorResponse = {
      error: `Tageslimit erreicht (${rateLimit.used} Nachrichten heute). Bitte morgen erneut versuchen.`,
      code: "RATE_LIMIT_EXCEEDED",
    };
    return Response.json(body, { status: 429 });
  }

  // 6. Load or create conversation for history persistence
  let conversationId: string;
  let dbHistory: HistoryMessage[];
  let isNewConversation = false;
  try {
    // Check if conversation already has messages
    const existingId = conversationIdParam;
    if (existingId) {
      const { data: conv } = await serverClient
        .from("chat_conversations")
        .select("id, title")
        .eq("id", existingId)
        .eq("family_id", familyId)
        .maybeSingle();

      if (conv) {
        conversationId = conv.id;
        // If the conversation has no title, we'll auto-generate one from this message
        if (!conv.title) {
          isNewConversation = true;
        }
      } else {
        conversationId = await getOrCreateConversation(serverClient, familyId);
        isNewConversation = true;
      }
    } else {
      conversationId = await getOrCreateConversation(serverClient, familyId);
      isNewConversation = true;
    }

    const rows = await loadConversationMessages(serverClient, conversationId);
    dbHistory = rowsToHistory(rows);

    // If this is the first message, auto-generate a title
    if (isNewConversation && dbHistory.length === 0) {
      const title = autoGenerateTitle(message);
      void updateConversationTitle(serverClient, conversationId, title);
    }
  } catch {
    // If persistence fails, fall back to client-provided history so the
    // chat still works. The conversation just won't be persisted.
    conversationId = "";
    dbHistory = clientHistory;
  }

  // 7. Resolve speaker identity — look up the family member linked to
  //    the current auth user. This lets the assistant know who it's
  //    talking to (e.g. "Du sprichst gerade mit: Emma").
  let speakerName: string | null = null;
  try {
    const { data: linkedMember } = await serverClient
      .from("family_members")
      .select("name")
      .eq("family_id", familyId)
      .eq("linked_user_id", user.id)
      .maybeSingle();

    speakerName = linkedMember?.name ?? null;
  } catch {
    speakerName = null;
  }

  // 8. Save the user message to the conversation (best-effort)
  if (conversationId) {
    void saveUserMessage(serverClient, conversationId, familyId, message);
  }

  // 9. Build tool context with speaker identity
  const toolContext: ToolContext = {
    client: serverClient,
    familyId,
    sources: [],
    speakerName,
  };

  // 10. Merge DB history with client history (client history takes
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
                } else if (data.type === "card") {
                  answerCard = data.card;
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

        // 11. Persist the assistant message (best-effort, non-blocking)
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

        // 12. Record usage (best-effort, non-blocking)
        void recordUsage(serverClient, familyId, 0);

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
  const body: ChatErrorResponse = {
    error: "Methode nicht erlaubt. Bitte POST verwenden.",
    code: "METHOD_NOT_ALLOWED",
  };
  return Response.json(body, { status: 405 });
}
