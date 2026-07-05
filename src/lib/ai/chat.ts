import OpenAI from "openai";
import type { SearchResult } from "@/lib/schemas/search";
import {
  NO_RESULTS_FALLBACK,
  FORBIDDEN_HEDGING_PHRASES,
  containsHedgingLanguage,
  type ChatSource,
} from "@/lib/schemas/chat";
import { MAX_RESULTS } from "@/lib/ai/search";

/**
 * Chat with sources — combines semantic + graph search results into
 * context, calls OpenAI GPT-4.1 Mini to synthesize a German natural-
 * language answer with source citations, and returns the answer plus
 * the source documents.
 *
 * Hallucination protection:
 *   - The system prompt enforces German answers, source citation, and
 *     forbids hedging language (VAL-CHAT-006).
 *   - When no sources are found, the caller (route) returns the fallback
 *     "Ich finde dazu kein Dokument." directly without calling OpenAI
 *     (VAL-CHAT-005).
 *   - The system prompt also instructs the model to respond with the
 *     fallback if the provided sources do not answer the question.
 *   - Sources only include confirmed documents (enforced by the search
 *     functions which filter documents.status = 'confirmed').
 *
 * The OPENAI_API_KEY is read from server-only env and is never exposed
 * to the client (VAL-CHAT-010).
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** The OpenAI model used for chat. */
const CHAT_MODEL = "gpt-4.1-mini";

/**
 * Maximum number of sources to include in the response and LLM context.
 * Matches the search top-k limit.
 */
const MAX_SOURCES = MAX_RESULTS;

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Error thrown when the chat completion call fails (API error, timeout,
 * or unexpected response shape).
 */
export class ChatError extends Error {
  /** Machine-readable error code for structured API responses. */
  readonly code: string;
  /** HTTP status from OpenAI (if applicable). */
  readonly statusCode?: number;

  constructor(message: string, code: string, statusCode?: number) {
    super(message);
    this.name = "ChatError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// Source combination
// ---------------------------------------------------------------------------

/**
 * Combine semantic and graph search results into a deduplicated
 * `ChatSource[]`, one entry per unique document.
 *
 * For each document:
 *   - title: taken from any result (all results for the same document
 *     share the same title)
 *   - excerpt: prefers the semantic result's chunk_text (the actual
 *     matching document content) over graph metadata (e.g. "Person: Emma").
 *     This gives the user and the LLM the most informative excerpt.
 *   - score: the highest score among all results for that document
 *
 * Results are sorted by score descending and limited to MAX_SOURCES.
 *
 * This satisfies VAL-CHAT-007 (combines semantic and graph search) —
 * documents from both search types are included in the combined sources.
 */
export function combineSearchResults(
  semanticResults: SearchResult[],
  graphResults: SearchResult[],
): ChatSource[] {
  const allResults = [...semanticResults, ...graphResults];

  // Group results by document_id, tracking the semantic result (for excerpt)
  // and the best-scoring result (for title and score).
  const byDocId = new Map<
    string,
    { semantic: SearchResult | null; best: SearchResult }
  >();

  for (const result of allResults) {
    const existing = byDocId.get(result.document_id);
    if (!existing) {
      byDocId.set(result.document_id, {
        semantic: result.source === "semantic" ? result : null,
        best: result,
      });
    } else {
      if (result.source === "semantic") {
        // Prefer the semantic result with the highest score for the excerpt.
        if (
          !existing.semantic ||
          result.score > existing.semantic.score
        ) {
          existing.semantic = result;
        }
      }
      if (result.score > existing.best.score) {
        existing.best = result;
      }
    }
  }

  const sources: ChatSource[] = [];
  for (const { semantic, best } of byDocId.values()) {
    sources.push({
      document_id: best.document_id,
      title: best.title,
      // Prefer semantic chunk_text (document content) over graph metadata.
      excerpt: semantic ? semantic.chunk_text : best.chunk_text,
      score: best.score,
    });
  }

  // Sort by score descending, limit to MAX_SOURCES.
  sources.sort((a, b) => b.score - a.score);
  return sources.slice(0, MAX_SOURCES);
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

/**
 * Build the system prompt for the OpenAI chat completion call.
 *
 * The prompt enforces:
 *   - German answers only (VAL-CHAT-001, VAL-CHAT-027)
 *   - Source citation for every factual claim (VAL-CHAT-004)
 *   - No hedging language (VAL-CHAT-006): explicitly forbids
 *     "Ich glaube", "Vermutlich", "Wahrscheinlich", "Könnte sein"
 *   - Hallucination fallback: if sources don't answer the question,
 *     respond "Ich finde dazu kein Dokument." (VAL-CHAT-005)
 *   - No internal terminology in the answer (VAL-CHAT-032)
 *
 * @returns The system prompt string.
 */
export function buildChatSystemPrompt(): string {
  const forbiddenList = FORBIDDEN_HEDGING_PHRASES.map(
    (p) => `"${p}"`,
  ).join(", ");

  return `Du bist Ordilo, ein privater AI-Familienassistent. Du beantwortest Fragen zu Dokumenten einer Familie.

STRENGE REGELN:
1. Antworte IMMER auf Deutsch.
2. Verwende NUR die unten angegebenen Quellen. Erfinde KEINE Informationen, die nicht in den Quellen stehen.
3. Jede sachliche Aussage muss auf einer Quelle basieren. Beziehe dich auf das Dokument (z.B. "Laut dem Kita-Brief..." oder "Das Dokument 'Stromrechnung' zeigt...").
4. VERBOTENE Formulierungen: ${forbiddenList}. Formuliere immer bestimmt und direkt. Verwende keine unsicheren oder spekulativen Ausdrücke.
5. Wenn die Quellen die Frage nicht beantworten, antworte: "${NO_RESULTS_FALLBACK}"
6. Verwende NIEMALS interne Fachbegriffe in deiner Antwort: "Knowledge Graph", "pgvector", "embedding", "HNSW", "Vektor", "Vektordatenbank", "Knoten", "Kanten".
7. Bei Fragen nach Aufgaben oder Fristen: liste die relevanten Aufgaben mit ihren Fristen auf.
8. Halte die Antwort präzise und hilfreich. Verwende Aufzählungen wenn es sinnvoll ist.
9. Beginne die Antwort direkt mit dem Inhalt — keine Einleitung wie "Hier ist die Antwort" oder "Basierend auf den Quellen".`;
}

// ---------------------------------------------------------------------------
// User message (query + context)
// ---------------------------------------------------------------------------

/**
 * Build the user message for the OpenAI chat completion call.
 *
 * The message contains the user's question and the formatted source context.
 * Each source is numbered and includes the document title, relevance score,
 * and an excerpt of the matching content.
 *
 * @param query - The user's natural-language question.
 * @param sources - The combined source documents to include as context.
 * @returns The formatted user message string.
 */
export function buildChatUserMessage(
  query: string,
  sources: ChatSource[],
): string {
  const sourceLines = sources.map((source, index) => {
    const title = source.title || "Ohne Titel";
    const scorePercent = Math.round(source.score * 100);
    const excerpt = source.excerpt || "Kein Auszug verfügbar.";
    return `[${index + 1}] Dokument "${title}" (Relevanz: ${scorePercent}%)\nAuszug: ${excerpt}`;
  });

  return `Frage: ${query}

Gefundene Quellen:
${sourceLines.join("\n\n")}`;
}

// ---------------------------------------------------------------------------
// OpenAI client
// ---------------------------------------------------------------------------

/**
 * Get the OpenAI client, configured with the API key from env.
 * Throws a typed error if the key is missing.
 */
function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ChatError(
      "OpenAI API key is not configured.",
      "OPENAI_NOT_CONFIGURED",
    );
  }
  return new OpenAI({ apiKey });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a German natural-language answer to the user's question using
 * OpenAI GPT-4.1 Mini, grounded in the provided sources.
 *
 * The system prompt enforces German answers, source citation, no hedging
 * language, and the hallucination fallback. The user message contains the
 * question and the source context.
 *
 * After generation, the answer is checked for forbidden hedging language.
 * If hedging language is detected, the model is re-prompted once with a
 * correction instruction. This is a safety net — the system prompt is the
 * primary defense (VAL-CHAT-006).
 *
 * @param query - The user's natural-language question.
 * @param sources - The combined source documents to use as context. Must
 *                  be non-empty (the caller handles the empty case by
 *                  returning the fallback directly).
 * @returns The German answer string.
 * @throws {ChatError} if the API call fails, times out, or returns an
 *         empty/invalid response.
 */
export async function generateChatAnswer(
  query: string,
  sources: ChatSource[],
): Promise<string> {
  const client = getOpenAIClient();
  const systemPrompt = buildChatSystemPrompt();
  const userMessage = buildChatUserMessage(query, sources);

  let answer = await callOpenAI(client, systemPrompt, userMessage);

  // Safety net: if the answer contains hedging language, re-prompt once
  // with a correction instruction (VAL-CHAT-006).
  if (containsHedgingLanguage(answer)) {
    const correctionMessage = `${userMessage}

HINWEIS: Deine vorherige Antwort enthielt verbotene Formulierungen (Ich glaube, Vermutlich, Wahrscheinlich, Könnte sein). Bitte formuliere unbedingt, direkt und bestimmt. Wiederhole die Antwort ohne diese Formulierungen.`;

    const corrected = await callOpenAI(client, systemPrompt, correctionMessage);
    // Only use the corrected answer if it's non-empty and has less hedging.
    if (corrected && !containsHedgingLanguage(corrected)) {
      answer = corrected;
    }
  }

  return answer;
}

// ---------------------------------------------------------------------------
// Internal: OpenAI call
// ---------------------------------------------------------------------------

/**
 * Call the OpenAI chat completion API and return the answer text.
 *
 * @throws {ChatError} on API errors, network errors, or empty responses.
 */
async function callOpenAI(
  client: OpenAI,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  let response: OpenAI.Chat.Completions.ChatCompletion;
  try {
    response = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      const status = err.status ?? undefined;
      if (status === 401 || status === 403) {
        throw new ChatError(
          "OpenAI: Authentifizierung fehlgeschlagen.",
          "OPENAI_AUTH_ERROR",
          status,
        );
      }
      if (status === 429) {
        throw new ChatError(
          "OpenAI: Rate-Limit erreicht. Bitte später erneut versuchen.",
          "OPENAI_RATE_LIMITED",
          status,
        );
      }
      throw new ChatError(
        `OpenAI: API-Fehler${err.message ? ` (${err.message})` : ""}.`,
        "OPENAI_API_ERROR",
        status,
      );
    }
    throw new ChatError(
      "Netzwerkfehler beim Kontaktieren von OpenAI.",
      "OPENAI_NETWORK_ERROR",
    );
  }

  const content = response.choices[0]?.message?.content;
  if (!content || !content.trim()) {
    throw new ChatError(
      "OpenAI: Leere Antwort erhalten.",
      "OPENAI_EMPTY_RESPONSE",
    );
  }

  return content.trim();
}
