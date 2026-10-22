import { meteredOpenAIFetch } from "@/lib/analytics/api-usage";
import {
  generateQueryEmbedding,
  generateEmbeddings,
  embeddingToVectorString,
} from "@/lib/ai/embeddings";
import {
  compoundNumberStems,
  DEFAULT_FACT_LABEL,
  expandIdentifierTerms,
  normalizeFactValue,
} from "@/lib/schemas/extraction";
import { expandQuery } from "@/lib/ai/query-expansion";
import { SEARCH_AUGMENTATION_MODEL } from "@/lib/ai/models";
import {
  extractGraphKeywords,
  foldForMatch,
  GRAPH_STOP_WORDS,
  ilikeContainsFilter,
  isTypoOf,
  keywordLabelScore,
  personLabelMatches,
  possessiveVariants,
  wordsOf,
} from "@/lib/ai/graph-match";
import {
  findMentionedPeople,
  isTaskQuery,
  selectAutoMode,
  matchesPersonName,
  matchesWordBoundary,
  type MemberRef,
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
  const members = await fetchMembers(serverClient, familyId);
  return selectAutoMode(query, members);
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
  options: { expand?: boolean } = {},
): Promise<SearchResult[]> {
  // 1. Generate query variants + HyDE via LLM (time-boxed).
  const [variants, queryEmbedding] = await Promise.all([
    options.expand === false ? Promise.resolve([]) : generateSearchQueries(query),
    getQueryEmbedding(query),
  ]);

  // 2. Embed the original query + all variants in one batched call.
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
    const client = new OpenAI({ apiKey, fetch: meteredOpenAIFetch });

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
      client.responses.create({
        model: SEARCH_AUGMENTATION_MODEL,
        input: prompt,
        max_output_tokens: 300,
        store: false,
      }),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), MULTI_QUERY_BUDGET_MS),
      ),
    ]);

    if (!response) return [];

    const text = response.output_text;
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
// Fact search (identifiers: "Steuer-ID Hanna", "Seriennummer Waschmaschine")
// ---------------------------------------------------------------------------

/**
 * Search `document_facts` for identifiers matching the query.
 *
 * Two match paths:
 *   1. Label match: query keywords against the fact label ("Seriennummer
 *      Waschmaschine"), widened by the synonym groups so "Steuernummer"
 *      also finds a label written as "Steuer-ID"
 *      (see IDENTIFIER_SYNONYM_GROUPS), and by compound stems so
 *      "Aktenzeichennummer" finds a label reading just "Aktenzeichen".
 *   2. Value match: identifier-like query tokens (containing digits) are
 *      normalized (lowercase, alphanumeric only) and matched against
 *      `normalized_value`, so "SN 4823-XK" finds "sn4823xk".
 *
 * Only facts of confirmed documents are returned. A fact hit is a precise
 * answer, so it scores high (0.9+) and ranks above fuzzy chunk matches.
 *
 * Candidates are finally scoped to the family members named in the query,
 * so "die Steuer-ID von Hanna" cannot be answered with Emma's number.
 */
/**
 * Significant words of a question as written (umlauts kept, for ILIKE on
 * fact labels), plus adjacent pairs.
 */
function extractKeywords(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length > 2 && !GRAPH_STOP_WORDS.has(foldForMatch(w)));
  const keywords = new Set(tokens);
  for (let i = 0; i < tokens.length - 1; i++) {
    keywords.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return [...keywords];
}

export async function factSearch(
  serverClient: ServerClient,
  query: string,
  familyId: string,
): Promise<SearchResult[]> {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  // Identifier-like tokens: contain at least one digit and are ≥ 4 chars
  // after normalization ("4823", "sn4823xk", "de89370400440532013000").
  const identifierTokens = query
    .split(/\s+/)
    .map((t) => normalizeFactValue(t))
    .filter((t) => t.length >= 4 && /\d/.test(t));

  // Query keywords, the stems behind compound number words
  // ("Aktenzeichennummer" → "aktenzeichen"), and every synonym of the
  // number kinds the question touches. Multi-word terms are dropped: they
  // are bigrams of the query or long compound spellings, and neither
  // survives a label ILIKE.
  const labelTerms = new Set(
    [
      ...keywords,
      ...compoundNumberStems(query),
      ...expandIdentifierTerms(query),
    ].filter((term) => !term.includes(" ")),
  );

  const orFilters: string[] = [];
  for (const term of labelTerms) {
    orFilters.push(ilikeContainsFilter("label", term));
  }
  for (const token of identifierTokens) {
    orFilters.push(`normalized_value.ilike.%${token}%`);
  }

  if (orFilters.length === 0) return [];

  const { data: exactFacts, error } = await serverClient
    .from("document_facts")
    .select("document_id, label, value, normalized_value, confidence, confirmed")
    .eq("family_id", familyId)
    .eq("confirmed", true)
    .or(orFilters.join(","));

  // Nothing matched literally — the label may simply be spelled
  // differently than the question ("Aktenzeihen", "Bestellnumer"). Ask
  // the trigram index before giving up.
  const facts =
    !error && exactFacts && exactFacts.length > 0
      ? exactFacts
      : await fuzzyFactSearch(serverClient, familyId, [...labelTerms]);

  if (facts.length === 0) return [];

  // Only facts from confirmed documents.
  const docIds = [...new Set(facts.map((f) => f.document_id))];
  const confirmedDocs = await fetchConfirmedDocuments(
    serverClient,
    familyId,
    docIds,
  );
  const docsById = new Map(confirmedDocs.map((d) => [d.id, d]));

  // The filters above are ORed for recall, so the candidates still hold
  // the wrong kind of number and the wrong person's number. Narrowing
  // decides between them.
  const visibleFacts = facts
    .filter((f) => docsById.has(f.document_id))
    .map((fact) => ({
      ...fact,
      // Value matches are exact answers → top score, and they are never
      // dropped for being the "wrong kind": asking what a number IS must
      // stay answerable.
      valueMatch: identifierTokens.some(
        (t) =>
          fact.normalized_value.includes(t) ||
          t.includes(fact.normalized_value),
      ),
    }));

  const scopedFacts = await narrowFactCandidates(
    serverClient,
    query,
    familyId,
    visibleFacts,
    [...labelTerms],
  );

  const results: SearchResult[] = [];
  for (const fact of scopedFacts) {
    const doc = docsById.get(fact.document_id);
    if (!doc) continue;

    results.push({
      document_id: fact.document_id,
      title: doc.title,
      chunk_text: `${fact.label || DEFAULT_FACT_LABEL}: ${fact.value}`,
      score: fact.valueMatch ? 0.98 : 0.9,
      source: "fact",
    });
  }

  // Best fact per document.
  return deduplicateByDocumentId(results);
}

/**
 * Minimum word similarity for a fuzzy label hit.
 *
 * 0.6 is roughly "one or two characters off in a word of normal length":
 * "aktenzeihen" still finds "Aktenzeichen", while "rechnung" does not
 * drag in "Rechnungsnummer"-adjacent noise. Lower would start answering
 * questions with numbers the family did not ask about, which is worse
 * than answering none — the exact path already ran and found nothing.
 */
const FUZZY_LABEL_THRESHOLD = 0.6;

/**
 * Trigram lookup over fact labels, via the `fuzzy_fact_search` RPC.
 *
 * The fallback for a question whose wording does not literally occur in
 * any label. Failures degrade to no results: this path only ever runs
 * when the exact path already came back empty.
 */
async function fuzzyFactSearch(
  serverClient: ServerClient,
  familyId: string,
  terms: string[],
): Promise<
  Array<{
    document_id: string;
    label: string;
    value: string;
    normalized_value: string;
    confidence: number;
  }>
> {
  // Single characters and two-letter words are noise for a trigram match.
  const usableTerms = terms.filter((term) => term.length >= 4);
  if (usableTerms.length === 0) return [];

  const { data, error } = await serverClient.rpc("fuzzy_fact_search", {
    p_family_id: familyId,
    p_terms: usableTerms,
    p_threshold: FUZZY_LABEL_THRESHOLD,
  });

  if (error || !data) return [];
  return data;
}

/** A fact row as far as narrowing is concerned. */
type ScopableFact = {
  document_id: string;
  label: string;
  valueMatch: boolean;
};

/**
 * Narrow the candidates of a fact search down to what was actually asked
 * for: the right KIND of number, belonging to the right PERSON.
 *
 * "Wie ist die Steuer-ID von Hanna?" produces ORed filters for both
 * "steuerid" and "hanna", so the candidates contain Hanna's Kundennummer
 * and Emma's Steuer-ID as well. Two passes sort that out:
 *
 *   1. Kind — keep the facts whose label matches a term describing the
 *      number itself. The person's name is not such a term, so
 *      "Kundennummer Hanna" drops out of a question about the Steuer-ID.
 *   2. Person — sort the facts by whom they belong to, by the name in the
 *      fact's own label ("Steuer-ID Hanna") and by the persons extracted
 *      from its document. The label is what makes this work inside ONE
 *      document: a Steuerbescheid listing two children carries both their
 *      numbers, and the document-level signal cannot tell them apart.
 *
 * The two passes fail in opposite directions, because they are not
 * equally certain:
 *
 *   - A kind pass that would empty the list leaves it as it was. A label
 *     can name the right number without using the word the question used.
 *   - A fact that positively belongs to SOMEBODY ELSE is dropped, even if
 *     it is the last one standing. Answering "Wie ist die Steuer-ID von
 *     Hanna?" with the only stored Steuer-ID, Emma's, is worse than
 *     answering nothing. A fact nobody is attached to survives — unknown
 *     is not the same as somebody else's.
 *
 * Facts matched by their value survive both passes: asking what a number
 * IS stays answerable.
 */
async function narrowFactCandidates<T extends ScopableFact>(
  serverClient: ServerClient,
  query: string,
  familyId: string,
  facts: T[],
  labelTerms: string[],
): Promise<T[]> {
  if (facts.length === 0) return facts;

  const members = await fetchMembers(serverClient, familyId);
  const mentioned = findMentionedPeople(query, members);

  // 1. Kind pass. Everything the query said that is NOT one of the named
  //    members describes the number itself.
  const kindTerms = labelTerms.filter(
    (term) =>
      !mentioned.some(
        // Both directions: the term can be the whole name or its
        // possessive ("hannas"), or one word of a two-word name.
        (name) => matchesPersonName(term, name) || matchesWordBoundary(name, term),
      ),
  );
  const byKind = facts.filter(
    (f) =>
      f.valueMatch ||
      kindTerms.some((term) => f.label.toLowerCase().includes(term)),
  );
  const kindScoped = byKind.length > 0 ? byKind : facts;

  if (mentioned.length === 0) return kindScoped;

  // 2. Person pass. Everyone in the family who was NOT asked about is a
  //    reason to reject a fact, not merely a weaker match.
  const others = members
    .map((m) => m.name.trim())
    .filter((name) => name && !mentioned.includes(name));

  const namedInLabel = (f: T, names: string[]) =>
    names.some((name) => matchesPersonName(f.label, name));

  const asked = kindScoped.filter((f) => f.valueMatch || namedInLabel(f, mentioned));
  if (asked.length > 0) return asked;

  // Nothing carries the asked-for name. Whatever positively belongs to
  // someone else is out; the rest is undecided and needs the document.
  const undecided = kindScoped.filter((f) => !namedInLabel(f, others));
  if (undecided.length === 0) return [];

  const { data: entities } = await serverClient
    .from("extracted_entities")
    .select("document_id, normalized_value")
    .eq("family_id", familyId)
    .eq("entity_type", "person")
    .in("document_id", [...new Set(undecided.map((f) => f.document_id))]);

  const docPersons = new Map<string, string[]>();
  for (const entity of entities ?? []) {
    const list = docPersons.get(entity.document_id) ?? [];
    list.push(entity.normalized_value ?? "");
    docPersons.set(entity.document_id, list);
  }

  const namesDoc = (documentId: string, names: string[]) =>
    (docPersons.get(documentId) ?? []).some((value) =>
      names.some((name) => matchesPersonName(value, name)),
    );

  const byDocument = undecided.filter(
    (f) => f.valueMatch || namesDoc(f.document_id, mentioned),
  );
  if (byDocument.length > 0) return byDocument;

  // Keep only what nobody else has claimed — a document about Emma alone
  // does not answer a question about Hanna.
  return undecided.filter(
    (f) => f.valueMatch || !namesDoc(f.document_id, others),
  );
}

// ---------------------------------------------------------------------------
// Hybrid search (facts + semantic + lexical, fused via RRF)
// ---------------------------------------------------------------------------

/** RRF constant — standard value from the original RRF paper. */
const RRF_K = 60;

/**
 * Synthetic question embeddings improve retrieval, but their text does not
 * contain the answer. They may therefore rank a document, but must not replace
 * an answer-bearing document excerpt returned to the chat model.
 */
function isSyntheticQuestionChunk(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.endsWith("?") && trimmed.length < 150;
}

/**
 * Choose the chunk whose text will represent a matched document without
 * changing the document's best relevance score.
 */
export function shouldUseAsRepresentative(
  current: SearchResult,
  candidate: SearchResult,
): boolean {
  // Typed facts contain an exact label/value answer and take precedence over
  // prose chunks when both identify the same document.
  if (current.source === "fact" || candidate.source === "fact") {
    return candidate.source === "fact" && current.source !== "fact";
  }

  const currentIsQuestion = isSyntheticQuestionChunk(current.chunk_text);
  const candidateIsQuestion = isSyntheticQuestionChunk(candidate.chunk_text);
  if (currentIsQuestion !== candidateIsQuestion) {
    return !candidateIsQuestion;
  }

  return candidate.score > current.score;
}

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
    {
      representative: SearchResult;
      bestScore: number;
      rrf: number;
      sources: Set<string>;
    }
  >();

  for (const list of lists) {
    // RRF is document-based. Several chunks from one document in the same
    // result list improve the excerpt choice, but must not inflate its rank.
    const contributedDocuments = new Set<string>();
    let uniqueDocumentRank = 0;

    for (const result of list) {
      const isFirstChunkForDocument = !contributedDocuments.has(
        result.document_id,
      );
      const contribution = isFirstChunkForDocument
        ? 1 / (k + uniqueDocumentRank + 1)
        : 0;
      contributedDocuments.add(result.document_id);
      if (isFirstChunkForDocument) uniqueDocumentRank += 1;

      const existing = byDoc.get(result.document_id);
      if (!existing) {
        byDoc.set(result.document_id, {
          representative: result,
          bestScore: result.score,
          rrf: contribution,
          sources: new Set([result.source]),
        });
      } else {
        existing.rrf += contribution;
        existing.sources.add(result.source);
        existing.bestScore = Math.max(existing.bestScore, result.score);
        if (shouldUseAsRepresentative(existing.representative, result)) {
          existing.representative = result;
        }
      }
    }
  }

  const fused = [...byDoc.values()].map(
    ({ representative, bestScore, rrf, sources }) => ({
      result: {
        ...representative,
        score:
          sources.size > 1
            ? Math.min(bestScore + (sources.size - 1) * 0.05, 1.0)
            : bestScore,
        source: sources.size > 1 ? "hybrid" : representative.source,
      },
      rrf,
    }),
  );

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
  options: { expand?: boolean } = {},
): Promise<SearchResult[]> {
  const [semanticResult, lexicalResult, factResult] = await Promise.allSettled([
    semanticSearch(serverClient, query, familyId, options),
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
  // 1. Fetch family members to detect who the query is about — by name,
  //    by possessive, or by relationship ("meiner Tochter").
  const members = await fetchMembers(serverClient, familyId);
  const mentionedMembers = findMentionedPeople(query, members);
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
  //    Uses expanded terms for broader keyword matching + semantic label
  //    embeddings. The mentioned members go in resolved (name, typo or
  //    role), so "Hanahs Zeugnis" still reaches Hannah's person nodes.
  const traversalResults = await graphTraversalSearch(
    serverClient,
    query,
    familyId,
    members.filter((m) => mentionedMembers.includes(m.name)),
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

/**
 * Confidence for a confirmed edge that has none: the confirm RPC stores
 * 0.0 when extraction gave no confidence, which would otherwise zero out
 * a link the family itself confirmed.
 */
const DEFAULT_EDGE_CONFIDENCE = 0.7;

/** Lowest node score that still counts as a match. */
const MIN_NODE_SCORE = 0.55;

/** Matched nodes followed to their documents (keeps the edge query URL short). */
const MAX_MATCHED_NODES = 100;

/** Person and organization nodes scanned per family. */
const MAX_ENTITY_NODES = 5000;

/**
 * A knowledge node that answers part of a question.
 *
 * `term` is the part of the question it answers ("member:Hannah",
 * "kw:zahnarzt"), so a document reached through two different terms can
 * outrank one that matches only the person.
 */
export interface GraphNodeMatch {
  id: string;
  type: string;
  label: string;
  score: number;
  term: string;
  /** Document nodes: the document they stand for. */
  documentId?: string;
}

/** A document reached through matched nodes, best evidence first. */
export interface GraphDocumentHit {
  documentId: string;
  score: number;
  via: { type: string; label: string };
}

type NodeRow = {
  id: string;
  type: string;
  label: string;
  properties_json: Record<string, unknown> | null;
};

/** The first word of a member's name — what families call them. */
function firstNameOf(name: string): string {
  return wordsOf(name)[0] ?? "";
}

/**
 * Query keywords that do not just repeat a mentioned member's name. A name
 * matches people by whole word; as a keyword, "anna" would also reach into
 * every title containing "Hannah".
 */
export function graphKeywordsWithoutMembers(
  text: string,
  members: MemberRef[],
): string[] {
  const firstNames = members.map((m) => firstNameOf(m.name)).filter(Boolean);
  const namesMember = (word: string) =>
    firstNames.some((name) => possessiveVariants(word).some((v) => isTypoOf(v, name)));
  return extractGraphKeywords(text).filter(
    (keyword) => !keyword.split(" ").some(namesMember),
  );
}

/**
 * Find the knowledge nodes a question refers to.
 *
 * - People the question is about (already resolved by name, typo or role)
 *   match their person nodes: by the person_id the extraction linked, or
 *   by first name as a whole word — "Max" never matches "Maximilian".
 * - Keywords match people and organizations word by word (typo-tolerant),
 *   organizations also inside compounds and by kind ("zahnarzt" →
 *   "Zahnarztpraxis"), and document nodes by title.
 *
 * Person and organization nodes are few per family and matched in code;
 * document nodes are prefiltered by title in the database.
 */
export async function findGraphNodes(
  serverClient: ServerClient,
  familyId: string,
  { members, keywords }: { members: MemberRef[]; keywords: string[] },
): Promise<GraphNodeMatch[]> {
  const firstNames = members
    .map((m) => ({ member: m, first: firstNameOf(m.name) }))
    .filter((m) => m.first);
  const titleTerms = new Set<string>();
  for (const keyword of keywords) {
    for (const word of keyword.split(" ")) if (word.length >= 3) titleTerms.add(word);
  }
  for (const { first } of firstNames) titleTerms.add(first);
  // Titles keep their umlauts; the prefilter must find "Öffnungszeiten"
  // for the folded keyword "oeffnungszeiten" too.
  for (const term of [...titleTerms]) {
    const unfolded = term.replace(/ae/g, "ä").replace(/oe/g, "ö").replace(/ue/g, "ü");
    if (unfolded !== term) titleTerms.add(unfolded);
  }

  const [entityResult, documentResult] = await Promise.all([
    serverClient
      .from("knowledge_nodes")
      .select("id, type, label, properties_json")
      .eq("family_id", familyId)
      .in("type", ["person", "organization"])
      .limit(MAX_ENTITY_NODES),
    titleTerms.size > 0
      ? serverClient
          .from("knowledge_nodes")
          .select("id, type, label, properties_json")
          .eq("family_id", familyId)
          .eq("type", "document")
          .or([...titleTerms].map((t) => ilikeContainsFilter("label", t)).join(","))
          .limit(MAX_MATCHED_NODES * 2)
      : Promise.resolve({ data: [] as NodeRow[], error: null }),
  ]);
  // An unreadable graph costs its matches, never the whole search.
  if (entityResult.error) return [];

  const matches: GraphNodeMatch[] = [];
  const consider = (node: NodeRow, score: number, term: string) => {
    if (score < MIN_NODE_SCORE) return;
    const documentId = node.properties_json?.document_id;
    matches.push({
      id: node.id,
      type: node.type,
      label: node.label,
      score,
      term,
      documentId: typeof documentId === "string" ? documentId : undefined,
    });
  };

  for (const node of (entityResult.data ?? []) as NodeRow[]) {
    if (node.type === "person") {
      const personId = node.properties_json?.person_id;
      const member = firstNames.find(
        ({ member: m, first }) =>
          (m.id !== undefined && personId === m.id) ||
          personLabelMatches(node.label, first),
      );
      if (member) {
        consider(node, 1, `member:${member.member.name}`);
        continue;
      }
    }
    const kind =
      node.type === "organization" && typeof node.properties_json?.organization_type === "string"
        ? node.properties_json.organization_type
        : "";
    let best = 0;
    let bestTerm = "";
    for (const keyword of keywords) {
      const score = Math.max(
        keywordLabelScore(node.label, keyword, { compounds: node.type === "organization" }),
        kind ? keywordLabelScore(kind, keyword, { compounds: true }) * 0.9 : 0,
      );
      if (score > best) {
        best = score;
        bestTerm = `kw:${keyword}`;
      }
    }
    consider(node, best, bestTerm);
  }

  // A failed title prefilter only costs the title matches.
  for (const node of (documentResult.data ?? []) as NodeRow[]) {
    const member = firstNames.find(({ first }) => personLabelMatches(node.label, first));
    if (member) {
      consider(node, 0.9, `member:${member.member.name}`);
      continue;
    }
    let best = 0;
    let bestTerm = "";
    for (const keyword of keywords) {
      const score = keywordLabelScore(node.label, keyword, { compounds: true });
      if (score > best) {
        best = score;
        bestTerm = `kw:${keyword}`;
      }
    }
    consider(node, best, bestTerm);
  }

  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MATCHED_NODES);
}

/**
 * Follow matched nodes to their documents and score them.
 *
 * The graph is document ↔ entity, so one step reaches every document an
 * entity appears in. A document scores by its strongest link (node score ×
 * edge confidence) plus a bonus for each further part of the question it
 * answers: "Hannahs Ticket" puts the ticket above Hannah's other papers.
 *
 * When the question names a person, organizations matched by keyword are
 * kept only if they appear in that person's documents: "Hannahs Zahnarzt"
 * is her dentist, not every dentist the family has seen.
 */
export async function collectGraphDocuments(
  serverClient: ServerClient,
  familyId: string,
  nodes: GraphNodeMatch[],
): Promise<GraphDocumentHit[]> {
  if (nodes.length === 0) return [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ids = [...byId.keys()];
  const select = "source_node_id, target_node_id, source_document_id, confidence, confirmed";
  const [incoming, outgoing] = await Promise.all([
    serverClient.from("knowledge_edges").select(select).eq("family_id", familyId).in("target_node_id", ids),
    serverClient.from("knowledge_edges").select(select).eq("family_id", familyId).in("source_node_id", ids),
  ]);
  if (incoming.error || outgoing.error) return [];

  type Link = { node: GraphNodeMatch; documentId: string; score: number };
  const links: Link[] = [];
  for (const node of nodes) {
    if (node.documentId) links.push({ node, documentId: node.documentId, score: node.score });
  }
  for (const edge of [...(incoming.data ?? []), ...(outgoing.data ?? [])]) {
    if (!edge.source_document_id) continue;
    const confidence = edge.confidence && edge.confidence > 0 ? edge.confidence : DEFAULT_EDGE_CONFIDENCE;
    const factor = confidence * (edge.confirmed ? 1 : 0.7);
    for (const nodeId of [edge.source_node_id, edge.target_node_id]) {
      const node = byId.get(nodeId);
      if (node && !node.documentId) {
        links.push({ node, documentId: edge.source_document_id, score: node.score * factor });
      }
    }
  }

  const personDocs = new Set(
    links.filter((l) => l.node.term.startsWith("member:")).map((l) => l.documentId),
  );
  if (personDocs.size > 0) {
    const orgDocs = new Map<string, Set<string>>();
    for (const l of links) {
      if (l.node.type !== "organization") continue;
      if (!orgDocs.has(l.node.id)) orgDocs.set(l.node.id, new Set());
      orgDocs.get(l.node.id)!.add(l.documentId);
    }
    const linked = new Set(
      [...orgDocs].filter(([, docs]) => [...docs].some((d) => personDocs.has(d))).map(([id]) => id),
    );
    if (linked.size > 0) {
      for (let i = links.length - 1; i >= 0; i--) {
        if (links[i].node.type === "organization" && !linked.has(links[i].node.id)) links.splice(i, 1);
      }
    }
  }

  const byDocument = new Map<string, { best: Link; terms: Set<string> }>();
  for (const link of links) {
    const entry = byDocument.get(link.documentId);
    if (!entry) {
      byDocument.set(link.documentId, { best: link, terms: new Set([link.node.term]) });
      continue;
    }
    entry.terms.add(link.node.term);
    if (link.score > entry.best.score) entry.best = link;
  }

  return [...byDocument.entries()]
    .map(([documentId, { best, terms }]) => ({
      documentId,
      score: Math.min(0.85 * best.score + 0.1 * (terms.size - 1), 1),
      via: { type: best.node.type, label: best.node.label },
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Traverse the knowledge graph to find documents connected to the people
 * and things a question names.
 *
 * @param mentioned - Members the question is about (name, typo or role).
 * @param expandedTerms - Synonyms from query expansion.
 * @returns SearchResult[] with source="graph:traversal".
 */
async function graphTraversalSearch(
  serverClient: ServerClient,
  query: string,
  familyId: string,
  mentioned: MemberRef[],
  expandedTerms: string[],
): Promise<SearchResult[]> {
  const keywords = [
    ...new Set([
      ...graphKeywordsWithoutMembers(query, mentioned),
      ...graphKeywordsWithoutMembers(expandedTerms.join(" "), mentioned),
    ]),
  ];
  if (keywords.length === 0 && mentioned.length === 0) return [];

  const nodes = await findGraphNodes(serverClient, familyId, { members: mentioned, keywords });

  // Semantic label match catches "Kita" → "Kindergarten" when embeddings
  // are available; it never decides alone over a lexical match.
  try {
    const vectorStr = embeddingToVectorString(await getQueryEmbedding(query));
    const { data: semNodes } = await serverClient.rpc("semantic_node_search", {
      p_query_embedding: vectorStr,
      p_family_id: familyId,
      p_limit: 10,
      p_threshold: 0.7,
    });
    const known = new Set(nodes.map((n) => n.id));
    for (const n of (Array.isArray(semNodes) ? semNodes : []) as Array<Record<string, unknown>>) {
      if (known.has(n.id as string)) continue;
      nodes.push({
        id: n.id as string,
        type: n.type as string,
        label: n.label as string,
        score: 0.6 * (typeof n.score === "number" ? n.score : 1),
        term: `semantic:${n.id as string}`,
      });
    }
  } catch {
    // No embeddings (or no RPC): lexical matching only.
  }

  const hits = await collectGraphDocuments(serverClient, familyId, nodes);
  if (hits.length === 0) return [];

  const confirmedDocs = await fetchConfirmedDocuments(
    serverClient,
    familyId,
    hits.map((h) => h.documentId),
  );
  const titles = new Map(confirmedDocs.map((d) => [d.id, d.title]));

  return hits
    .filter((hit) => titles.has(hit.documentId))
    .map((hit) => ({
      document_id: hit.documentId,
      title: titles.get(hit.documentId) ?? null,
      chunk_text:
        hit.via.type === "person"
          ? `Person: ${hit.via.label}`
          : hit.via.type === "organization"
            ? `Organisation: ${hit.via.label}`
            : "Im Wissensgraph verknüpft",
      score: hit.score,
      source: "graph:traversal",
    }));
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

    // Name post-filter: only keep entities that actually name the person,
    // as themselves or in the possessive ("Hannas Zeugnis"). This prevents
    // false positives like "Hanna" matching "Johanna".
    const filteredEntities = entities.filter((entity) =>
      matchesPersonName(entity.normalized_value ?? "", name),
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
          // Below a graph hit that also matches the topic ("Hannahs
          // Ticket"), so the person alone never ties with it.
          score: entity.confidence * 0.8,
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
      "id, document_id, title, due_date, status, confidence",
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
 * Fetch the family's members (RLS-scoped).
 *
 * The role comes along because questions name people by relationship as
 * often as by name ("die Steuer-ID meiner Tochter").
 */
export async function fetchMembers(
  serverClient: ServerClient,
  familyId: string,
): Promise<MemberRef[]> {
  const { data: members, error } = await serverClient
    .from("family_members")
    .select("id, name, role")
    .eq("family_id", familyId);

  if (error) {
    throw new Error("Familienmitglieder konnten nicht geladen werden.");
  }

  return (members ?? []).map((m) => ({ id: m.id, name: m.name, role: m.role }));
}

/**
 * Fetch family member names for the given family (RLS-scoped).
 */
export async function fetchMemberNames(
  serverClient: ServerClient,
  familyId: string,
): Promise<string[]> {
  return (await fetchMembers(serverClient, familyId)).map((m) => m.name);
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
