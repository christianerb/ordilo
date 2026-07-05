import { z } from "zod";

/**
 * Zod schema for the POST /api/search API route.
 *
 * Input: { query, family_id, mode }
 *   - query: non-empty search string
 *   - family_id: UUID of the family to search within (RLS-scoped)
 *   - mode: "semantic" | "graph" | "auto"
 *
 * Validation:
 *   - Missing query or family_id → 400 (VAL-SEARCH-007)
 *   - Invalid mode value → 400 (VAL-SEARCH-005)
 *   - family_id must be a valid UUID
 */

// ---------------------------------------------------------------------------
// Search mode
// ---------------------------------------------------------------------------

/**
 * The three search modes supported by /api/search.
 *
 * - "semantic": embed the query and use pgvector cosine similarity over
 *   document_embeddings (VAL-SEARCH-001..004).
 * - "graph": parse the query for person names and task keywords, then query
 *   extracted_entities / tasks / knowledge_edges via SQL (VAL-SEARCH-010..013).
 * - "auto": the route selects the appropriate mode based on query analysis
 *   and reports which mode was actually used (VAL-SEARCH-014). The response
 *   `mode` field is never "auto" — it is replaced with "semantic" or "graph".
 */
export const SEARCH_MODES = ["semantic", "graph", "auto"] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];

/**
 * The mode reported in the response. "auto" is resolved to one of the
 * concrete modes before returning (VAL-SEARCH-014).
 */
export const EXECUTED_SEARCH_MODES = ["semantic", "graph"] as const;
export type ExecutedSearchMode = (typeof EXECUTED_SEARCH_MODES)[number];

// ---------------------------------------------------------------------------
// Search request schema
// ---------------------------------------------------------------------------

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The search request schema.
 *
 * Rejects:
 *   - Missing or empty query → 400 INVALID_SEARCH_INPUT
 *   - Missing or non-UUID family_id → 400 INVALID_SEARCH_INPUT
 *   - Missing or invalid mode → 400 INVALID_SEARCH_INPUT
 */
export const searchRequestSchema = z.object({
  query: z.string().trim().min(1, "Suchanfrage darf nicht leer sein."),
  family_id: z
    .string()
    .trim()
    .min(1, "family_id ist erforderlich.")
    .regex(UUID_REGEX, "family_id muss eine gültige UUID sein."),
  mode: z.enum(SEARCH_MODES, {
    error: "mode muss 'semantic', 'graph' oder 'auto' sein.",
  }),
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;

// ---------------------------------------------------------------------------
// Search response types
// ---------------------------------------------------------------------------

/**
 * A single search result.
 *
 * - document_id: the UUID of the matching document
 * - title: the document title (may be null for unanalyzed docs, but search
 *   only returns confirmed docs which always have a title)
 * - chunk_text: the matching text snippet (embedding chunk for semantic,
 *   entity/task context for graph)
 * - score: relevance score in [0, 1] for semantic, or confidence-derived
 *   for graph
 * - source: which search strategy produced this result
 */
export interface SearchResult {
  document_id: string;
  title: string | null;
  chunk_text: string;
  score: number;
  source: string;
}

/**
 * Successful search API response.
 *
 * The `mode` field reports which mode was actually executed. When the
 * request mode is "auto", the route resolves it to "semantic" or "graph"
 * and reports the chosen mode here (VAL-SEARCH-014). The response `mode`
 * is never "auto".
 */
export interface SearchSuccessResponse {
  results: SearchResult[];
  mode: ExecutedSearchMode;
}

/**
 * Error search API response (same shape as other route errors).
 */
export interface SearchErrorResponse {
  error: string;
  code: string;
}

// ---------------------------------------------------------------------------
// Graph search query analysis
// ---------------------------------------------------------------------------

/**
 * German keywords that indicate a task-related query.
 *
 * Used by graph search (and auto mode) to detect whether the user is asking
 * about tasks/deadlines rather than document content.
 */
export const TASK_KEYWORDS = [
  "frist",
  "fristen",
  "erledigen",
  "aufgabe",
  "aufgaben",
  "to-do",
  "todo",
  "muss ich",
  "was muss",
  "wochenende",
  "woche",
  "deadline",
  "fällig",
  "faellig",
  "offen",
  "erinnerung",
] as const;

/**
 * Determine whether a query is task-related (mentions deadlines, tasks, etc.).
 *
 * Used by graph search and auto-mode selection. Case-insensitive.
 *
 * @param query - The user's search query.
 * @returns true if the query contains any task-related keyword.
 */
export function isTaskQuery(query: string): boolean {
  const lower = query.toLowerCase();
  return TASK_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Find family member names mentioned in the query.
 *
 * Compares each family member's name against the query (case-insensitive
 * whole-word-ish match). Returns the names that appear in the query.
 *
 * @param query - The user's search query.
 * @param memberNames - The family's member names to match against.
 * @returns Array of member names found in the query (original casing).
 */
export function findMentionedMembers(
  query: string,
  memberNames: string[],
): string[] {
  const lowerQuery = query.toLowerCase();
  return memberNames.filter((name) => {
    const lowerName = name.toLowerCase().trim();
    if (!lowerName) return false;
    return lowerQuery.includes(lowerName);
  });
}

/**
 * Select the appropriate search mode for an "auto" request.
 *
 * Heuristic:
 *   - If the query mentions a known family member name → "graph" (the user
 *     is likely asking about a person's documents or tasks).
 *   - If the query contains task-related keywords (and no person name) →
 *     "graph" (task/deadline queries are best answered via the graph/SQL
 *     tables, not semantic similarity).
 *   - Otherwise → "semantic" (content-based search over embeddings).
 *
 * @param query - The user's search query.
 * @param memberNames - The family's member names.
 * @returns The resolved mode ("semantic" or "graph").
 */
export function selectAutoMode(
  query: string,
  memberNames: string[],
): ExecutedSearchMode {
  const mentioned = findMentionedMembers(query, memberNames);
  if (mentioned.length > 0) return "graph";
  if (isTaskQuery(query)) return "graph";
  return "semantic";
}
