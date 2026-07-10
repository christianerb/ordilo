/**
 * Chat conversation persistence and context-window management.
 *
 * Provides:
 *   - Conversation creation and message persistence (DB-backed history).
 *   - History loading from the database into `HistoryMessage[]` for the LLM.
 *   - Context-window truncation: keeps the most recent messages within a
 *     token budget so long conversations don't exceed the model's limit.
 */

import type { ChatSource, AnswerCard } from "@/lib/schemas/chat";
import type { HistoryMessage } from "@/lib/ai/chat";

type ServerClient = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A persisted chat message row from the database. */
export interface ChatMessageRow {
  id: string;
  conversation_id: string;
  family_id: string;
  role: "user" | "assistant";
  content: string;
  sources: ChatSource[] | null;
  card: AnswerCard | null;
  feedback: string | null;
  created_at: string;
}

/** A conversation row from the database. */
export interface ChatConversationRow {
  id: string;
  family_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Conversation management
// ---------------------------------------------------------------------------

/**
 * List all conversations for a family, newest first.
 */
export async function listConversations(
  client: ServerClient,
  familyId: string,
): Promise<ChatConversationRow[]> {
  const { data, error } = await client
    .from("chat_conversations")
    .select("id, family_id, title, created_at, updated_at")
    .eq("family_id", familyId)
    .order("updated_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as unknown as ChatConversationRow[];
}

/**
 * Create a new empty conversation for a family.
 *
 * @returns The conversation ID.
 */
export async function createConversation(
  client: ServerClient,
  familyId: string,
): Promise<string> {
  const { data, error } = await client
    .from("chat_conversations")
    .insert({ family_id: familyId })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Konversation konnte nicht erstellt werden: ${error?.message ?? "unknown"}`);
  }

  return data.id;
}

/**
 * Delete a conversation and all its messages (cascade).
 */
export async function deleteConversation(
  client: ServerClient,
  conversationId: string,
): Promise<void> {
  await client.from("chat_conversations").delete().eq("id", conversationId);
}

/**
 * Update the title of a conversation.
 */
export async function updateConversationTitle(
  client: ServerClient,
  conversationId: string,
  title: string,
): Promise<void> {
  await client
    .from("chat_conversations")
    .update({ title })
    .eq("id", conversationId);
}

/**
 * Get a specific conversation by ID, or create a new one if no ID is provided.
 *
 * @param client - Supabase server client.
 * @param familyId - The family ID.
 * @param conversationId - Optional conversation ID. If provided, loads that
 *   specific conversation. If not, creates a new one.
 * @returns The conversation ID.
 */
export async function getOrCreateConversation(
  client: ServerClient,
  familyId: string,
  conversationId?: string,
): Promise<string> {
  // If a specific conversation ID is provided, verify it exists.
  if (conversationId) {
    const { data: existing } = await client
      .from("chat_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("family_id", familyId)
      .maybeSingle();

    if (existing) return existing.id;
  }

  // Create a new conversation.
  return createConversation(client, familyId);
}

/**
 * Auto-generate a title from the first user message.
 * Takes the first ~50 characters, truncated with ellipsis if needed.
 */
export function autoGenerateTitle(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 50) return trimmed;
  return trimmed.substring(0, 50) + "…";
}

// ---------------------------------------------------------------------------
// Message persistence
// ---------------------------------------------------------------------------

/**
 * Save a user message to the database.
 *
 * @returns The inserted row ID (not currently used, but available for future use).
 */
export async function saveUserMessage(
  client: ServerClient,
  conversationId: string,
  familyId: string,
  content: string,
): Promise<void> {
  await client.from("chat_messages").insert({
    conversation_id: conversationId,
    family_id: familyId,
    role: "user",
    content,
  });
}

/**
 * Save an assistant message to the database, including sources and card
 * if present.
 */
export async function saveAssistantMessage(
  client: ServerClient,
  conversationId: string,
  familyId: string,
  content: string,
  sources: ChatSource[],
  card: AnswerCard | null,
): Promise<void> {
  await client.from("chat_messages").insert({
    conversation_id: conversationId,
    family_id: familyId,
    role: "assistant",
    content,
    sources: sources.length > 0 ? sources as unknown as Record<string, unknown>[] : null,
    card: card as unknown as Record<string, unknown> | null,
  });
}

/**
 * Load conversation messages from the database, ordered oldest-first.
 *
 * Only the most recent `limit` messages are loaded to keep the initial
 * payload manageable. The caller applies further context-window
 * truncation via {@link truncateHistory} before sending to the LLM.
 *
 * @param limit - Maximum number of messages to load (default 50).
 */
export async function loadConversationMessages(
  client: ServerClient,
  conversationId: string,
  limit = 50,
): Promise<ChatMessageRow[]> {
  const { data, error } = await client
    .from("chat_messages")
    .select("id, conversation_id, family_id, role, content, sources, card, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) return [];

  return (data ?? []) as unknown as ChatMessageRow[];
}

/**
 * Convert persisted message rows into the `HistoryMessage[]` format
 * expected by the chat functions.
 *
 * Assistant messages include a compact source annotation so the model
 * knows which documents were found in previous turns (enables follow-up
 * questions like "Welche davon hat Fristen?" without re-searching).
 */
export function rowsToHistory(rows: ChatMessageRow[]): HistoryMessage[] {
  return rows.map((row) => {
    if (row.role === "assistant" && row.sources && row.sources.length > 0) {
      const sourceNames = row.sources
        .map((s) => s.title ?? s.document_id)
        .join(", ");
      return {
        role: "assistant" as const,
        content: `${row.content}\n\n[Gefundene Dokumente: ${sourceNames}]`,
      };
    }
    return {
      role: row.role,
      content: row.content,
    } as HistoryMessage;
  });
}

// ---------------------------------------------------------------------------
// Context-window management
// ---------------------------------------------------------------------------

/**
 * Rough token estimate for a text string.
 *
 * Uses the heuristic ~4 characters per token for German text (umlauts
 * and compound words make German slightly more token-dense than English).
 * This is intentionally conservative (overestimates) to stay safely
 * within the model's context window.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Maximum estimated tokens for conversation history sent to the model.
 *
 * GPT-4.1 Mini has a 128k context window. We reserve generous space for
 * the system prompt (~2k), tool results (~8k), and the model's response
 * (~4k). The remaining budget for history is capped at 16k tokens, which
 * is roughly 30-40 short exchanges — more than enough for a family
 * assistant conversation.
 */
const MAX_HISTORY_TOKENS = 16_000;

/**
 * Minimum number of messages to always keep (the most recent ones).
 * Ensures at least the last user question and assistant answer are
 * included even if the token estimate is high.
 */
const MIN_MESSAGES_TO_KEEP = 6;

/**
 * Truncate conversation history to fit within the token budget.
 *
 * Keeps the most recent messages, dropping older ones from the front.
 * This prevents the `messages` array from growing unboundedly across
 * long conversations and hitting the model's context-window limit.
 *
 * @param history - Full conversation history (oldest-first).
 * @returns Truncated history (most recent messages only).
 */
export function truncateHistory(history: HistoryMessage[]): HistoryMessage[] {
  if (history.length <= MIN_MESSAGES_TO_KEEP) return history;

  // Walk from the most recent message backwards, accumulating tokens
  // until we hit the budget. Then return that slice.
  let tokenSum = 0;
  let cutoff = history.length;

  for (let i = history.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(history[i].content);
    tokenSum += msgTokens;
    if (tokenSum > MAX_HISTORY_TOKENS) {
      cutoff = i + 1;
      break;
    }
    cutoff = i;
  }

  // Never go below the minimum.
  cutoff = Math.min(cutoff, history.length - MIN_MESSAGES_TO_KEEP);

  return history.slice(Math.max(0, cutoff));
}
