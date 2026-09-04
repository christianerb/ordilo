import { apiJson, getApiUrl } from "./api";
import {
  CHAT_TOOL_STEP_LABELS,
  buildAssistantHistoryContext,
  formatChatActionDate,
  getChatActionContent,
  MAX_CLIENT_CHAT_HISTORY_CONTENT,
  MAX_CLIENT_CHAT_HISTORY_MESSAGES,
  mergeConfirmationProposal,
  parseChatWireEvent,
  splitChatNdjsonChunk,
  type ChatActionContent,
  type ChatActionToolName,
  type ChatFeedbackReason,
  type ChatResponseState,
  type ChatSource,
  type ChatSuggestion,
} from "@ordilo/chat-contract";
import { buildWhatsAppHref, normalizePhoneForLink } from "./contacts";
import { getSupabase } from "./supabase";

export {
  CHAT_ACTION_TOOL_NAMES,
  CHAT_FEEDBACK_REASON_OPTIONS as CHAT_FEEDBACK_REASONS,
  type ChatActionToolName,
  type ChatFeedbackReason,
  type ChatResponseState,
  type ChatSource,
  type ChatSuggestion,
} from "@ordilo/chat-contract";

/**
 * „Ordilo fragen" — chat client for the native app.
 *
 * Vertrag: POST /api/chat (NDJSON-Stream, ein JSON-Objekt pro Zeile),
 * POST /api/chat/actions (bestätigte KI-Aktionen, idempotent via
 * action_id), POST /api/chat/feedback. Fachliche Referenz ist die Web-App
 * (src/app/(app)/suche, src/lib/ai/chat.ts); die deutschen Texte und die
 * Event-Namen sind 1:1 portiert.
 *
 * Der Parser und der Event-Reducer sind reine Funktionen, damit die
 * Stream-Logik ohne Netzwerk testbar bleibt.
 */

// ---------------------------------------------------------------------------
// Types (ported from src/lib/schemas/chat.ts)
// ---------------------------------------------------------------------------

export interface AnswerCardField {
  label: string;
  value: string;
}

export type AnswerCardType =
  | "termin"
  | "aufgabe"
  | "dokument"
  | "zugangsdaten"
  | "kontakt"
  | "allgemein";

export interface AnswerCard {
  type: AnswerCardType;
  title: string;
  subtitle: string | null;
  fields: AnswerCardField[];
  actionDocumentId: string | null;
  hasSecret: boolean;
  contact?: {
    id: string;
    phone: string | null;
    email: string | null;
    action: "phone" | "email" | "whatsapp" | null;
    messageDraft: string;
  };
}

export type ChatActionState =
  | "ready"
  | "confirming"
  | "confirmed"
  | "undoing"
  | "undone"
  | "dismissed"
  | "error";

export interface ChatAction {
  id: string;
  toolName: ChatActionToolName;
  args: Record<string, unknown>;
  state: ChatActionState;
  error?: string;
  /**
   * Which operation produced the error — a failed undo must retry the
   * undo, not replay the original action.
   */
  errorOperation?: "confirm" | "undo";
  undo?: {
    id: string;
    toolName: ChatActionToolName;
    args: Record<string, unknown>;
  };
}

export type ToolCallState = "start" | "done" | "error";

export interface ToolCallProgress {
  toolName: string;
  state: ToolCallState;
}

export type ChatStreamEvent =
  | { type: "conversation"; conversationId: string }
  | { type: "tool"; toolName: string; state: ToolCallState }
  | { type: "text"; content: string }
  | { type: "replace"; content: string }
  | { type: "card"; card: AnswerCard }
  | { type: "sources"; sources: ChatSource[] }
  | { type: "suggestion"; suggestion: ChatSuggestion }
  | { type: "response_state"; state: ChatResponseState }
  | { type: "confirmation"; action: ChatAction }
  | { type: "message_saved"; messageId: string }
  | { type: "done" }
  | { type: "error"; error: string; code: string | null };

export interface ChatMessage {
  /** Local id ("user-…"/"ai-…"); dbId arrives via message_saved. */
  id: string;
  /** Local send time for the calm conversation metadata shown on-device. */
  createdAt: string;
  dbId: string | null;
  role: "user" | "assistant";
  text: string;
  card: AnswerCard | null;
  sources: ChatSource[];
  suggestion?: ChatSuggestion | null;
  responseState?: ChatResponseState;
  actions: ChatAction[];
  toolCalls: ToolCallProgress[];
  status: "streaming" | "done" | "error" | "rate_limited";
  feedback: "positive" | "negative" | null;
}

const chatMessageTimeFormatter = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
});

export function formatChatMessageTime(createdAt: string): string {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime())
    ? "Jetzt"
    : chatMessageTimeFormatter.format(date);
}

// ---------------------------------------------------------------------------
// German UI copy (ported from the web screens)
// ---------------------------------------------------------------------------

export const CHAT_ERROR_MESSAGE = "Da ist was schiefgegangen. Bitte frag nochmal.";
export const CHAT_RATE_LIMIT_MESSAGE =
  "Du hast heute viele Fragen gestellt. Das Tageslimit ist erreicht — bitte morgen weiter.";
export const CHAT_RETRY_LABEL = "Nochmal fragen";

/** Empty-state example prompts (ported 1:1 from suche-client.tsx). */
export const CHAT_EXAMPLE_PROMPTS: string[] = [
  "Zeig mir alle Dokumente von Emma",
  "Welche Fristen laufen bald ab?",
  "Finde die letzte Stromrechnung",
  "Was muss ich diese Woche erledigen?",
];

/** Live status line per tool call (ported from processing-checklist.tsx). */
export const TOOL_STEP_LABELS = CHAT_TOOL_STEP_LABELS;

export function getToolStepLabel(toolName: string): string {
  return TOOL_STEP_LABELS[toolName] ?? "Arbeitet";
}

export function getChatThinkingLabel(
  toolCalls: ToolCallProgress[],
): string {
  const active = [...toolCalls]
    .reverse()
    .find((call) => call.state === "start");
  const latest = active ?? toolCalls[toolCalls.length - 1];

  if (active) return `${getToolStepLabel(active.toolName)} …`;
  if (latest?.state === "error") return "Da ist was schiefgegangen.";
  if (latest?.state === "done") return "Ordilo formuliert die Antwort …";
  return "Ordilo denkt nach …";
}

// ---------------------------------------------------------------------------
// NDJSON parsing (pure, testable)
// ---------------------------------------------------------------------------

/**
 * Appends a raw chunk to the carry-over buffer and returns every complete
 * NDJSON line plus the incomplete tail. Lines are NOT parsed here so the
 * caller decides how to treat invalid JSON.
 */
export function splitNdjsonChunk(
  buffered: string,
  chunk: string,
): { lines: string[]; rest: string } {
  return splitChatNdjsonChunk(buffered, chunk);
}

export { mergeConfirmationProposal };

/**
 * Narrows one parsed NDJSON line to a typed stream event. Returns null
 * for anything malformed or unknown — a single broken line must never
 * kill the stream (the web client skips such lines the same way).
 */
export function parseChatStreamEvent(raw: unknown): ChatStreamEvent | null {
  const event = parseChatWireEvent(raw);
  if (!event) return null;
  if (event.type === "card") {
    return { type: "card", card: event.card as unknown as AnswerCard };
  }
  if (event.type === "confirmation") {
    return {
      type: "confirmation",
      action: { ...event.action, state: "ready" },
    };
  }
  return event;
}

// ---------------------------------------------------------------------------
// Message reducer (pure, testable)
// ---------------------------------------------------------------------------

/** Applies one stream event to the streaming assistant message. */
export function applyChatEvent(
  message: ChatMessage,
  event: ChatStreamEvent,
): ChatMessage {
  switch (event.type) {
    case "text":
      return { ...message, text: message.text + event.content };
    case "replace":
      return { ...message, text: event.content };
    case "card":
      return { ...message, card: event.card };
    case "sources":
      return { ...message, sources: event.sources };
    case "suggestion":
      return { ...message, suggestion: event.suggestion };
    case "response_state":
      return { ...message, responseState: event.state };
    case "tool": {
      const toolCalls = [...message.toolCalls];
      const openIndex = toolCalls.findIndex(
        (call) => call.toolName === event.toolName && call.state === "start",
      );
      if (event.state === "start") {
        toolCalls.push({ toolName: event.toolName, state: "start" });
      } else if (openIndex >= 0) {
        toolCalls[openIndex] = { toolName: event.toolName, state: event.state };
      } else {
        toolCalls.push({ toolName: event.toolName, state: event.state });
      }
      return { ...message, toolCalls };
    }
    case "confirmation":
      return { ...message, actions: [...message.actions, event.action] };
    case "message_saved":
      return { ...message, dbId: event.messageId };
    case "done":
      return { ...message, status: "done" };
    case "error":
      return { ...message, status: "error", text: event.error };
    case "conversation":
      return message;
  }
}

/**
 * Builds the request history the way the web client does: assistant
 * answers carry their source titles as an appended context line so the
 * model can resolve follow-ups like "und das zweite Dokument?".
 */
export function buildChatHistory(
  messages: ChatMessage[],
): { role: "user" | "assistant"; content: string }[] {
  return messages
    .filter(
      (message) =>
        message.status === "done" ||
        (message.role === "user" && message.status !== "streaming"),
    )
    .slice(-MAX_CLIENT_CHAT_HISTORY_MESSAGES)
    .map((message) => {
      if (message.role === "assistant") {
        return {
          role: "assistant" as const,
          content: buildAssistantHistoryContext({
            text: message.text,
            sources: message.sources,
            card: message.card,
          }).slice(0, MAX_CLIENT_CHAT_HISTORY_CONTENT),
        };
      }
      return {
        role: message.role,
        content: message.text.slice(0, MAX_CLIENT_CHAT_HISTORY_CONTENT),
      };
    });
}

/**
 * Undo is client-modeled (same as the web): only mark_task_done has a
 * safe inverse — re-open the task through the same confirmed endpoint.
 */
export function buildMarkTaskDoneUndo(
  action: ChatAction,
  result: unknown,
): ChatAction["undo"] {
  if (action.toolName !== "mark_task_done") return undefined;
  const taskId =
    result && typeof result === "object"
      ? (result as Record<string, unknown>).task_id
      : null;
  if (typeof taskId !== "string" || !taskId) return undefined;
  return {
    id: `${action.id}-undo`,
    toolName: "update_task",
    args: { task_id: taskId, status: "open" },
  };
}

// ---------------------------------------------------------------------------
// Action card content (ported from ordilo-action-card.tsx)
// ---------------------------------------------------------------------------

export type ActionCardContent = ChatActionContent;

export function formatChatDate(
  iso: string | null | undefined,
): string | null {
  return formatChatActionDate(iso);
}

/** Shared cross-platform copy and details for a proposed action card. */
export function getActionContent(action: ChatAction): ActionCardContent {
  return getChatActionContent(action);
}

// ---------------------------------------------------------------------------
// Suggested contact action (answer cards of type "kontakt")
// ---------------------------------------------------------------------------

export interface SuggestedContactAction {
  href: string;
  label: string;
}

/**
 * Builds the deep link for the server-suggested contact action,
 * preserving the verified message draft. Without this a prompt like
 * „Schreib Ursula bei WhatsApp, dass wir später kommen" would open an
 * empty composer even though the server supplied the text.
 */
export function getSuggestedContactAction(
  contact: AnswerCard["contact"],
): SuggestedContactAction | null {
  if (!contact?.action) return null;
  const draft = contact.messageDraft?.trim() ?? "";

  switch (contact.action) {
    case "whatsapp": {
      if (!contact.phone) return null;
      const href = buildWhatsAppHref(contact.phone, draft);
      return href
        ? {
            href,
            label: draft ? "WhatsApp-Nachricht schreiben" : "WhatsApp öffnen",
          }
        : null;
    }
    case "email": {
      if (!contact.email) return null;
      const query = draft ? `?body=${encodeURIComponent(draft)}` : "";
      return { href: `mailto:${contact.email}${query}`, label: "E-Mail schreiben" };
    }
    case "phone": {
      if (!contact.phone) return null;
      const normalized = normalizePhoneForLink(contact.phone);
      return normalized ? { href: `tel:${normalized}`, label: "Anrufen" } : null;
    }
  }
}

// ---------------------------------------------------------------------------
// Networking
// ---------------------------------------------------------------------------

export interface ChatRequestInput {
  message: string;
  familyId: string;
  history: { role: "user" | "assistant"; content: string }[];
  conversationId?: string | null;
  repair?: {
    messageId: string;
    reasons: ChatFeedbackReason[];
    comment?: string;
  };
}

/**
 * Streams one chat answer. Events arrive via onEvent in wire order;
 * HTTP errors throw (the caller maps 401/429/… to the German UI states).
 *
 * Uses expo/fetch instead of the global fetch: only it exposes the
 * response body as a ReadableStream on native, which the NDJSON chat
 * stream needs. Imported lazily so unit tests never load the native
 * module.
 */
export async function streamChat(
  input: ChatRequestInput,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<void> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("Nicht angemeldet. Bitte melde dich erneut an.");
  }

  const { fetch: streamingFetch } = await import("expo/fetch");
  const response = await streamingFetch(`${getApiUrl()}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      message: input.message,
      family_id: input.familyId,
      history: input.history,
      capabilities: ["web_source_urls"],
      ...(input.conversationId ? { conversation_id: input.conversationId } : {}),
      ...(input.repair
        ? {
            repair: {
              message_id: input.repair.messageId,
              reasons: input.repair.reasons,
              ...(input.repair.comment
                ? { comment: input.repair.comment }
                : {}),
            },
          }
        : {}),
    }),
  });

  if (!response.ok) {
    const error = new Error("Chat request failed") as Error & {
      status: number;
    };
    error.status = response.status;
    throw error;
  }

  if (!response.body) throw new Error("Chat stream fehlt.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const { lines, rest } = splitNdjsonChunk(
        buffered,
        decoder.decode(value, { stream: true }),
      );
      buffered = rest;
      for (const line of lines) {
        try {
          const event = parseChatStreamEvent(JSON.parse(line));
          if (event) onEvent(event);
        } catch {
          // Skip unparseable lines — one bad line must not kill the stream.
        }
      }
    }
    // Flush a trailing line without newline terminator.
    if (buffered.trim()) {
      try {
        const event = parseChatStreamEvent(JSON.parse(buffered));
        if (event) onEvent(event);
      } catch {
        // ignore
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export interface ChatActionResponse {
  success: boolean;
  duplicate?: boolean;
  message?: string;
  result?: unknown;
  error?: string;
}

/** Confirms (or undoes) a proposed write. Idempotent via action.id. */
export async function confirmChatAction(
  familyId: string,
  action: { id: string; toolName: ChatActionToolName; args: Record<string, unknown> },
): Promise<ChatActionResponse> {
  return apiJson<ChatActionResponse>("/api/chat/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      family_id: familyId,
      action_id: action.id,
      tool_name: action.toolName,
      args: action.args,
    }),
  });
}

/** Attaches thumbs up/down to a persisted assistant message. */
export async function sendChatFeedback(input: {
  messageId: string;
  feedback: "positive" | "negative";
  reasons?: ChatFeedbackReason[];
  comment?: string;
  repairRequested?: boolean;
}): Promise<void> {
  await apiJson("/api/chat/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message_id: input.messageId,
      feedback: input.feedback,
      ...(input.reasons?.length ? { reasons: input.reasons } : {}),
      ...(input.comment?.trim() ? { comment: input.comment.trim() } : {}),
      ...(input.repairRequested ? { repair_requested: true } : {}),
    }),
  });
}
