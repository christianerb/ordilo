import OpenAI from "openai";
import type { SearchResult } from "@/lib/schemas/search";
import {
  NO_RESULTS_FALLBACK,
  FORBIDDEN_HEDGING_PHRASES,
  containsHedgingLanguage,
  answerCitesSources,
  FAIL_CLOSED_HEDGING,
  FAIL_CLOSED_CITATION,
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
 * Post-generation guardrails (chat-api-guardrails):
 *   1. **No-hedging**: after generation, the answer is checked for
 *      forbidden hedging language. If hedging is detected, the model is
 *      re-prompted once with a stricter instruction. If hedging persists
 *      after the single regeneration, a deterministic fail-closed message
 *      (`FAIL_CLOSED_HEDGING`) is returned instead of the hedged answer.
 *   2. **Source citation**: after generation, the answer is checked to
 *      verify it references at least one source by title OR by source
 *      content (a distinctive content fragment from the excerpt). If
 *      citation is missing, the model is re-prompted once with a stricter
 *      citation instruction. If citation is still missing after the single
 *      regeneration, a deterministic fail-closed message
 *      (`FAIL_CLOSED_CITATION`) is returned instead of an uncited answer.
 *      There is no bypass when all source titles are null or short —
 *      content matching is used instead (VAL-CHAT-004).
 *
 * Both guardrails share a single regeneration attempt: if either fails on
 * the first answer, one combined correction re-prompt is issued. If either
 * still fails after the regeneration, the corresponding fail-closed message
 * is returned (hedging takes priority if both still fail).
 *
 * @param query - The user's natural-language question.
 * @param sources - The combined source documents to use as context. Must
 *                  be non-empty (the caller handles the empty case by
 *                  returning the fallback directly).
 * @returns The German answer string, or a deterministic fail-closed message
 *          if a guardrail could not be satisfied after one regeneration.
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

  const answer = await callOpenAI(client, systemPrompt, userMessage);

  // Post-generation guardrail checks.
  const hedgingFailed = containsHedgingLanguage(answer);
  const citationFailed = !answerCitesSources(answer, sources);

  // If both guardrails pass on the first try, return the answer as-is.
  if (!hedgingFailed && !citationFailed) {
    return answer;
  }

  // Regenerate once with a combined correction instruction addressing
  // whichever guardrail(s) failed.
  const correctionMessage = buildCorrectionMessage(
    userMessage,
    hedgingFailed,
    citationFailed,
  );
  const corrected = await callOpenAI(client, systemPrompt, correctionMessage);

  // Check the corrected answer against the same guardrails.
  const correctedHedgingFailed = containsHedgingLanguage(corrected);
  const correctedCitationFailed = !answerCitesSources(corrected, sources);

  // If hedging still fails, fail closed with the hedging message.
  if (correctedHedgingFailed) {
    return FAIL_CLOSED_HEDGING;
  }

  // If citation still fails, fail closed with the citation message.
  if (correctedCitationFailed) {
    return FAIL_CLOSED_CITATION;
  }

  // Both guardrails pass on the corrected answer.
  return corrected;
}

// ---------------------------------------------------------------------------
// Internal: correction message builder
// ---------------------------------------------------------------------------

/**
 * Build the correction message for the single regeneration attempt.
 *
 * Appends a targeted instruction to the original user message based on
 * which guardrail(s) failed. If both failed, both corrections are included.
 *
 * @param userMessage - The original user message (query + context).
 * @param hedgingFailed - Whether the hedging guardrail failed.
 * @param citationFailed - Whether the citation guardrail failed.
 * @returns The correction message string.
 */
function buildCorrectionMessage(
  userMessage: string,
  hedgingFailed: boolean,
  citationFailed: boolean,
): string {
  const hints: string[] = [];
  if (hedgingFailed) {
    const phrases = FORBIDDEN_HEDGING_PHRASES.map((p) => `"${p}"`).join(", ");
    hints.push(
      `Deine vorherige Antwort enthielt verbotene Formulierungen (${phrases}). Formuliere unbedingt, direkt und bestimmt. Verwende keine unsicheren oder spekulativen Ausdrücke.`,
    );
  }
  if (citationFailed) {
    hints.push(
      `Deine vorherige Antwort nannte keine Quelle. Beziehe dich ausdrücklich auf das Dokument (z.B. "Laut dem Kita-Brief..." oder "Das Dokument 'Stromrechnung' zeigt...").`,
    );
  }
  return `${userMessage}\n\nHINWEIS: ${hints.join(" ")}`;
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
