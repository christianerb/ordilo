import {
  generateQueryEmbedding,
  embeddingToVectorString,
} from "@/lib/ai/embeddings";
import {
  findMentionedMembers,
  isTaskQuery,
  selectAutoMode,
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

/** How many days ahead to look for upcoming task deadlines. */
export const TASK_DEADLINE_WINDOW_DAYS = 7;

// ---------------------------------------------------------------------------
// Type alias for the server client (avoids importing the concrete factory
// here, which would couple this module to next/headers).
// ---------------------------------------------------------------------------

type ServerClient = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

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
 * Execute a semantic search.
 *
 * 1. Embed the query via OpenAI text-embedding-3-small.
 * 2. Call the `semantic_search` Postgres RPC with the embedding and family_id.
 * 3. Map the RPC results to SearchResult[].
 *
 * The RPC filters by family_id (RLS) and documents.status = 'confirmed',
 * so only confirmed documents from the user's family are returned.
 * The RPC limits to 10 results (VAL-SEARCH-004).
 *
 * @throws {EmbeddingError} if the OpenAI embedding call fails.
 * @throws {Error} if the RPC returns an error.
 */
export async function semanticSearch(
  serverClient: ServerClient,
  query: string,
  familyId: string,
): Promise<SearchResult[]> {
  // 1. Embed the query.
  const queryEmbedding = await generateQueryEmbedding(query);
  const vectorString = embeddingToVectorString(queryEmbedding);

  // 2. Call the semantic_search RPC.
  const { data, error } = await serverClient.rpc("semantic_search", {
    p_query_embedding: vectorString,
    p_family_id: familyId,
    p_limit: MAX_RESULTS,
  });

  if (error) {
    throw new Error("Semantische Suche fehlgeschlagen.");
  }

  // 3. Map results.
  const rows = (data ?? []) as Array<{
    document_id: string;
    title: string | null;
    chunk_text: string;
    score: number;
  }>;

  return rows.map((row) => ({
    document_id: row.document_id,
    title: row.title,
    chunk_text: row.chunk_text,
    score: row.score,
    source: "semantic",
  }));
}

// ---------------------------------------------------------------------------
// Graph search
// ---------------------------------------------------------------------------

/**
 * Execute a graph search.
 *
 * Parses the query for person names (matched against family_members) and
 * task-related keywords. Then queries:
 *   - extracted_entities for person matches (entity_type = 'person')
 *   - tasks for deadline / person-specific task matches
 *
 * Only confirmed documents appear in results. Returns empty when no matches
 * (200, not error — VAL-SEARCH-013).
 *
 * Strategy:
 *   - Person mentioned (not task query): find documents linked to that person
 *     via extracted_entities.
 *   - Person mentioned + task query: find tasks for that person's documents.
 *   - Task query (no person): find open tasks with upcoming deadlines
 *     (within TASK_DEADLINE_WINDOW_DAYS days).
 *   - Neither: return empty.
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

  // If neither person nor task keywords → no graph matches.
  if (mentionedMembers.length === 0 && !taskQuery) {
    return [];
  }

  const results: SearchResult[] = [];

  // 2. Person-based search: find documents linked to mentioned persons.
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

  // 4. Deduplicate by document_id (keep highest score per document).
  return deduplicateByDocumentId(results);
}

// ---------------------------------------------------------------------------
// Internal graph search helpers
// ---------------------------------------------------------------------------

/**
 * Search for documents linked to specific persons via extracted_entities.
 *
 * Queries extracted_entities where entity_type = 'person' and
 * normalized_value ILIKE '%name%', then fetches the confirmed documents
 * for those document_ids.
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

    // Get unique document_ids from the entity matches.
    const entityDocIds = [
      ...new Set(entities.map((e) => e.document_id)),
    ];

    // Fetch confirmed documents for these document_ids.
    const confirmedDocs = await fetchConfirmedDocuments(
      serverClient,
      familyId,
      entityDocIds,
    );

    // Build results for each entity whose document is confirmed.
    for (const entity of entities) {
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
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + TASK_DEADLINE_WINDOW_DAYS);
    const deadlineStr = deadline.toISOString().split("T")[0];
    query = query
      .not("due_date", "is", null)
      .lte("due_date", deadlineStr);
  }

  const { data: tasks, error } = await query;

  if (error) {
    throw new Error("Aufgabensuche fehlgeschlagen.");
  }

  if (!tasks || tasks.length === 0) return [];

  // Fetch confirmed documents for the task document_ids.
  const taskDocIds = [...new Set(tasks.map((t) => t.document_id))];
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
 * Deduplicate search results by (document_id, source), keeping the
 * highest-scoring result per (document, source-type) pair.
 *
 * This allows a document to appear with both a "graph:person" result and a
 * "graph:task" result (e.g. when querying "Was muss ich für Hanna erledigen?"
 * — both the person match and the task match are relevant).
 */
export function deduplicateByDocumentId(results: SearchResult[]): SearchResult[] {
  const best = new Map<string, SearchResult>();
  for (const result of results) {
    const key = `${result.document_id}:${result.source}`;
    const existing = best.get(key);
    if (!existing || result.score > existing.score) {
      best.set(key, result);
    }
  }
  return [...best.values()].slice(0, MAX_RESULTS);
}
