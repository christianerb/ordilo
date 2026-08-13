import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { EmbeddingError } from "@/lib/ai/embeddings";
import { parseJsonBody } from "@/lib/api/parse-json";
import { jsonError, methodNotAllowed } from "@/lib/api/respond";
import {
  searchRequestSchema,
  type SearchSuccessResponse,
  type SearchErrorResponse,
} from "@/lib/schemas/search";
import {
  hybridSearch,
  graphSearch,
  resolveAutoMode,
} from "@/lib/ai/search";
import { recordProductEvent } from "@/lib/analytics/product-events";

/**
 * POST /api/search
 *
 * Search API with three modes: semantic, graph, and auto.
 *
 * Input: { query, family_id, mode: "semantic" | "graph" | "auto" }
 *
 * Semantic mode (VAL-SEARCH-001..004):
 *   - Embeds the query via OpenAI text-embedding-3-small
 *   - Calls the `semantic_search` Postgres RPC (pgvector cosine similarity)
 *   - Returns top-10 results ranked by `1 - (embedding <=> query_embedding)`
 *   - Only confirmed documents appear (the RPC filters `documents.status =
 *     'confirmed'`)
 *   - RLS-enforced (the RPC is SECURITY INVOKER; the server client has the
 *     user's session, so family scoping is enforced at the DB level)
 *
 * Graph mode (VAL-SEARCH-010..013):
 *   - Parses the query for person names (matched against family_members)
 *     and task-related keywords (e.g. "Fristen", "erledigen", "Aufgaben")
 *   - Queries extracted_entities (person matches) and tasks (deadline /
 *     person-specific task matches) via SQL
 *   - Only confirmed documents appear in results
 *   - Returns empty results when no matches (200, not error)
 *
 * Auto mode (VAL-SEARCH-014):
 *   - Selects the appropriate mode based on query analysis:
 *     - Person name mentioned → graph
 *     - Task keywords present (no person) → graph
 *     - Otherwise → semantic
 *   - Reports which mode was actually used in the response `mode` field
 *     (never "auto")
 *
 * Auth: Required (401 without session — VAL-SEARCH-006).
 * Validation: Zod (400 on missing query/family_id or invalid mode —
 *   VAL-SEARCH-005, VAL-SEARCH-007).
 * RLS: All queries use the server client (RLS-scoped), so a user only sees
 *   results from their own family (VAL-SEARCH-002).
 *
 * The search execution functions are shared with `/api/chat` via
 * `@/lib/ai/search`.
 */

export async function POST(
  request: Request,
): Promise<Response> {
  // 1. Authenticate --------------------------------------------------------
  const auth = await requireUser();
  if (auth.status) {
    const body: SearchErrorResponse = auth.json;
    return Response.json(body, { status: auth.status });
  }

  // 2. Parse & validate the request body -----------------------------------
  const parsed = await parseJsonBody(request, searchRequestSchema, {
    invalidPayload:
      "Suchanfrage ungültig (query, family_id und mode erforderlich).",
    payloadCode: "INVALID_SEARCH_INPUT",
  });
  if (!parsed.ok) return parsed.response;
  const requestData = parsed.data;

  const serverClient = await createServerClient();
  const recordSearch = () =>
    recordProductEvent(serverClient, {
      userId: auth.user.id,
      familyId: requestData.family_id,
      eventName: "search_completed",
    });

  // 3. Execute the search based on mode ------------------------------------
  try {
    if (requestData.mode === "semantic") {
      // "semantic" mode executes the hybrid content search (facts +
      // semantic + lexical, RRF-fused); the reported mode stays "semantic".
      const results = await hybridSearch(
        serverClient,
        requestData.query,
        requestData.family_id,
      );
      const body: SearchSuccessResponse = { results, mode: "semantic" };
      await recordSearch();
      return Response.json(body, { status: 200 });
    }

    if (requestData.mode === "graph") {
      const results = await graphSearch(
        serverClient,
        requestData.query,
        requestData.family_id,
      );
      const body: SearchSuccessResponse = { results, mode: "graph" };
      await recordSearch();
      return Response.json(body, { status: 200 });
    }

    // mode === "auto": resolve to semantic or graph
    const resolvedMode = await resolveAutoMode(
      serverClient,
      requestData.query,
      requestData.family_id,
    );

    if (resolvedMode === "graph") {
      const results = await graphSearch(
        serverClient,
        requestData.query,
        requestData.family_id,
      );
      const body: SearchSuccessResponse = { results, mode: "graph" };
      await recordSearch();
      return Response.json(body, { status: 200 });
    }

    const results = await hybridSearch(
      serverClient,
      requestData.query,
      requestData.family_id,
    );
    const body: SearchSuccessResponse = { results, mode: "semantic" };
    await recordSearch();
    return Response.json(body, { status: 200 });
  } catch (err) {
    // EmbeddingError from OpenAI failures → 502
    if (err instanceof EmbeddingError) {
      const statusCode =
        err.statusCode &&
        err.statusCode >= 400 &&
        err.statusCode < 500
          ? err.statusCode
          : 502;
      return jsonError(err.message, err.code, statusCode);
    }

    // Generic error → 500
    const message =
      err instanceof Error
        ? err.message
        : "Suche fehlgeschlagen. Bitte erneut versuchen.";
    return jsonError(message, "SEARCH_FAILED", 500);
  }
}

// ---------------------------------------------------------------------------
// Method not allowed
// ---------------------------------------------------------------------------

/**
 * GET /api/search — method not allowed.
 */
export async function GET(): Promise<Response> {
  return methodNotAllowed();
}
