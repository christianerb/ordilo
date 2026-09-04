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
  type AnswerCard,
  type ChatErrorResponse,
} from "@/lib/schemas/chat";
import {
  extractHistoryEvidence,
  parseChatWireEvent,
  splitChatNdjsonChunk,
} from "@ordilo/chat-contract";
import {
  getOrCreateConversation,
  loadConversationMessages,
  saveUserMessage,
  saveAssistantMessage,
  replaceAssistantMessage,
  rowsToHistory,
  appendUnpersistedClientSuffix,
  autoGenerateTitle,
  updateConversationTitle,
  type PersistedChatAction,
  type ChatMessageRow,
} from "@/lib/ai/chat-history";
import { checkRateLimit, recordUsage } from "@/lib/ai/rate-limit";
import { redactSecretsForStorage } from "@/lib/ai/pii-redact";
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
 *   {"type":"message_saved","message_id":"..."}      — persisted assistant message id
 *                                                     (after "done"; lets clients attach
 *                                                     feedback to a freshly streamed answer)
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

  const {
    message,
    display_message: displayMessage,
    capabilities,
    family_id: familyId,
    history: clientHistory,
    repair,
  } = parsed.data;
  const supportsWebSourceUrls = capabilities.includes("web_source_urls");
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
  const [membershipResult, rateLimit, conversation, familyMembersResult] =
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
            rows: ChatMessageRow[];
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
            rows,
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
      // One family-member read serves both speaker identity and the system
      // prompt, avoiding a second query inside the streaming path.
      serverClient
        .from("family_members")
        .select("name, role, linked_user_id")
        .eq("family_id", familyId)
        .order("created_at", { ascending: true }),
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

  const familyMembers = (familyMembersResult.data ?? []).map((member) => ({
    name: member.name,
    role: member.role,
  }));
  const speakerName =
    familyMembersResult.data?.find(
      (member) => member.linked_user_id === user.id,
    )?.name ?? null;

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

  let messageForAgent = message;
  let repairHistory: HistoryMessage[] | null = null;
  let repairMessageId: string | null = null;

  if (repair) {
    if (!conversationId || conversation.kind !== "existing") {
      return Response.json(
        {
          error: "Die Antwort kann in dieser Unterhaltung nicht verbessert werden.",
          code: "REPAIR_CONVERSATION_REQUIRED",
        } satisfies ChatErrorResponse,
        { status: 400 },
      );
    }

    const rows = conversation.rows;
    const targetIndex = rows.findIndex(
      (row) =>
        row.id === repair.message_id &&
        row.role === "assistant" &&
        row.family_id === familyId,
    );
    if (targetIndex < 1) {
      return Response.json(
        {
          error: "Die Antwort wurde nicht gefunden.",
          code: "REPAIR_MESSAGE_NOT_FOUND",
        } satisfies ChatErrorResponse,
        { status: 404 },
      );
    }

    const questionIndex = rows
      .slice(0, targetIndex)
      .map((row, index) => ({ row, index }))
      .reverse()
      .find(({ row }) => row.role === "user")?.index;
    if (questionIndex === undefined) {
      return Response.json(
        {
          error: "Die ursprüngliche Frage wurde nicht gefunden.",
          code: "REPAIR_QUESTION_NOT_FOUND",
        } satisfies ChatErrorResponse,
        { status: 400 },
      );
    }

    const reasonLabels = repair.reasons
      .map((reason) => {
        if (reason === "falsche_antwort") return "Die Antwort war falsch.";
        if (reason === "falsches_dokument") return "Die Quelle war falsch.";
        return "Die Antwort war unvollständig.";
      })
      .join(" ");
    messageForAgent =
      `${rows[questionIndex].content}\n\n` +
      `[Verbesserungshinweis: ${reasonLabels}${
        repair.comment ? ` ${repair.comment}` : ""
      } Suche wirklich neu und liefere eine bessere, direkt belegte Antwort.]`;
    repairHistory = rowsToHistory(rows.slice(0, questionIndex));
    repairMessageId = repair.message_id;
  }

  // Everything that outlives the request is stored password-free. The
  // model still works on the message as typed — it has to, to act on it —
  // but `documents.secret` exists so that no password sits in the
  // database in plain text, and a chat message is stored verbatim.
  const messageForStorage = redactSecretsForStorage(displayMessage ?? message);

  // Auto-generate a title for a new/untitled conversation once this is
  // its first message.
  if (!repair && conversationId && needsTitle && dbHistory.length === 0) {
    const title = autoGenerateTitle(messageForStorage);
    void updateConversationTitle(serverClient, conversationId, title);
  }

  // 9. Save the user message to the conversation (best-effort)
  if (!repair && conversationId) {
    void saveUserMessage(serverClient, conversationId, familyId, messageForStorage);
  }
  void recordProductEvent(serverClient, {
    userId: user.id,
    familyId,
    eventName: repair ? "chat_answer_repair_started" : "chat_question_sent",
  });

  // 10. Build tool context with speaker identity
  const toolContext: ToolContext = {
    client: serverClient,
    familyId,
    sources: [],
    suggestion: null,
    searchedScopes: new Set(),
    responseState: "answered",
    speakerName,
    preloadedFamilyMembers: familyMembers,
    preloadedFamilyMembersPrivacyReady: !familyMembersResult.error,
    // Private excerpts from earlier turns join the Web-search guard: the
    // per-turn source list starts empty, so a query copied from a prior
    // answer would otherwise reach the public Web search unchecked.
    historyExcerpts: [
      ...(conversation.kind === "existing"
        ? conversation.rows.flatMap((row) =>
            (row.sources ?? [])
              .filter((source) => source.origin !== "web")
              .map((source) => source.excerpt)
              .filter((excerpt) => excerpt.trim().length > 0),
          )
        : []),
      // The client-history fallback and any accepted unpersisted suffix
      // carry the same private excerpts — the guard must see them even
      // when no persisted rows are available for those turns.
      ...extractHistoryEvidence(clientHistory),
    ],
    userId: user.id,
  };

  // 11. Existing conversations use the RLS-verified server history as the
  //     source of truth. Client history is only a resilience fallback when
  //     persistence itself could not be read.
  const effectiveHistory =
    repairHistory ??
    (conversation.kind === "existing"
      ? appendUnpersistedClientSuffix(dbHistory, clientHistory)
      : clientHistory);

  try {
    const stream = await streamAgenticAnswer(
      messageForAgent,
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
        let answerCard: AnswerCard | null = null;
        let streamError = false;
        let streamDone = false;
        let repairPersistenceFailed = false;
        // Write proposals emitted this round — persisted with the message
        // so a page reload restores the action cards instead of leaving
        // answer text that points at cards that no longer exist.
        const pendingActions: PersistedChatAction[] = [];
        // Latency/activity metrics, logged once per request so chat speed
        // is measurable instead of guessed (time-to-first-visible-word
        // from the user's perspective, tool calls per answer).
        let firstVisibleAt: number | null = null;

        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const forwardLine = (line: string) => {
          if (!line.trim()) return;

          try {
            const raw: unknown = JSON.parse(line);
            // The wrapper persists output from our own server stream. Keep
            // older structured card shapes for storage compatibility even
            // though current Web/iOS clients only render validated answer
            // cards at their public wire boundary.
            if (
              raw &&
              typeof raw === "object" &&
              !Array.isArray(raw) &&
              (raw as Record<string, unknown>).type === "card"
            ) {
              const card = (raw as Record<string, unknown>).card;
              if (card && typeof card === "object" && !Array.isArray(card)) {
                answerCard = card as unknown as AnswerCard;
                firstVisibleAt ??= Date.now();
              }
              ctrl.enqueue(encoder.encode(line + "\n"));
              return;
            }

            const event = parseChatWireEvent(raw);
            if (!event) {
              ctrl.enqueue(encoder.encode(line + "\n"));
              return;
            }
            // `done` is terminal for clients. Hold it until the best-effort
            // persistence event has been emitted, so freshly streamed
            // answers can receive feedback immediately.
            if (event.type === "done") {
              streamDone = true;
              return;
            }

            const outboundLine =
              event.type === "sources" && !supportsWebSourceUrls
                ? JSON.stringify({
                    type: "sources",
                    sources: event.sources.filter(
                      (source) => source.origin !== "web",
                    ),
                  })
                : line;
            ctrl.enqueue(encoder.encode(outboundLine + "\n"));

            if (event.type === "text") {
              fullAnswer += event.content;
              firstVisibleAt ??= Date.now();
            } else if (event.type === "replace") {
              // Guardrail correction or scratchpad retraction — the
              // persisted answer mirrors what the client ends up seeing.
              fullAnswer = event.content;
            } else if (event.type === "confirmation") {
              pendingActions.push({
                action_id: event.action.id,
                tool_name: event.action.toolName,
                action_args: event.action.args,
              });
            } else if (event.type === "error") {
              streamError = true;
            }
          } catch {
            // Preserve malformed upstream lines for clients while keeping
            // persistence best-effort.
            ctrl.enqueue(encoder.encode(line + "\n"));
          }
        };

        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = splitChatNdjsonChunk(
              buffer,
              decoder.decode(value, { stream: true }),
            );
            buffer = chunk.rest;

            for (const line of chunk.lines) {
              forwardLine(line);
            }
          }

          // Flush remaining buffer
          if (buffer.trim()) {
            forwardLine(buffer);
          }
        } finally {
          reader.releaseLock();
        }

        // 12. Persist the assistant message (best-effort). The persisted
        //     id is announced before the final `done` event so clients
        //     without server-rendered history (mobile) can attach feedback
        //     to the answer they just watched stream in. The web client
        //     ignores unknown event types, so this is backwards-compatible.
        if (conversationId && (fullAnswer || answerCard) && !streamError) {
          try {
            const persistedAnswer = redactSecretsForStorage(fullAnswer);
            const savedMessageId = repairMessageId
              ? await replaceAssistantMessage(
                  serverClient,
                  {
                    messageId: repairMessageId,
                    familyId,
                    content: persistedAnswer,
                    sources: toolContext.sources,
                    card: answerCard,
                    actions: pendingActions,
                    responseState: toolContext.responseState ?? "answered",
                    suggestion: toolContext.suggestion ?? null,
                  },
                )
              : await saveAssistantMessage(
                  serverClient,
                  {
                    conversationId,
                    familyId,
                    content: persistedAnswer,
                    sources: toolContext.sources,
                    card: answerCard,
                    actions: pendingActions,
                    responseState: toolContext.responseState ?? "answered",
                    suggestion: toolContext.suggestion ?? null,
                  },
                );
            if (savedMessageId) {
              ctrl.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: "message_saved",
                    message_id: savedMessageId,
                  }) + "\n",
                ),
              );
            } else if (repairMessageId) {
              repairPersistenceFailed = true;
            }
          } catch {
            // New answers remain best-effort. A repair is different: success
            // means replacing the old row, so it must fail honestly.
            if (repairMessageId) repairPersistenceFailed = true;
          }
        }

        if (repairPersistenceFailed) {
          ctrl.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "error",
                error:
                  "Die bessere Antwort konnte nicht gespeichert werden. Bitte versuch es noch einmal.",
                code: "REPAIR_SAVE_FAILED",
              }) + "\n",
            ),
          );
          streamError = true;
        } else if (streamDone) {
          ctrl.enqueue(encoder.encode(JSON.stringify({ type: "done" }) + "\n"));
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
            tool_calls: toolContext.toolCallCount ?? 0,
            answer_type: answerCard ? "card" : "text",
            response_state: toolContext.responseState ?? "answered",
            knowledge_spaces: [
              ...(toolContext.searchedScopes?.has("family")
                ? ["family"]
                : []),
              ...(toolContext.searchedScopes?.has("web") ? ["web"] : []),
              ...(toolContext.searchedScopes?.size === 0 ? ["general"] : []),
            ],
            repair: Boolean(repairMessageId),
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
