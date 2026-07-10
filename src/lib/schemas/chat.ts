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
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .optional()
    .default([]),
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
 * - origin: whether this source came from semantic search (pgvector
 *   embedding match, susceptible to hallucination) or graph search
 *   (deterministic DB match via person/task queries, not hallucination
 *   risk). Used by `answerCitesSources` to relax the citation check when
 *   all sources are graph-derived (VAL-SEARCH-023). When unset, the
 *   source is treated as semantic for backward compatibility.
 */
export interface ChatSource {
  document_id: string;
  title: string | null;
  excerpt: string;
  score: number;
  origin?: 'semantic' | 'graph';
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
 * Normalize text for citation comparison: lowercase, replace punctuation
 * with spaces, collapse whitespace, and trim.
 *
 * This makes content and title matching robust to punctuation and casing
 * differences between the answer and the source excerpt/title (e.g.
 * "am 15. August" vs "am 15 August", or "Kita-Brief" vs "Kita Brief").
 * Unicode letters (including German umlauts ä, ö, ü, ß) and digits are
 * preserved; all other characters (punctuation, symbols) are replaced
 * with spaces so that word boundaries are maintained after normalization.
 */
function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract checkable content fragments from a source excerpt.
 *
 * A content fragment is a sequence of `MIN_CONTENT_FRAGMENT_WORDS`
 * consecutive words from the excerpt. Only fragments whose joined length
 * is at least `MIN_CONTENT_FRAGMENT_CHARS` are returned (shorter fragments
 * are too generic to verify citation).
 *
 * The excerpt is normalized via `normalizeForComparison` (lowercase,
 * punctuation replaced with spaces, whitespace collapsed) before
 * extracting fragments, so that punctuation and casing differences
 * between the answer and the excerpt do not prevent a match.
 *
 * @param excerpt - The source excerpt (document content snippet).
 * @returns Array of normalized content fragment strings.
 */
function extractContentFragments(excerpt: string): string[] {
  // Strip synthetic graph prefixes ("Aufgabe: ", "Person: ") so that
  // fragment extraction uses the actual content (task title, person name)
  // rather than the prefix, which would not appear in the answer text
  // (VAL-SEARCH-023).
  const stripped = excerpt.replace(/^(Aufgabe|Person):\s+/i, "").trim();
  const normalized = normalizeForComparison(stripped);
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
 *   1. **Title matching**: the answer (lowercased, punctuation-stripped,
 *      whitespace-normalized) contains a checkable source title (non-null,
 *      trimmed, raw length >= MIN_CITATION_TITLE_LENGTH, and normalized
 *      length >= MIN_CITATION_TITLE_LENGTH).
 *   2. **Content matching**: the answer contains a checkable content
 *      fragment extracted from a source excerpt (a distinctive sequence
 *      of MIN_CONTENT_FRAGMENT_WORDS consecutive words, at least
 *      MIN_CONTENT_FRAGMENT_CHARS characters long). Both the answer and
 *      the excerpt are normalized (lowercase, punctuation replaced with
 *      spaces, whitespace collapsed) before comparison, so punctuation
 *      and casing differences do not prevent a match.
 *
 * Rules:
 *   - The no-results fallback ("Ich finde dazu kein Dokument.") is always
 *     acceptable — it asserts no facts.
 *   - If no sources are provided (empty array), the check passes (there is
 *     nothing to cite — the caller handles the no-results case).
 *   - **Graph-origin shortcut** (VAL-SEARCH-023): if all checkable sources
 *     are graph-derived (origin = 'graph'), the answer is considered cited
 *     without requiring a title or content match. Graph sources (task/person
 *     matches) are deterministic DB results, not model-generated content, so
 *     there is nothing semantic to hallucinate. Sources without an explicit
 *     origin are treated as semantic for backward compatibility.
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
 *          content), or if there are no sources to cite, or if all sources
 *          are graph-derived. false if semantic sources exist but the
 *          answer references none of them.
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

  // Graph-origin shortcut (VAL-SEARCH-023): if all checkable sources are
  // graph-derived (deterministic DB matches via person/task queries),
  // there is nothing semantic to hallucinate. The answer is considered
  // cited regardless of title/content matching, since graph sources
  // represent verified database records, not model-generated content.
  // Sources without an explicit origin are treated as semantic for
  // backward compatibility.
  const hasSemanticSource = sources.some(
    (s) => s.origin !== "graph",
  );
  if (!hasSemanticSource) {
    return true;
  }

  const normalizedAnswer = normalizeForComparison(answer);

  // Check each source for a title match OR a content-fragment match.
  for (const source of sources) {
    // --- Title matching ---
    const title = source.title?.trim();
    if (title && title.length >= MIN_CITATION_TITLE_LENGTH) {
      const normalizedTitle = normalizeForComparison(title);
      // Skip titles that normalize to fewer than MIN_CITATION_TITLE_LENGTH
      // characters (e.g. "Dr." → "dr") — they are too generic for a
      // reliable substring match after punctuation removal.
      if (
        normalizedTitle.length >= MIN_CITATION_TITLE_LENGTH &&
        normalizedAnswer.includes(normalizedTitle)
      ) {
        return true;
      }
    }

    // --- Content matching ---
    // Fragments are already normalized (lowercase, punctuation-stripped)
    // by extractContentFragments, so a direct substring check suffices.
    const fragments = extractContentFragments(source.excerpt);
    for (const fragment of fragments) {
      if (normalizedAnswer.includes(fragment)) {
        return true;
      }
    }
  }

  // No source was referenced by title or content → uncited.
  return false;
}

// ---------------------------------------------------------------------------
// Structured answer cards
// ---------------------------------------------------------------------------

/**
 * The kinds of structured answer cards the assistant can present instead
 * of a plain-text answer, when the answer describes exactly one concrete
 * result (e.g. an appointment, a task, a document fact).
 */
export const ANSWER_CARD_TYPES = [
  "termin",
  "aufgabe",
  "dokument",
  "allgemein",
] as const;

export type AnswerCardType = (typeof ANSWER_CARD_TYPES)[number];

/** A single label/value detail row shown in an answer card. */
export interface AnswerCardField {
  label: string;
  value: string;
}

/**
 * A structured answer card: a single concrete result rendered as a card
 * (title, subtitle, detail fields, optional link to the source document)
 * instead of free-flowing Markdown text.
 *
 * Emitted by the assistant via the `present_answer_card` tool (see
 * `src/lib/ai/tools.ts`) when the answer is about exactly one entity —
 * matches the "Ergebnisse & Quellen" card style from the Ordilo design.
 */
export interface AnswerCard {
  type: AnswerCardType;
  title: string;
  subtitle: string | null;
  fields: AnswerCardField[];
  /** UUID of the source document to link to, or null if not verifiable. */
  actionDocumentId: string | null;
}

/** Maximum number of detail fields shown on an answer card. */
const MAX_ANSWER_CARD_FIELDS = 6;

/**
 * Zod schema validating the raw JSON arguments of a `present_answer_card`
 * tool call, as returned by the model. Field/title/subtitle lengths are
 * capped to keep the card compact and to bound worst-case hallucinated
 * output.
 */
export const answerCardArgsSchema = z.object({
  card_type: z.enum(ANSWER_CARD_TYPES),
  title: z.string().trim().min(1).max(80),
  subtitle: z.string().trim().max(120).optional(),
  fields: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(40),
        value: z.string().trim().min(1).max(200),
      }),
    )
    .min(1)
    .max(MAX_ANSWER_CARD_FIELDS),
  source_document_id: z.string().trim().min(1).optional(),
});

export type AnswerCardArgs = z.infer<typeof answerCardArgsSchema>;

/**
 * Parse and validate the raw arguments of a `present_answer_card` tool
 * call into an `AnswerCard`, or return `null` if the arguments are
 * malformed or contain forbidden hedging language.
 *
 * This is the single gate between model-generated tool arguments and the
 * rendered UI: shape validation (via `answerCardArgsSchema`) rejects
 * missing/oversized fields, and a hedging-language check (reusing the same
 * guardrail as free-text answers, VAL-CHAT-006) rejects cards whose text
 * hedges on the facts it presents. `source_document_id` is intentionally
 * NOT verified here (the caller cross-checks it against the accumulated
 * tool-context sources, since only the caller knows which document IDs
 * were actually returned by search_documents).
 *
 * @param rawArgs - The raw (already JSON.parsed) tool-call arguments.
 * @returns The validated `AnswerCard` (with `actionDocumentId` set from
 *          `source_document_id` verbatim — the caller must still verify
 *          it against known sources), or `null` if invalid.
 */
export function parseAnswerCardArgs(rawArgs: unknown): AnswerCard | null {
  const result = answerCardArgsSchema.safeParse(rawArgs);
  if (!result.success) return null;

  const { card_type, title, subtitle, fields, source_document_id } =
    result.data;

  const allText = [
    title,
    subtitle ?? "",
    ...fields.flatMap((f) => [f.label, f.value]),
  ].join(" ");
  if (containsHedgingLanguage(allText)) return null;

  return {
    type: card_type,
    title,
    subtitle: subtitle ?? null,
    fields,
    actionDocumentId: source_document_id ?? null,
  };
}
