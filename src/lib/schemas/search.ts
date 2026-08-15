import { z } from "zod";
import type { ApiErrorResponse } from "@/lib/schemas/api";

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
export type SearchErrorResponse = ApiErrorResponse;

// ---------------------------------------------------------------------------
// Graph search query analysis
// ---------------------------------------------------------------------------

/**
 * Escape special regex characters in a string so it can be used as a literal
 * pattern in a RegExp.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check whether a keyword appears as a whole word (word-boundary match) in
 * the given text. Unicode-aware (handles German umlauts via \p{L}).
 * Case-insensitive.
 *
 * This prevents false positives where a keyword is merely a substring of a
 * longer word. For example:
 *   - matchesWordBoundary("Offenbach Stadtplan", "offen") → false
 *     ("offen" is a substring of "Offenbach", not a whole word)
 *   - matchesWordBoundary("Was ist noch offen?", "offen") → true
 *     ("offen" is a whole word)
 *   - matchesWordBoundary("Johanna", "hanna") → false
 *     ("hanna" is a substring of "Johanna", not a whole word)
 *   - matchesWordBoundary("Hanna", "hanna") → true
 *
 * Uses lookbehind/lookahead with Unicode property escapes (\p{L} for letters,
 * \p{N} for numbers) to define word boundaries that include German umlauts
 * and other Unicode letters.
 *
 * @param text - The text to search within.
 * @param keyword - The keyword to match as a whole word.
 * @returns true if the keyword appears as a whole word in the text.
 */
export function matchesWordBoundary(text: string, keyword: string): boolean {
  const escapedKeyword = escapeRegExp(keyword.toLowerCase().trim());
  if (!escapedKeyword) return false;
  const regex = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapedKeyword}(?![\\p{L}\\p{N}])`,
    "iu",
  );
  return regex.test(text.toLowerCase());
}

/**
 * Check whether a person's name appears in the text, in the forms German
 * actually uses to talk about people.
 *
 * Word-boundary matching alone misses the possessive, which is how
 * families phrase most of their questions:
 *   - matchesPersonName("Hannas Steuer-ID", "Hanna")   → true
 *   - matchesPersonName("Lars' Vertrag", "Lars")       → true
 *   - matchesPersonName("Anna Marias Zeugnis", "Anna Maria") → true
 *
 * Still nothing but the name and its possessive — a name that is merely
 * the beginning of a longer word is not a mention:
 *   - matchesPersonName("Johanna", "Hanna")            → false
 *   - matchesPersonName("Hannah", "Hanna")             → false
 *   - matchesPersonName("Emmentaler", "Emme")          → false
 *
 * @param text - The text to search within.
 * @param name - The person's name.
 */
export function matchesPersonName(text: string, name: string): boolean {
  const escapedName = escapeRegExp(name.toLowerCase().trim());
  if (!escapedName) return false;
  // Optional possessive: a trailing "s" ("Hannas") or, for names already
  // ending in a sibilant, an apostrophe ("Lars'", "Max’").
  const regex = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapedName}(?:s|['’´])?(?![\\p{L}\\p{N}])`,
    "iu",
  );
  return regex.test(text.toLowerCase());
}

/**
 * Strip a possessive ending off a name that was read out of free text, so
 * it can be looked up as itself: "Hannas" → "Hanna", "Lars'" → "Lars".
 *
 * Names that genuinely end in s are over-stripped ("Lars" → "Lar"), which
 * is why the result belongs in a widening lookup (a substring filter, or
 * `matchesPersonName`, whose optional possessive puts the s back) and
 * never in an equality check.
 */
export function stripPossessive(name: string): string {
  const trimmed = name.trim();
  // An apostrophe marks the possessive of a name that already ends in s —
  // dropping it is the whole job ("Lars'" → "Lars").
  if (/['’´]$/.test(trimmed)) return trimmed.replace(/['’´]$/, "");
  return trimmed.replace(/(?<=\p{L}{2})s$/u, "");
}

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
 * Used by graph search and auto-mode selection. Case-insensitive. Uses
 * word-boundary matching so that a keyword appearing only as a substring of
 * a longer word (e.g. "offen" in "Offenbach") does NOT trigger task mode.
 *
 * @param query - The user's search query.
 * @returns true if the query contains any task-related keyword as a whole word.
 */
export function isTaskQuery(query: string): boolean {
  return TASK_KEYWORDS.some((kw) => matchesWordBoundary(query, kw));
}

/**
 * Find family member names mentioned in the query, including the
 * possessive form families ask in ("Hannas Zeugnis", "Lars' Vertrag").
 *
 * Matching is case-insensitive and Unicode-aware, and never matches a
 * name that is merely part of a longer word — querying "Hanna" must not
 * match member "Johanna", and vice versa.
 *
 * The possessive introduces one ambiguity worth resolving: with both a
 * "Jona" and a "Jonas" in the family, "Jonas Zeugnis" reads as either.
 * A name matched only through its possessive loses against a name that
 * matched as itself and is exactly that possessive — "Jonas" wins, and
 * only the loser is dropped, so "Hannas und Emma" still names both.
 *
 * @param query - The user's search query.
 * @param memberNames - The family's member names to match against.
 * @returns Array of member names found in the query (original casing).
 */
export function findMentionedMembers(
  query: string,
  memberNames: string[],
): string[] {
  const named = memberNames.filter((name) => name.trim());

  const asThemselves = named.filter((name) =>
    matchesWordBoundary(query, name.trim()),
  );
  const claimedPossessives = new Set(
    asThemselves.map((name) => name.trim().toLowerCase()),
  );

  const byPossessive = named.filter(
    (name) =>
      !asThemselves.includes(name) &&
      matchesPersonName(query, name.trim()) &&
      !claimedPossessives.has(`${name.trim().toLowerCase()}s`),
  );

  // Keep the caller's order rather than exact-matches-first: callers pass
  // these on as names, not as a ranking.
  return named.filter(
    (name) => asThemselves.includes(name) || byPossessive.includes(name),
  );
}

/**
 * A family member as the search paths need them: the name to match and
 * the role that says how the family refers to them.
 */
export interface MemberRef {
  name: string;
  role?: string | null;
}

/**
 * Relationship words families ask with, and the roles they cover.
 *
 * Nobody says "die Steuer-ID von Hanna" at home — they say "die Steuer-ID
 * meiner Tochter". The word is matched against the member's `role`, which
 * is what the family typed when they added the person.
 *
 * `roles` is what the word actually means. `fallbackRoles` is consulted
 * ONLY when no member carries any of the exact roles: a family that typed
 * "Tochter" for one child and "Kind" for the other must get the daughter
 * alone, while a family that only ever typed "Kind" still gets its
 * children scoped, which at least narrows the parents away.
 *
 * Fallbacks exist only where one role is genuinely the generic of the
 * other (a Tochter is a Kind). Across relations there is none: "meine
 * Frau" must never resolve to the Mutter, who in a family app is a
 * different person entirely.
 */
const RELATIONSHIP_ROLES: ReadonlyArray<{
  words: readonly string[];
  roles: readonly string[];
  fallbackRoles?: readonly string[];
}> = [
  {
    words: ["tochter", "töchter", "toechter"],
    roles: ["tochter"],
    fallbackRoles: ["kind"],
  },
  {
    words: ["sohn", "söhne", "soehne"],
    roles: ["sohn"],
    fallbackRoles: ["kind"],
  },
  { words: ["kind", "kinder"], roles: ["kind", "tochter", "sohn"] },
  { words: ["mutter", "mama", "mami"], roles: ["mutter"] },
  { words: ["vater", "papa", "papi"], roles: ["vater"] },
  { words: ["eltern"], roles: ["mutter", "vater", "elternteil"] },
  {
    words: ["frau", "ehefrau", "partnerin", "partner", "mann", "ehemann"],
    roles: ["partner:in", "partnerin", "partner"],
  },
  { words: ["oma", "großmutter", "grossmutter"], roles: ["oma"] },
  { words: ["opa", "großvater", "grossvater"], roles: ["opa"] },
  { words: ["bruder", "brüder", "brueder"], roles: ["bruder"] },
  { words: ["schwester", "schwestern"], roles: ["schwester"] },
  {
    words: ["geschwister"],
    roles: ["bruder", "schwester"],
    fallbackRoles: ["kind", "tochter", "sohn"],
  },
];

/**
 * Find the members a query refers to by their relationship rather than
 * their name ("meiner Tochter", "unserer Kinder").
 *
 * Returns [] when the query names no relationship, or when no member
 * carries a matching role — a relationship nobody filled in must not
 * silently resolve to the wrong person.
 */
export function findMembersByRelationship(
  query: string,
  members: MemberRef[],
): string[] {
  const withRole = members
    .map((member) => ({
      name: member.name,
      role: member.role?.trim().toLowerCase() ?? "",
    }))
    .filter((member) => member.role);

  const matched = new Set<string>();
  for (const entry of RELATIONSHIP_ROLES) {
    // Possessive-tolerant for the same reason names are: "Omas Papiere",
    // "Mamas Termin" is how the question gets asked.
    if (!entry.words.some((word) => matchesPersonName(query, word))) continue;

    const exact = withRole.filter((member) => entry.roles.includes(member.role));
    // The generic role answers only when the exact one names nobody.
    const chosen =
      exact.length > 0
        ? exact
        : withRole.filter((member) =>
            (entry.fallbackRoles ?? []).includes(member.role),
          );

    for (const member of chosen) matched.add(member.name);
  }

  // Keep the caller's order.
  return members.filter((m) => matched.has(m.name)).map((m) => m.name);
}

/**
 * Find the people a query refers to — by name, by possessive, or by
 * relationship. The one entry point the search paths should use.
 *
 * A name beats a relationship: "Hannas Zeugnis" scopes to Hanna even in a
 * family where Hanna is one of two daughters, and "das Zeugnis meiner
 * Tochter Hanna" does the same.
 */
export function findMentionedPeople(
  query: string,
  members: MemberRef[],
): string[] {
  const byName = findMentionedMembers(
    query,
    members.map((m) => m.name),
  );
  if (byName.length > 0) return byName;
  return findMembersByRelationship(query, members);
}

/**
 * Select the appropriate search mode for an "auto" request.
 *
 * Heuristic:
 *   - If the query refers to a known family member — by name, possessive
 *     or relationship ("meiner Tochter") → "graph" (the user is likely
 *     asking about a person's documents or tasks).
 *   - If the query contains task-related keywords (and no person) →
 *     "graph" (task/deadline queries are best answered via the graph/SQL
 *     tables, not semantic similarity).
 *   - Otherwise → "semantic" (content-based search over embeddings).
 *
 * @param query - The user's search query.
 * @param members - The family's members (names, or names with roles).
 * @returns The resolved mode ("semantic" or "graph").
 */
export function selectAutoMode(
  query: string,
  members: Array<string | MemberRef>,
): ExecutedSearchMode {
  const refs = members.map((m) => (typeof m === "string" ? { name: m } : m));
  if (findMentionedPeople(query, refs).length > 0) return "graph";
  if (isTaskQuery(query)) return "graph";
  return "semantic";
}
