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

// ---------------------------------------------------------------------------
// Source citation validation
// ---------------------------------------------------------------------------

/**
 * Minimum title length (after trim) for a source title to be considered a
 * reliable citation reference. Titles shorter than this (e.g. "T", "A")
 * are too generic to verify citation by substring match and are skipped.
 */
export const MIN_CITATION_TITLE_LENGTH = 3;

/**
 * Minimum number of consecutive words from a source excerpt required to
 * form a checkable "content fragment". A content fragment of this length
 * is distinctive enough to verify citation by content matching. Shorter
 * sequences (e.g. a 3-word date like "am 15. August") are too generic and
 * could appear in an answer that merely states the same fact without
 * actually referencing the source document.
 */
export const MIN_CONTENT_FRAGMENT_WORDS = 4;

/**
 * Minimum character length (after joining words with single spaces) for a
 * content fragment to be considered checkable. Fragments shorter than this
 * are too generic to verify. This is a safety net on top of the word-count
 * threshold.
 */
export const MIN_CONTENT_FRAGMENT_CHARS = 10;

/**
 * Deterministic fail-closed message returned when the generated answer
 * contains forbidden hedging language AND a single regeneration could not
 * remove it. The hedged answer is never returned to the client.
 */
export const FAIL_CLOSED_HEDGING =
  "Die generierte Antwort enthält unsichere Formulierungen und konnte nicht bereinigt werden. Bitte stelle die Frage erneut.";

/**
 * Deterministic fail-closed message returned when the generated answer
 * asserts facts but does not cite any of the provided source documents
 * AND a single regeneration could not fix the citation. An uncited factual
 * answer is never returned to the client.
 */
export const FAIL_CLOSED_CITATION =
  "Die generierte Antwort nennt keine Quelle und wird daher nicht angezeigt. Bitte stelle die Frage erneut.";

/**
 * Normalize whitespace in a string: collapse runs of whitespace to a single
 * space and trim. Used for content-fragment matching so that formatting
 * differences do not prevent a match.
 */
function normalizeWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * Extract checkable content fragments from a source excerpt.
 *
 * A content fragment is a sequence of `MIN_CONTENT_FRAGMENT_WORDS`
 * consecutive words from the excerpt. Only fragments whose joined length
 * is at least `MIN_CONTENT_FRAGMENT_CHARS` are returned (shorter fragments
 * are too generic to verify citation).
 *
 * @param excerpt - The source excerpt (document content snippet).
 * @returns Array of normalized content fragment strings.
 */
function extractContentFragments(excerpt: string): string[] {
  const normalized = normalizeWhitespace(excerpt);
  if (!normalized) return [];

  const words = normalized.split(" ");
  if (words.length < MIN_CONTENT_FRAGMENT_WORDS) return [];

  const fragments: string[] = [];
  for (let i = 0; i <= words.length - MIN_CONTENT_FRAGMENT_WORDS; i++) {
    const fragment = words
      .slice(i, i + MIN_CONTENT_FRAGMENT_WORDS)
      .join(" ");
    if (fragment.length >= MIN_CONTENT_FRAGMENT_CHARS) {
      fragments.push(fragment);
    }
  }
  return fragments;
}

/**
 * Check whether the answer text references at least one source.
 *
 * Used for post-generation citation validation (chat-api-guardrails):
 * when sources were provided and the answer asserts document-derived
 * facts, the answer should reference at least one source document by
 * title OR by source content. If it does not, the caller regenerates
 * once or fails closed (VAL-CHAT-004).
 *
 * Validation strategy (title OR content):
 *   1. **Title matching**: the answer (case-insensitive, whitespace-
 *      normalized) contains a checkable source title (non-null, trimmed,
 *      length >= MIN_CITATION_TITLE_LENGTH).
 *   2. **Content matching**: the answer contains a checkable content
 *      fragment extracted from a source excerpt (a distinctive sequence
 *      of MIN_CONTENT_FRAGMENT_WORDS consecutive words, at least
 *      MIN_CONTENT_FRAGMENT_CHARS characters long).
 *
 * Rules:
 *   - The no-results fallback ("Ich finde dazu kein Dokument.") is always
 *     acceptable — it asserts no facts.
 *   - If no sources are provided (empty array), the check passes (there is
 *     nothing to cite — the caller handles the no-results case).
 *   - Otherwise, the check passes if and only if the answer references at
 *     least one source by title OR by content. There is NO bypass when all
 *     titles are null/short: content matching is used instead, and if no
 *     checkable reference can be found from any source, the answer is
 *     considered uncited (returns false) so the caller can regenerate or
 *     fail-closed.
 *
 * @param answer - The generated answer text.
 * @param sources - The source documents provided as context.
 * @returns true if the answer cites at least one source (by title or
 *          content), or if there are no sources to cite. false if sources
 *          exist but the answer references none of them.
 */
export function answerCitesSources(
  answer: string,
  sources: ChatSource[],
): boolean {
  // The no-results fallback asserts no facts — always acceptable.
  if (answer.trim() === NO_RESULTS_FALLBACK) return true;

  // No sources provided → nothing to cite → acceptable (the caller
  // handles the no-results case by returning the fallback directly).
  if (sources.length === 0) return true;

  const normalizedAnswer = normalizeWhitespace(answer).toLowerCase();

  // Check each source for a title match OR a content-fragment match.
  for (const source of sources) {
    // --- Title matching ---
    const title = source.title?.trim();
    if (title && title.length >= MIN_CITATION_TITLE_LENGTH) {
      if (normalizedAnswer.includes(title.toLowerCase())) {
        return true;
      }
    }

    // --- Content matching ---
    const fragments = extractContentFragments(source.excerpt);
    for (const fragment of fragments) {
      if (normalizedAnswer.includes(fragment.toLowerCase())) {
        return true;
      }
    }
  }

  // No source was referenced by title or content → uncited.
  return false;
}
