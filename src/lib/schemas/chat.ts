import { z } from "zod";

/**
 * Zod schema and types for the POST /api/chat API route.
 *
 * Input: { message, family_id }
 *   - message: non-empty German natural-language question
 *   - family_id: UUID of the family to search within (RLS-scoped)
 *
 * Response: { answer, sources: [{ document_id, title, excerpt, score }] }
 *
 * The chat route combines semantic + graph search results into context,
 * calls OpenAI GPT-4.1 Mini to synthesize a German answer with source
 * citations, and returns the answer plus the source documents.
 *
 * Hallucination protection:
 *   - When no sources are found, the answer is exactly
 *     "Ich finde dazu kein Dokument." and sources is an empty array
 *     (VAL-CHAT-005).
 *   - The system prompt forbids hedging language ("Ich glaube", "Vermutlich",
 *     "Wahrscheinlich", "Könnte sein") — VAL-CHAT-006.
 *   - Sources only include confirmed documents (enforced by the search
 *     functions which filter documents.status = 'confirmed') —
 *     VAL-CHAT-031.
 */

// ---------------------------------------------------------------------------
// Chat request schema
// ---------------------------------------------------------------------------

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The chat request schema.
 *
 * Rejects:
 *   - Missing or empty message → 400 INVALID_CHAT_INPUT (VAL-CHAT-003)
 *   - Missing or non-UUID family_id → 400 INVALID_CHAT_INPUT (VAL-CHAT-003)
 *
 * The message is trimmed and must be at least 1 character. This handles
 * special characters (umlauts, quotes, etc.) safely — Zod's string
 * validation is Unicode-safe and does not mangle UTF-8.
 */
export const chatRequestSchema = z.object({
  message: z.string().trim().min(1, "Nachricht darf nicht leer sein."),
  family_id: z
    .string()
    .trim()
    .min(1, "family_id ist erforderlich.")
    .regex(UUID_REGEX, "family_id muss eine gültige UUID sein."),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

// ---------------------------------------------------------------------------
// Chat response types
// ---------------------------------------------------------------------------

/**
 * A single source cited in a chat answer.
 *
 * - document_id: the UUID of the confirmed source document
 * - title: the document title (may be null but search only returns
 *   confirmed documents which typically have a title)
 * - excerpt: a text snippet from the document (the matching embedding chunk
 *   for semantic results, or a description like "Person: Emma" for graph
 *   results)
 * - score: relevance score in [0, 1] for semantic, or confidence-derived
 *   for graph (VAL-CHAT-033: scores must be bounded [0, 1])
 */
export interface ChatSource {
  document_id: string;
  title: string | null;
  excerpt: string;
  score: number;
}

/**
 * Successful chat API response.
 *
 * - answer: the German natural-language answer from GPT-4.1 Mini, or the
 *   fallback "Ich finde dazu kein Dokument." when no sources are found
 * - sources: the source documents cited in the answer (empty when no
 *   results found)
 */
export interface ChatSuccessResponse {
  answer: string;
  sources: ChatSource[];
}

/**
 * Error chat API response (same shape as other route errors).
 */
export interface ChatErrorResponse {
  error: string;
  code: string;
}

// ---------------------------------------------------------------------------
// Hallucination protection constants and helpers
// ---------------------------------------------------------------------------

/**
 * The exact fallback answer returned when no sources are found.
 *
 * VAL-CHAT-005: the answer is exactly (or begins with) this string when
 * both semantic and graph search return zero results.
 */
export const NO_RESULTS_FALLBACK = "Ich finde dazu kein Dokument.";

/**
 * Forbidden hedging phrases that must never appear in a chat answer.
 *
 * VAL-CHAT-006: the answer text must not contain any of these substrings.
 * The system prompt instructs the model to avoid them, and this list is
 * used by `containsHedgingLanguage` for post-generation verification.
 */
export const FORBIDDEN_HEDGING_PHRASES = [
  "Ich glaube",
  "Vermutlich",
  "Wahrscheinlich",
  "Könnte sein",
] as const;

/**
 * Check whether a text contains any forbidden hedging language.
 *
 * Case-insensitive substring check. Used to verify that the generated
 * answer does not contain hedging phrases (VAL-CHAT-006).
 *
 * @param text - The answer text to check.
 * @returns true if any forbidden phrase is found (case-insensitive).
 */
export function containsHedgingLanguage(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_HEDGING_PHRASES.some((phrase) =>
    lower.includes(phrase.toLowerCase()),
  );
}
