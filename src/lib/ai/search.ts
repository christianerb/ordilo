import {
  generateQueryEmbedding,
  generateEmbeddings,
  embeddingToVectorString,
} from "@/lib/ai/embeddings";
import {
  FACT_TYPE_LABELS,
  normalizeFactValue,
  type FactType,
} from "@/lib/schemas/extraction";
import { expandQuery } from "@/lib/ai/query-expansion";
import { CHAT_MODEL } from "@/lib/ai/models";
import {
  findMentionedMembers,
  isTaskQuery,
  selectAutoMode,
  matchesWordBoundary,
  type SearchResult,
  type ExecutedSearchMode,
} from "@/lib/schemas/search";

/**
 * Shared search execution functions used by both the `/api/search` route
 * and the `/api/chat` route.
 *
 * Extracted from `src/app/api/search/route.ts` so the chat route can reuse
 * the same semantic + graph search logic without duplicating code.
 *
 * All functions receive the server Supabase client as a parameter (RLS-
 * scoped), so family isolation is enforced at the database level.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Maximum number of results to return (top-k limit — VAL-SEARCH-004). */
export const MAX_RESULTS = 10;

/**
 * Minimum cosine-similarity score for a semantic search result to be
 * considered relevant when assembling chat context/sources
 * (chat-api-fallback-relevance-threshold).
 *
 * The `semantic_search` RPC returns `score = 1 - (embedding <=> query_embedding)`,
 * i.e. cosine similarity in [0, 1] for normalised text embeddings. Scores
 * below this threshold indicate that the document is not meaningfully
 * related to the query (typical noise floor for text-embedding-3-small is
 * 0.0–0.25). The threshold is set to 0.2 for small family corpora (20–100
 * documents) where false positives are low-cost — even a marginal semantic
 * match is likely relevant at this scale. Larger corpora would need 0.3+
 * to suppress noise, but that is not the Ordilo scale.
 *
 * This threshold is ONLY applied to semantic search results — graph results
 * (person/task matches) are inherently relevant (they match via word-boundary
 * name/keyword matching) and are not subject to this filter.
 */
export const RELEVANCE_THRESHOLD = 0.2;

/** How many days ahead to look for upcoming task deadlines. */
export const TASK_DEADLINE_WINDOW_DAYS = 7;

/** Max user-visible latency the LLM query expansion may add (ms). */
export const EXPANSION_BUDGET_MS = 700;

/** Max latency for multi-query + HyDE generation (ms). */
const MULTI_QUERY_BUDGET_MS = 1500;

/** Max number of query variants to generate (besides the original + HyDE). */
const MAX_QUERY_VARIANTS = 2;

// ---------------------------------------------------------------------------
// Type alias for the server client (avoids importing the concrete factory
// here, which would couple this module to next/headers).
// ---------------------------------------------------------------------------

type ServerClient = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

// ---------------------------------------------------------------------------
// Query embedding cache
// ---------------------------------------------------------------------------

/**
 * Small in-memory TTL cache for query embeddings.
 *
 * One user search triggers the SAME query embedding in up to two places
 * (semantic chunk search + semantic node search in the graph), and chat
 * follow-ups often repeat the query verbatim. Caching turns those into a
 * single OpenAI roundtrip. Scope: per server instance, 60s TTL, 100
 * entries — a latency dedupe, not a persistence layer.
 */
const EMBEDDING_CACHE_TTL_MS = 60_000;
const EMBEDDING_CACHE_MAX = 100;
const embeddingCache = new Map<
  string,
  { promise: Promise<number[]>; expires: number }
>();

/**
 * Resolve the query embedding, deduplicating concurrent and repeated
 * requests for the same query. Failures are evicted immediately so a
 * transient OpenAI error is not cached.
 */
export function getQueryEmbedding(query: string): Promise<number[]> {
  const key = query.trim().toLowerCase();
  const now = Date.now();
  const cached = embeddingCache.get(key);
  if (cached && cached.expires > now) return cached.promise;

  const promise = generateQueryEmbedding(query);
  embeddingCache.set(key, { promise, expires: now + EMBEDDING_CACHE_TTL_MS });
  promise.catch(() => embeddingCache.delete(key));

  // Bounded size: evict the oldest entries.
  if (embeddingCache.size > EMBEDDING_CACHE_MAX) {
    for (const k of embeddingCache.keys()) {
      embeddingCache.delete(k);
      if (embeddingCache.size <= EMBEDDING_CACHE_MAX) break;
    }
  }

  return promise;
}

/** Test helper: reset the query-embedding cache between test cases. */
export function clearQueryEmbeddingCache(): void {
  embeddingCache.clear();
}

// ---------------------------------------------------------------------------
// Auto mode resolution
// ---------------------------------------------------------------------------

/**
 * Resolve "auto" mode to "semantic" or "graph" based on query analysis.
 *
 * Fetches family members (RLS-scoped) and uses selectAutoMode to choose.
 * VAL-SEARCH-014: the response mode is never "auto".
 */
export async function resolveAutoMode(
  serverClient: ServerClient,
  query: string,
  familyId: string,
): Promise<ExecutedSearchMode> {
  const memberNames = await fetchMemberNames(serverClient, familyId);
  return selectAutoMode(query, memberNames);
}

// ---------------------------------------------------------------------------
// Semantic search
// ---------------------------------------------------------------------------

/**
 * Execute a semantic search with multi-query retrieval + HyDE.
 *
 * Instead of embedding only the original query, this function:
 *   1. Generates 2 query variants + 1 hypothetical answer (HyDE) via LLM
 *   2. Embeds the original query + all variants in a single batched call
 *   3. Runs `semantic_search` RPC for each embedding
 *   4. Fuses all result lists with RRF
 *
 * This dramatically improves recall for questions like "Wann ging mein
 * letzter Flug?" — a HyDE document like "Der Flug EZS1183 von easyJet fand
 * am 17. Juli von Basel nach Hamburg statt" is much closer in embedding
 * space to the actual document than the question is.
 *
 * Falls back to single-query semantic search if the LLM call fails or
 * times out (graceful degradation — multi-query is a bonus, not a req).
 *
 * @throws {EmbeddingError} if the OpenAI embedding call fails.
 * @throws {Error} if the RPC returns an error.
 */
export async function semanticSearch(
  serverClient: ServerClient,
  query: string,
  familyId: string,
): Promise<SearchResult[]> {
  // 1. Generate query variants + HyDE via LLM (time-boxed).
  const variants = await generateSearchQueries(query);

  // 2. Embed the original query + all variants in one batched call.
  const queryEmbedding = await getQueryEmbedding(query); // cached original
  const variantEmbeddings = await generateEmbeddings(
    variants.map((v, i) => ({ text: v, index: i })),
  );

  // 3. Run semantic_search RPC for the original query first (must throw
  //    on error so the caller can surface failures), then variant queries
  //    in parallel (errors are swallowed — variants are a recall bonus).
  const originalVec = embeddingToVectorString(queryEmbedding);
  const variantVecs = variantEmbeddings.map((e) => embeddingToVectorString(e));

  type SemanticRow = {
    document_id: string;
    title: string | null;
    chunk_text: string;
    score: number;
  };

  // Original query — propagate errors.
  const { data: origData, error: origError } = await serverClient.rpc(
    "semantic_search",
    {
      p_query_embedding: originalVec,
      p_family_id: familyId,
      p_limit: MAX_RESULTS,
    },
  );
  if (origError) {
    throw new Error("Semantische Suche fehlgeschlagen.");
  }
  const origRows = (origData ?? []) as SemanticRow[];

  // Variant queries — best effort, swallow errors.
  const variantResults = await Promise.all(
    variantVecs.map(async (vec): Promise<SemanticRow[]> => {
      try {
        const { data, error } = await serverClient.rpc("semantic_search", {
          p_query_embedding: vec,
          p_family_id: familyId,
          p_limit: MAX_RESULTS,
        });
        if (error) return [];
        return (data ?? []) as SemanticRow[];
      } catch {
        return [];
      }
    }),
  );

  // 4. Map each RPC result list to SearchResult[].
  const allRows = [origRows, ...variantResults];
  const searchLists: SearchResult[][] = allRows.map((rows: SemanticRow[]) =>
    rows.map((row) => ({
      document_id: row.document_id,
      title: row.title,
      chunk_text: row.chunk_text,
      score: row.score,
      source: "semantic" as const,
    })),
  );

  // 5. Fuse with RRF. If only the original query produced results, skip RRF.
  if (searchLists.length === 1) return searchLists[0];
  const fused = fuseResultsRrf(searchLists);
  return fused.slice(0, MAX_RESULTS);
}

// ---------------------------------------------------------------------------
// Multi-query + HyDE generation
// ---------------------------------------------------------------------------

/**
 * Generate search query variants and a HyDE (Hypothetical Document
 * Embedding) answer for multi-query retrieval.
 *
 * Uses a single LLM call to produce:
 *   - 2 keyword-focused query variants (e.g., "Flug Basel Hamburg Datum"
 *     for "Wann ging mein letzter Flug")
 *   - 1 hypothetical answer paragraph (HyDE) that describes what the
 *     matching document might contain
 *
 * Time-boxed: if the LLM call exceeds MULTI_QUERY_BUDGET_MS, returns an
 * empty array (caller falls back to single-query search).
 */
async function generateSearchQueries(query: string): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return [];

    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey });

    const prompt = `Suchanfrage: "${trimmed}"

Generiere fuer eine Dokumentensuche in einer Familien-Dokumenten-App:
1. ${MAX_QUERY_VARIANTS} alternative Suchanfragen mit den wichtigsten Stichworten (auf Deutsch)
2. Einen hypothetischen Antworttext (2-3 Saetze), der beschreibt, was das gesuchte Dokument enthalten koennte

Beispiel fuer "Wann ging mein letzter Flug?":
Variante 1: Flug Datum Abflug Ankunft
Variante 2: easyJet Fluginfo Flugnummer Route
HyDE: Der Flug fand am 17. Juli mit easyJet von Basel nach Hamburg statt. Abflug um 19:25, Ankunft um 20:55. Flugnummer EZS1183.

Antworte im Format:
V1: <variante>
V2: <variante>
HYDE: <hypothetischer antworttext>`;

    const response = await Promise.race([
      client.chat.completions.create({
        model: CHAT_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0,
      }),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), MULTI_QUERY_BUDGET_MS),
      ),
    ]);

    if (!response) return [];

    const text = response.choices[0]?.message?.content ?? "";
    const variants: string[] = [];

    for (const line of text.split("\n")) {
      const match = line.match(/^(V\d+|HYDE):\s*(.+)/i);
      if (match) {
        const content = match[2].trim();
        if (content.length > 3) variants.push(content);
      }
    }

    return variants.slice(0, MAX_QUERY_VARIANTS + 1);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Lexical search (German full-text over embedding chunks)
// ---------------------------------------------------------------------------

/**
 * Execute a lexical (full-text) search via the `lexical_search` RPC.
 *
 * Complements semantic search for exact/rare terms (identifiers, names,
 * literal phrases) where embedding similarity is unreliable. Failures
 * degrade gracefully to an empty result — lexical search is an additional
 * recall path, never the only one.
 */
export async function lexicalSearch(
  serverClient: ServerClient,
  query: string,
  familyId: string,
): Promise<SearchResult[]> {
  const { data, error } = await serverClient.rpc("lexical_search", {
    p_query: query,
    p_family_id: familyId,
    p_limit: MAX_RESULTS,
  });

  if (error || !data) return [];

  const rows = data as Array<{
    document_id: string;
    title: string | null;
    chunk_text: string;
    score: number;
  }>;

  return rows.map((row) => ({
    document_id: row.document_id,
    title: row.title,
    chunk_text: row.chunk_text,
    // ts_rank_cd is unbounded-ish but typically << 1; cap into [0, 1] so
    // downstream score semantics (relevance threshold, UI) hold.
    score: Math.min(Math.max(row.score, 0), 1),
    source: "lexical",
  }));
}

// ---------------------------------------------------------------------------
// Fact search (typed identifiers: serial numbers, contract numbers, ...)
// ---------------------------------------------------------------------------

/**
 * Search `document_facts` for typed identifiers matching the query.
 *
 * Two match paths:
 *   1. Label / fact-type match: query keywords against the fact label
 *      ("Seriennummer Waschmaschine") and against the German fact-type
 *      labels ("Seriennummer" → serial_number).
 *   2. Value match: identifier-like query tokens (containing digits) are
 *      normalized (lowercase, alphanumeric only) and matched against
 *      `normalized_value`, so "SN 4823-XK" finds "sn4823xk".
 *
 * Only facts of confirmed documents are returned. A fact hit is a precise
 * answer, so it scores high (0.9+) and ranks above fuzzy chunk matches.
 */
export async function factSearch(
  serverClient: ServerClient,
  query: string,
  familyId: string,
): Promise<SearchResult[]> {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  // Fact types whose German label appears in the query
  // ("Wie ist die Seriennummer ...?" → serial_number).
  const matchedTypes = (
    Object.entries(FACT_TYPE_LABELS) as Array<[FactType, string]>
  )
    .filter(([, label]) => matchesWordBoundary(query, label))
    .map(([type]) => type);

  // Identifier-like tokens: contain at least one digit and are ≥ 4 chars
  // after normalization ("4823", "sn4823xk", "de89370400440532013000").
  const identifierTokens = query
    .split(/\s+/)
    .map((t) => normalizeFactValue(t))
    .filter((t) => t.length >= 4 && /\d/.test(t));

  const orFilters: string[] = [];
  for (const kw of keywords) {
    if (!kw.includes(" ")) orFilters.push(`label.ilike.%${kw}%`);
  }
  for (const type of matchedTypes) {
    orFilters.push(`fact_type.eq.${type}`);
  }
  for (const token of identifierTokens) {
    orFilters.push(`normalized_value.ilike.%${token}%`);
  }

  if (orFilters.length === 0) return [];

  const { data: facts, error } = await serverClient
    .from("document_facts")
    .select("document_id, fact_type, label, value, normalized_value, confidence, confirmed")
    .eq("family_id", familyId)
    .eq("confirmed", true)
    .or(orFilters.join(","));

  if (error || !facts || facts.length === 0) return [];

  // Only facts from confirmed documents.
  const docIds = [...new Set(facts.map((f) => f.document_id))];
  const confirmedDocs = await fetchConfirmedDocuments(
    serverClient,
    familyId,
    docIds,
  );
  const docsById = new Map(confirmedDocs.map((d) => [d.id, d]));

  const results: SearchResult[] = [];
  for (const fact of facts) {
    const doc = docsById.get(fact.document_id);
    if (!doc) continue;

    // Value matches are exact answers → top score. Label/type matches are
    // strong but slightly below, so an exact identifier hit always wins.
    const valueMatch = identifierTokens.some(
      (t) =>
        fact.normalized_value.includes(t) || t.includes(fact.normalized_value),
    );
    const score = valueMatch ? 0.98 : 0.9;

    const typeLabel =
      FACT_TYPE_LABELS[fact.fact_type as FactType] ?? FACT_TYPE_LABELS.other;

    results.push({
      document_id: fact.document_id,
      title: doc.title,
      chunk_text: `${typeLabel} — ${fact.label}: ${fact.value}`,
      score,
      source: "fact",
    });
  }

  // Best fact per document.
  return deduplicateByDocumentId(results);
}

// ---------------------------------------------------------------------------
// Hybrid search (facts + semantic + lexical, fused via RRF)
// ---------------------------------------------------------------------------

/** RRF constant — standard value from the original RRF paper. */
const RRF_K = 60;

/**
 * Fuse multiple ranked result lists with Reciprocal Rank Fusion.
 *
 * Each list contributes `1 / (k + rank)` per document; documents appearing
 * in several lists accumulate contributions and rise. RRF is used for
 * ORDERING only — the returned `score` stays on the original 0–1 relevance
 * scale (best score across lists, plus a small multi-source boost) so the
 * downstream relevance threshold and UI semantics are unchanged.
 */
export function fuseResultsRrf(
  lists: SearchResult[][],
  k: number = RRF_K,
): SearchResult[] {
  const byDoc = new Map<
    string,
    { best: SearchResult; rrf: number; sources: Set<string> }
  >();

  for (const list of lists) {
    for (let rank = 0; rank < list.length; rank++) {
      const result = list[rank];
      const contribution = 1 / (k + rank + 1);
      const existing = byDoc.get(result.document_id);
      if (!existing) {
        byDoc.set(result.document_id, {
          best: result,
          rrf: contribution,
          sources: new Set([result.source]),
        });
      } else {
        existing.rrf += contribution;
        existing.sources.add(result.source);
        if (result.score > existing.best.score) {
          existing.best = result;
        }
      }
    }
  }

  const fused = [...byDoc.values()].map(({ best, rrf, sources }) => ({
    result: {
      ...best,
      score:
        sources.size > 1
          ? Math.min(best.score + (sources.size - 1) * 0.05, 1.0)
          : best.score,
      source: sources.size > 1 ? "hybrid" : best.source,
    },
    rrf,
  }));

  fused.sort(
    (a, b) =>
      b.rrf - a.rrf ||
      b.result.score - a.result.score ||
      a.result.document_id.localeCompare(b.result.document_id),
  );

  return fused.map((f) => f.result);
}

/**
 * Execute a hybrid content search: facts + semantic + lexical in parallel,
 * fused with RRF.
 *
 * This is the default content-search path (replacing plain semanticSearch
 * in the search route and chat tools). Exact identifier questions ("Wie ist
 * die Seriennummer?") are answered by the fact path; paraphrased questions
 * by the semantic path; literal/rare terms by the lexical path.
 *
 * Degradation: lexical and fact failures are swallowed (recall bonus, not
 * requirement). If the semantic path fails AND nothing else matched, the
 * semantic error is rethrown so the caller surfaces the real failure
 * (e.g. OpenAI down) instead of a silent empty result.
 */
export async function hybridSearch(
  serverClient: ServerClient,
  query: string,
  familyId: string,
): Promise<SearchResult[]> {
  const [semanticResult, lexicalResult, factResult] = await Promise.allSettled([
    semanticSearch(serverClient, query, familyId),
    lexicalSearch(serverClient, query, familyId),
    factSearch(serverClient, query, familyId),
  ]);

  const semantic =
    semanticResult.status === "fulfilled" ? semanticResult.value : [];
  const lexical =
    lexicalResult.status === "fulfilled" ? lexicalResult.value : [];
  const facts = factResult.status === "fulfilled" ? factResult.value : [];

  if (
    semanticResult.status === "rejected" &&
    lexical.length === 0 &&
    facts.length === 0
  ) {
    throw semanticResult.reason;
  }

  // Facts first: an exact identifier answer must never be pushed off the
  // list by ten fuzzy chunk matches.
  return fuseResultsRrf([facts, semantic, lexical]).slice(0, MAX_RESULTS);
}

// ---------------------------------------------------------------------------
// Graph search
// ---------------------------------------------------------------------------

/**
 * Execute a graph search.
 *
 * Parses the query for person names (matched against family_members) and
 * task-related keywords. Also traverses the knowledge graph (nodes + edges)
 * to find documents connected to mentioned entities (organizations, persons).
 *
 * Only confirmed documents appear in results. Returns empty when no matches
 * (200, not error — VAL-SEARCH-013).
 *
 * Strategy:
 *   - Graph traversal: match query keywords against knowledge_nodes labels,
 *     then follow knowledge_edges to find connected documents.
 *   - Person mentioned (not task query): find documents linked to that person
 *     via extracted_entities.
 *   - Person mentioned + task query: find tasks for that person's documents.
 *   - Task query (no person): find open tasks with upcoming deadlines
 *     (within TASK_DEADLINE_WINDOW_DAYS days).
 *   - Neither: return empty (graph traversal may still find matches).
 */
export async function graphSearch(
  serverClient: ServerClient,
  query: string,
  familyId: string,
): Promise<SearchResult[]> {
  // 1. Fetch family members to detect person names.
  const memberNames = await fetchMemberNames(serverClient, familyId);
  const mentionedMembers = findMentionedMembers(query, memberNames);
  const taskQuery = isTaskQuery(query);

  // 1b. Query expansion — generate synonyms for better graph matching.
  //     "Kita" → ["Kindergarten", "Krippe", "Tagesstaette"] etc.
  //     Time-boxed: this is an LLM call, and recall bonus must never cost
  //     more than EXPANSION_BUDGET_MS of user-visible latency. On timeout
  //     the search simply runs with the original terms.
  let expandedTerms: string[] = [];
  try {
    const expanded = await Promise.race([
      expandQuery(query),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), EXPANSION_BUDGET_MS),
      ),
    ]);
    if (expanded) expandedTerms = expanded.expansions;
  } catch {
    // Graceful degradation — search with original query only
  }

  const results: SearchResult[] = [];

  // 2. Graph traversal: find documents connected to entities mentioned in the query.
  //    Uses expanded terms for broader keyword matching + semantic label embeddings.
  const traversalResults = await graphTraversalSearch(
    serverClient,
    query,
    familyId,
    expandedTerms,
  );
  results.push(...traversalResults);

  // 3. Person-based search: find documents linked to mentioned persons.
  let personDocIds: string[] = [];
  if (mentionedMembers.length > 0) {
    const personResults = await searchByPerson(
      serverClient,
      familyId,
      mentionedMembers,
    );
    results.push(...personResults.results);
    personDocIds = personResults.docIds;
  }

  // 3. Task-based search.
  if (taskQuery) {
    const taskResults = await searchTasks(
      serverClient,
      familyId,
      mentionedMembers.length > 0 ? personDocIds : null,
    );
    results.push(...taskResults);
  }

  // 5. Deduplicate by document_id (keep highest score per document).
  return deduplicateByDocumentId(results);
}

// ---------------------------------------------------------------------------
// Graph traversal search
// ---------------------------------------------------------------------------

/** German stop words filtered out before matching query terms against node labels. */
const GRAPH_STOP_WORDS = new Set([
  "zeig", "mir", "alle", "der", "die", "das", "von", "zur", "zum", "welche",
  "was", "muss", "ich", "erledigen", "finde", "letzte", "fristen", "laufen",
  "bald", "ab", "diese", "woche", "dokumente", "aufgaben", "gibt",
  "es", "ein", "eine", "mit", "fuer", "haben", "ist", "sind", "nicht",
  "noch", "hat", "wann", "wie", "wo", "warum", "bitte", "kannst", "du",
  "oder", "und", "auch", "nur", "schon", "immer", "heute", "morgen",
  "gestern", "aktuell", "letzte", "neue", "neuen", "neues", "altes",
  "alles", "welcher", "welches", "welchem", "welchen", "meine", "deine",
  "unsere", "eure", "sein", "seinem", "seiner", "ihr", "ihre", "ihrem",
]);

/**
 * Extract significant keywords from a German natural-language query.
 *
 * Beyond simple stop-word filtering, this also extracts bigrams (2-word
 * combinations) to match multi-word entity labels like "Kita Sonnenblume"
 * or "Stadtwerke Muenchen".
 *
 * @returns An array of keywords (unigrams + bigrams), lowercased, deduplicated.
 */
function extractKeywords(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\wäöüß]/g, "").trim())
    .filter((w) => w.length > 2 && !GRAPH_STOP_WORDS.has(w));

  const keywords = new Set<string>();

  // Unigrams
  for (const t of tokens) keywords.add(t);

  // Bigrams (adjacent token pairs) — captures multi-word entity names
  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = `${tokens[i]} ${tokens[i + 1]}`;
    if (bigram.length > 5) keywords.add(bigram);
  }

  return [...keywords];
}

/**
 * Traverse the knowledge graph to find documents connected to entities
 * mentioned in the query.
 *
 * SOTA strategy:
 *   1. Extract significant keywords from the query (filter stop words).
 *   2. Find knowledge_nodes whose label matches any keyword (ILIKE + fuzzy).
 *   3. Multi-hop traversal: follow edges up to MAX_HOPS deep, so queries
 *      like "Alle Dokumente von Emmas Arzt" can resolve
 *      Person → Organization → Document.
 *   4. Edge confidence and confirmed status factor into scoring.
 *   5. Map document nodes back to confirmed documents.
 *
 * @param serverClient - RLS-scoped Supabase server client.
 * @param query - The user's natural-language query.
 * @param familyId - The family to search within.
 * @returns SearchResult[] with source="graph:traversal".
 */

/** Maximum graph traversal depth (hops from matched nodes). */
const MAX_HOPS = 2;

async function graphTraversalSearch(
  serverClient: ServerClient,
  query: string,
  familyId: string,
  expandedTerms?: string[],
): Promise<SearchResult[]> {
  // 1. Extract significant keywords (unigrams + bigrams) from the query.
  //    Include expanded terms (synonyms) if provided.
  const keywords = extractKeywords(query);
  const expandedKeywords = expandedTerms?.length
    ? extractKeywords(expandedTerms.join(" "))
    : [];
  const allKeywords = [...new Set([...keywords, ...expandedKeywords])];

  if (allKeywords.length === 0) return [];

  // 2. Find knowledge_nodes whose label matches any keyword.
  //    Use ILIKE for lexical matching + cosine similarity on label_embedding
  //    for semantic matching (catches "Kita" → "Kindergarten").
  const orFilters: string[] = [];
  for (const kw of allKeywords) {
    if (kw.includes(" ")) {
      orFilters.push(`label.ilike.${kw}`);
    } else {
      orFilters.push(`label.ilike.%${kw}%`);
    }
  }

  // Lexical search via ILIKE
  const { data: ilikeNodes, error: nodesError } = await serverClient
    .from("knowledge_nodes")
    .select("id, type, label")
    .eq("family_id", familyId)
    .or(orFilters.join(","));

  if (nodesError) return [];

  // Semantic search via label_embedding cosine similarity
  // (only if label_embedding column has data)
  let semanticNodes: Array<{ id: string; type: string; label: string }> = [];
  try {
    const queryEmbedding = await getQueryEmbedding(query);
    const vectorStr = embeddingToVectorString(queryEmbedding);
    const { data: semNodes } = await serverClient
      .rpc("semantic_node_search", {
        p_query_embedding: vectorStr,
        p_family_id: familyId,
        p_limit: 10,
        p_threshold: 0.7,
      });
    if (semNodes && Array.isArray(semNodes)) {
      semanticNodes = semNodes.map((n: Record<string, unknown>) => ({
        id: n.id as string,
        type: n.type as string,
        label: n.label as string,
      }));
    }
  } catch {
    // label_embedding column may not exist or RPC not available — skip
  }

  // Merge ILIKE + semantic results (deduplicate by node id)
  const nodeMap = new Map<string, { id: string; type: string; label: string }>();
  for (const node of ilikeNodes ?? []) {
    nodeMap.set(node.id, node);
  }
  for (const node of semanticNodes) {
    if (!nodeMap.has(node.id)) {
      nodeMap.set(node.id, node);
    }
  }

  const matchingNodes = [...nodeMap.values()];
  if (matchingNodes.length === 0) return [];

  // Score each node by match quality: exact > bigram > unigram > fuzzy prefix
  const nodeScores = new Map<string, number>();
  for (const node of matchingNodes) {
    const labelLower = node.label.toLowerCase();
    let bestScore = 0;

    for (const kw of allKeywords) {
      if (labelLower === kw) {
        bestScore = Math.max(bestScore, 1.0);
      } else if (kw.includes(" ") && labelLower.includes(kw)) {
        bestScore = Math.max(bestScore, 0.85);
      } else if (labelLower.includes(kw)) {
        bestScore = Math.max(bestScore, 0.65);
      }
    }

    // Fuzzy prefix bonus: catch near-matches like "Kita" vs "Kitta"
    for (const kw of allKeywords) {
      if (kw.includes(" ")) continue;
      if (labelLower === kw || labelLower.includes(kw)) continue;
      if (
        labelLower.length <= kw.length + 3 &&
        labelLower.length >= kw.length - 1
      ) {
        const prefix = labelLower.slice(0, Math.min(3, kw.length));
        if (kw.startsWith(prefix)) {
          bestScore = Math.max(bestScore, 0.5);
        }
      }
    }

    if (node.type === "person") bestScore *= 1.1;
    if (node.type === "organization") bestScore *= 1.05;

    nodeScores.set(node.id, Math.min(bestScore, 1.0));
  }

  // 3. Multi-hop traversal with edge-confidence scoring.
  const visitedNodeIds = new Set<string>(matchingNodes.map((n) => n.id));
  const allDiscoveredNodeIds = new Set<string>(matchingNodes.map((n) => n.id));
  const traversalNodeMap = new Map(matchingNodes.map((n) => [n.id, n]));

  const documentIds = new Set<string>();
  const docBestNodeScore = new Map<string, number>();
  const docConnectionCount = new Map<string, number>();
  const docBestNode = new Map<string, { type: string; label: string }>();

  let currentHopNodeIds = [...matchingNodes.map((n) => n.id)];

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    if (currentHopNodeIds.length === 0) break;

    const [incomingResult, outgoingResult] = await Promise.all([
      serverClient
        .from("knowledge_edges")
        .select("source_node_id, target_node_id, relation_type, source_document_id, confidence, confirmed")
        .eq("family_id", familyId)
        .in("target_node_id", currentHopNodeIds),
      serverClient
        .from("knowledge_edges")
        .select("source_node_id, target_node_id, relation_type, source_document_id, confidence, confirmed")
        .eq("family_id", familyId)
        .in("source_node_id", currentHopNodeIds),
    ]);

    if (incomingResult.error || outgoingResult.error) break;

    const allEdges = [
      ...(incomingResult.data ?? []),
      ...(outgoingResult.data ?? []),
    ];

    if (allEdges.length === 0) break;

    const nextHopNodeIds = new Set<string>();

    for (const edge of allEdges) {
      const sourceNodeId = edge.source_node_id;
      const targetNodeId = edge.target_node_id;

      // Determine the "from" node (already visited) and "other" node
      const fromNodeId = visitedNodeIds.has(sourceNodeId)
        ? sourceNodeId
        : visitedNodeIds.has(targetNodeId)
          ? targetNodeId
          : null;

      if (!fromNodeId) continue;

      const otherNodeId = fromNodeId === sourceNodeId ? targetNodeId : sourceNodeId;

      // Edge confidence factor: confirmed edges get full weight
      const edgeConfidence = edge.confidence ?? 0.5;
      const confirmedFactor = edge.confirmed ? 1.0 : 0.7;

      // Hop decay: each hop reduces the propagated score
      const hopDecay = Math.pow(0.7, hop);

      const sourceNodeScore = nodeScores.get(fromNodeId) ?? 0.5;
      const propagatedScore = sourceNodeScore * hopDecay * confirmedFactor * edgeConfidence;

      // Collect document_ids from edges
      if (edge.source_document_id) {
        documentIds.add(edge.source_document_id);
        const current = docBestNodeScore.get(edge.source_document_id) ?? 0;
        if (propagatedScore > current) {
          docBestNodeScore.set(edge.source_document_id, propagatedScore);
          const fromNode = traversalNodeMap.get(fromNodeId);
          if (fromNode) {
            docBestNode.set(edge.source_document_id, { type: fromNode.type, label: fromNode.label });
          }
        }
        docConnectionCount.set(
          edge.source_document_id,
          (docConnectionCount.get(edge.source_document_id) ?? 0) + 1,
        );
      }

      // Discover new nodes for next hop
      if (!visitedNodeIds.has(otherNodeId)) {
        nextHopNodeIds.add(otherNodeId);
        allDiscoveredNodeIds.add(otherNodeId);
        if (!nodeScores.has(otherNodeId)) {
          nodeScores.set(otherNodeId, propagatedScore);
        }
      }
    }

    // Fetch node details for newly discovered nodes
    const newNodeIds = [...nextHopNodeIds];
    if (newNodeIds.length > 0) {
      const { data: newNodes } = await serverClient
        .from("knowledge_nodes")
        .select("id, type, label")
        .eq("family_id", familyId)
        .in("id", newNodeIds);

      for (const node of newNodes ?? []) {
        traversalNodeMap.set(node.id, node);
        visitedNodeIds.add(node.id);
      }
    }

    currentHopNodeIds = newNodeIds;
  }

  // 4. Look up document nodes to get document_ids from properties_json.
  const documentNodeIds = [...allDiscoveredNodeIds].filter((id) => {
    const node = traversalNodeMap.get(id);
    return node && node.type === "document";
  });

  if (documentNodeIds.length > 0) {
    const { data: docNodes } = await serverClient
      .from("knowledge_nodes")
      .select("id, properties_json")
      .eq("family_id", familyId)
      .eq("type", "document")
      .in("id", documentNodeIds);

    for (const node of docNodes ?? []) {
      const docId = node.properties_json?.document_id;
      if (docId && typeof docId === "string") {
        documentIds.add(docId);
        const score = nodeScores.get(node.id) ?? 0.5;
        const current = docBestNodeScore.get(docId) ?? 0;
        if (score > current) {
          docBestNodeScore.set(docId, score);
          const sourceNode = traversalNodeMap.get(node.id);
          if (sourceNode) {
            docBestNode.set(docId, { type: sourceNode.type, label: sourceNode.label });
          }
        }
      }
    }
  }

  if (documentIds.size === 0) return [];

  // 5. Fetch confirmed documents.
  const confirmedDocs = await fetchConfirmedDocuments(
    serverClient,
    familyId,
    [...documentIds],
  );

  // 6. Build results.
  const results: SearchResult[] = [];
  for (const doc of confirmedDocs) {
    const baseScore = docBestNodeScore.get(doc.id) ?? 0.5;
    const connections = docConnectionCount.get(doc.id) ?? 1;
    const score = Math.min(baseScore + (connections - 1) * 0.05, 0.95);

    const bestNode = docBestNode.get(doc.id);
    const typeLabel =
      bestNode?.type === "person"
        ? "Person"
        : bestNode?.type === "organization"
          ? "Organisation"
          : "Verknüpft";

    results.push({
      document_id: doc.id,
      title: doc.title,
      chunk_text: bestNode
        ? `${typeLabel}: ${bestNode.label}`
        : "Im Wissensgraph verknüpft",
      score,
      source: "graph:traversal",
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Internal graph search helpers
// ---------------------------------------------------------------------------

/**
 * Search for documents linked to specific persons via extracted_entities.
 *
 * Queries extracted_entities where entity_type = 'person' and
 * normalized_value ILIKE '%name%' (broad substring pre-filter to reduce
 * the DB result set), then applies a **word-boundary post-filter** in JS
 * to exclude false positives (e.g. querying "Hanna" must not match an
 * entity with normalized_value "johanna"). Finally fetches the confirmed
 * documents for the filtered document_ids.
 *
 * @returns { results, docIds } — the SearchResult[] for person matches and
 *          the unique document_ids of confirmed documents linked to the
 *          persons (used for task filtering).
 */
async function searchByPerson(
  serverClient: ServerClient,
  familyId: string,
  memberNames: string[],
): Promise<{ results: SearchResult[]; docIds: string[] }> {
  const results: SearchResult[] = [];
  const confirmedDocIds = new Set<string>();

  for (const name of memberNames) {
    const { data: entities, error } = await serverClient
      .from("extracted_entities")
      .select("document_id, entity_value, normalized_value, confidence")
      .eq("family_id", familyId)
      .eq("entity_type", "person")
      .ilike("normalized_value", `%${name.toLowerCase().trim()}%`);

    if (error) {
      throw new Error("Personensuche fehlgeschlagen.");
    }

    if (!entities || entities.length === 0) continue;

    // Word-boundary post-filter: only keep entities where the queried
    // name appears as a whole word in the entity's normalized_value.
    // This prevents false positives like "Hanna" matching "Johanna".
    const filteredEntities = entities.filter((entity) =>
      matchesWordBoundary(entity.normalized_value ?? "", name),
    );

    if (filteredEntities.length === 0) continue;

    // Get unique document_ids from the filtered entity matches.
    const entityDocIds = [
      ...new Set(filteredEntities.map((e) => e.document_id)),
    ];

    // Fetch confirmed documents for these document_ids.
    const confirmedDocs = await fetchConfirmedDocuments(
      serverClient,
      familyId,
      entityDocIds,
    );

    // Build results for each filtered entity whose document is confirmed.
    for (const entity of filteredEntities) {
      const doc = confirmedDocs.find((d) => d.id === entity.document_id);
      if (doc) {
        confirmedDocIds.add(doc.id);
        results.push({
          document_id: doc.id,
          title: doc.title,
          chunk_text: `Person: ${entity.entity_value}`,
          score: entity.confidence,
          source: "graph:person",
        });
      }
    }
  }

  return {
    results,
    docIds: [...confirmedDocIds],
  };
}

/**
 * Search for tasks based on the query type.
 *
 * - If personDocIds is provided (person-specific task query): find open
 *   tasks for those documents (all open tasks, regardless of due_date).
 * - If personDocIds is null (general task query): find open tasks with
 *   upcoming deadlines (due_date within TASK_DEADLINE_WINDOW_DAYS days).
 *
 * Only tasks whose parent document is confirmed are included.
 */
async function searchTasks(
  serverClient: ServerClient,
  familyId: string,
  personDocIds: string[] | null,
): Promise<SearchResult[]> {
  let query = serverClient
    .from("tasks")
    .select(
      "id, document_id, title, due_date, priority, status, confidence",
    )
    .eq("family_id", familyId)
    .eq("status", "open");

  // Person-specific: filter by the person's document_ids.
  if (personDocIds !== null) {
    if (personDocIds.length === 0) return [];
    query = query.in("document_id", personDocIds);
  } else {
    // General task query: filter by upcoming deadlines (within 7 days).
    // Apply a lower bound (>= today) so overdue/past tasks do not leak
    // into "upcoming" results (chat-api-guardrails).
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + TASK_DEADLINE_WINDOW_DAYS);
    const deadlineStr = deadline.toISOString().split("T")[0];
    query = query
      .not("due_date", "is", null)
      .gte("due_date", todayStr)
      .lte("due_date", deadlineStr);
  }

  const { data: tasks, error } = await query;

  if (error) {
    throw new Error("Aufgabensuche fehlgeschlagen.");
  }

  if (!tasks || tasks.length === 0) return [];

  // Fetch confirmed documents for the task document_ids.
  const taskDocIds = [...new Set(tasks.map((t) => t.document_id).filter((id): id is string => Boolean(id)))];
  const confirmedDocs = await fetchConfirmedDocuments(
    serverClient,
    familyId,
    taskDocIds,
  );

  const results: SearchResult[] = [];
  for (const task of tasks) {
    const doc = confirmedDocs.find((d) => d.id === task.document_id);
    if (doc) {
      results.push({
        document_id: doc.id,
        title: doc.title,
        chunk_text: `Aufgabe: ${task.title}`,
        score: task.confidence,
        source: "graph:task",
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Fetch family member names for the given family (RLS-scoped).
 */
export async function fetchMemberNames(
  serverClient: ServerClient,
  familyId: string,
): Promise<string[]> {
  const { data: members, error } = await serverClient
    .from("family_members")
    .select("name")
    .eq("family_id", familyId);

  if (error) {
    throw new Error("Familienmitglieder konnten nicht geladen werden.");
  }

  return (members ?? []).map((m) => m.name);
}

/**
 * Fetch confirmed documents for the given document_ids (RLS-scoped).
 *
 * Only documents with status = 'confirmed' are returned, ensuring
 * unconfirmed documents never appear in search results.
 */
export async function fetchConfirmedDocuments(
  serverClient: ServerClient,
  familyId: string,
  documentIds: string[],
): Promise<Array<{ id: string; title: string | null }>> {
  if (documentIds.length === 0) return [];

  const { data: docs, error } = await serverClient
    .from("documents")
    .select("id, title, status")
    .eq("family_id", familyId)
    .eq("status", "confirmed")
    .in("id", documentIds);

  if (error) {
    throw new Error("Dokumente konnten nicht geladen werden.");
  }

  return (docs ?? []).map((d) => ({ id: d.id, title: d.title }));
}

/**
 * Deduplicate search results by document_id, merging scores from multiple
 * sources. A document that appears in both semantic and graph results gets
 * a hybrid boost.
 *
 * This is the key hybrid scoring step: instead of keeping results per
 * (document_id, source) pair, we merge by document_id and compute a
 * combined score:
 *   - If a document only appears in one source → keep that score
 *   - If a document appears in multiple sources → take the best score
 *     and add a boost (0.1) for each additional source
 *
 * The result is sorted by score descending and limited to MAX_RESULTS.
 *
 * @param results - Combined results from semantic + graph search
 * @returns Deduplicated, hybrid-scored results sorted by score
 */
export function deduplicateByDocumentId(results: SearchResult[]): SearchResult[] {
  const byDoc = new Map<
    string,
    {
      best: SearchResult;
      sources: Set<string>;
    }
  >();

  for (const result of results) {
    const existing = byDoc.get(result.document_id);
    if (!existing) {
      byDoc.set(result.document_id, {
        best: result,
        sources: new Set([result.source]),
      });
    } else {
      existing.sources.add(result.source);
      if (result.score > existing.best.score) {
        // Keep the higher-scoring result but track all sources
        existing.best = { ...result };
      }
    }
  }

  // Apply hybrid boost and build final array
  const merged: SearchResult[] = [];
  for (const { best, sources } of byDoc.values()) {
    const sourceCount = sources.size;
    if (sourceCount > 1) {
      // Hybrid boost: +0.1 for each additional source (max +0.2)
      const boost = Math.min((sourceCount - 1) * 0.1, 0.2);
      merged.push({
        ...best,
        score: Math.min(best.score + boost, 1.0),
        source: "hybrid",
      });
    } else {
      merged.push(best);
    }
  }

  // Sort by score descending, then by document_id for stable ordering
  merged.sort((a, b) => b.score - a.score || a.document_id.localeCompare(b.document_id));

  return merged.slice(0, MAX_RESULTS);
}
