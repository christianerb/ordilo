import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { EmbeddingError } from "@/lib/ai/embeddings";
import {
  searchRequestSchema,
  type SearchRequest,
  type SearchSuccessResponse,
  type SearchErrorResponse,
} from "@/lib/schemas/search";
import {
  semanticSearch,
  graphSearch,
  resolveAutoMode,
} from "@/lib/ai/search";

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
  let parsed: SearchRequest;
  try {
    const json = await request.json();
    const result = searchRequestSchema.safeParse(json);
    if (!result.success) {
      const body: SearchErrorResponse = {
        error: "Suchanfrage ungültig (query, family_id und mode erforderlich).",
        code: "INVALID_SEARCH_INPUT",
      };
      return Response.json(body, { status: 400 });
    }
    parsed = result.data;
  } catch {
    const body: SearchErrorResponse = {
      error: "Anfrage konnte nicht gelesen werden.",
      code: "INVALID_JSON",
    };
    return Response.json(body, { status: 400 });
  }

  const serverClient = await createServerClient();

  // 3. Execute the search based on mode ------------------------------------
  try {
    if (parsed.mode === "semantic") {
      const results = await semanticSearch(
        serverClient,
        parsed.query,
        parsed.family_id,
      );
      const body: SearchSuccessResponse = { results, mode: "semantic" };
      return Response.json(body, { status: 200 });
    }

    if (parsed.mode === "graph") {
      const results = await graphSearch(
        serverClient,
        parsed.query,
        parsed.family_id,
      );
      const body: SearchSuccessResponse = { results, mode: "graph" };
      return Response.json(body, { status: 200 });
    }

    // mode === "auto": resolve to semantic or graph
    const resolvedMode = await resolveAutoMode(
      serverClient,
      parsed.query,
      parsed.family_id,
    );

    if (resolvedMode === "graph") {
      const results = await graphSearch(
        serverClient,
        parsed.query,
        parsed.family_id,
      );
      const body: SearchSuccessResponse = { results, mode: "graph" };
      return Response.json(body, { status: 200 });
    }

    const results = await semanticSearch(
      serverClient,
      parsed.query,
      parsed.family_id,
    );
    const body: SearchSuccessResponse = { results, mode: "semantic" };
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
      const body: SearchErrorResponse = { error: err.message, code: err.code };
      return Response.json(body, { status: statusCode });
    }

    // Generic error → 500
    const message =
      err instanceof Error
        ? err.message
        : "Suche fehlgeschlagen. Bitte erneut versuchen.";
    const body: SearchErrorResponse = { error: message, code: "SEARCH_FAILED" };
    return Response.json(body, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Method not allowed
// ---------------------------------------------------------------------------

/**
 * GET /api/search — method not allowed.
 */
export async function GET(): Promise<Response> {
  const body: SearchErrorResponse = {
    error: "Methode nicht erlaubt. Bitte POST verwenden.",
    code: "METHOD_NOT_ALLOWED",
  };
  return Response.json(body, { status: 405 });
}
