import { apiFetch } from "./api";
import {
  type AnswerCard,
  type ChatAction,
  type ChatMessage,
  type ChatSource,
} from "./chat";
import { getSupabase } from "./supabase";
import {
  isChatActionToolName,
  isChatResponseState,
  isChatSuggestion,
  MAX_CHAT_CONVERSATIONS,
} from "@ordilo/chat-contract";

/**
 * Past conversations with Ordilo. Reads go straight to Supabase under RLS
 * (the same tables the web's suche page reads); deleting goes through the
 * API so the server owns the cascade. Persisted action proposals come
 * back as "ready" cards — re-confirming is safe because the confirmation
 * endpoint deduplicates on the action id.
 */

export interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ConversationRow {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: unknown;
  card: unknown;
  actions: unknown;
  feedback?: string | null;
  response_state?: unknown;
  suggestion?: unknown;
  created_at: string;
}

export const CONVERSATION_LIST_LIMIT = MAX_CHAT_CONVERSATIONS;

export async function listConversations(
  familyId: string,
  limit = CONVERSATION_LIST_LIMIT,
): Promise<ConversationSummary[]> {
  const { data, error } = await getSupabase()
    .from("chat_conversations")
    .select("id, title, created_at, updated_at")
    .eq("family_id", familyId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as ConversationRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function loadConversationMessages(
  conversationId: string,
  limit = 60,
): Promise<ChatMessage[]> {
  const { data, error } = await getSupabase()
    .from("chat_messages")
    // No `feedback` here: the production schema does not carry that column
    // on chat_messages (migration 0014 declares it), and PostgREST rejects the
    // whole query for one unknown column. Restored answers start without a
    // rating; a new thumbs-up/down still posts to the API.
    .select("id, role, content, sources, card, actions, response_state, suggestion, created_at")
    .eq("conversation_id", conversationId)
    // Newest first, then reversed for display: a long conversation must
    // reopen on its most recent turns, not on the oldest `limit` of them
    // (those would also be the history the next question carries).
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as MessageRow[]).slice().reverse().map(rowToChatMessage);
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await apiFetch(`/api/conversations/${conversationId}`, { method: "DELETE" });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A persisted row becomes the same message shape the live stream produces. */
export function rowToChatMessage(row: MessageRow): ChatMessage {
  const sources: ChatSource[] = Array.isArray(row.sources)
    ? (row.sources as unknown[]).flatMap((entry) => {
        const source = asRecord(entry);
        if (!source || typeof source.document_id !== "string") return [];
        return [{
          document_id: source.document_id,
          title: typeof source.title === "string" ? source.title : null,
          excerpt: typeof source.excerpt === "string" ? source.excerpt : "",
          score: typeof source.score === "number" ? source.score : 0,
          origin:
            source.origin === "semantic" ||
            source.origin === "graph" ||
            source.origin === "web"
              ? source.origin
              : undefined,
          url: typeof source.url === "string" ? source.url : undefined,
        }];
      })
    : [];
  const cardRecord = asRecord(row.card);
  const card: AnswerCard | null =
    cardRecord && typeof cardRecord.title === "string"
      ? {
          type: (typeof cardRecord.type === "string" ? cardRecord.type : "allgemein") as AnswerCard["type"],
          title: cardRecord.title,
          subtitle: typeof cardRecord.subtitle === "string" ? cardRecord.subtitle : null,
          fields: Array.isArray(cardRecord.fields)
            ? (cardRecord.fields as unknown[]).flatMap((field) => {
                const record = asRecord(field);
                return record && typeof record.label === "string" && typeof record.value === "string"
                  ? [{ label: record.label, value: record.value }]
                  : [];
              })
            : [],
          actionDocumentId:
            typeof cardRecord.actionDocumentId === "string"
              ? cardRecord.actionDocumentId
              : typeof cardRecord.action_document_id === "string"
                ? cardRecord.action_document_id
                : null,
          hasSecret: cardRecord.hasSecret === true || cardRecord.has_secret === true,
        }
      : null;
  const actions: ChatAction[] = Array.isArray(row.actions)
    ? (row.actions as unknown[]).flatMap((entry) => {
        const action = asRecord(entry);
        if (
          !action ||
          typeof action.action_id !== "string" ||
          !isChatActionToolName(action.tool_name)
        ) {
          return [];
        }
        return [{
          id: action.action_id,
          toolName: action.tool_name,
          args: asRecord(action.action_args) ?? {},
          state: "ready" as const,
        }];
      })
    : [];
  const suggestion = isChatSuggestion(row.suggestion)
    ? row.suggestion
    : null;
  const responseState = isChatResponseState(row.response_state)
    ? row.response_state
    : "answered";

  return {
    id: `db-${row.id}`,
    createdAt: row.created_at,
    dbId: row.id,
    role: row.role,
    text: row.content,
    card,
    sources,
    suggestion,
    responseState,
    actions,
    toolCalls: [],
    status: "done",
    feedback:
      row.feedback === "positive" || row.feedback === "negative" ? row.feedback : null,
  };
}

/** "Heute", "Gestern", "Mo., 25. Aug." for the conversation list. */
export function formatConversationWhen(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (days === 0) return "Heute";
  if (days === 1) return "Gestern";
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

/** The title a conversation shows: its stored title or "Gespräch". */
export function getConversationTitle(conversation: Pick<ConversationSummary, "title">): string {
  return conversation.title?.trim() || "Gespräch";
}