import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { EmbeddingError } from "@/lib/ai/embeddings";
import { semanticSearch, graphSearch } from "@/lib/ai/search";
import {
  generateChatAnswer,
  combineSearchResults,
  filterByRelevanceThreshold,
  reconcileFallbackSources,
  ChatError,
} from "@/lib/ai/chat";
import {
  chatRequestSchema,
  NO_RESULTS_FALLBACK,
  type ChatRequest,
  type ChatSuccessResponse,
  type ChatErrorResponse,
} from "@/lib/schemas/chat";

/**
 * POST /api/chat
 *
 * Chat API that combines semantic + graph search results into context,
 * calls OpenAI GPT-4.1 Mini to synthesize a German natural-language answer
 * with source citations, and returns the answer plus source documents.
 *
 * Input: { message, family_id }
 *
 * Flow:
 *   1. Authenticate (401 without session — VAL-CHAT-002)
 *   2. Validate input with Zod (400 on missing message/family_id —
 *      VAL-CHAT-003)
 *   3. Run BOTH semantic AND graph search (always — VAL-CHAT-007)
 *   4. Filter semantic results by relevance threshold (drop sub-threshold
 *      noise), then combine into deduplicated ChatSource[] (one per document)
 *   5. If no sources found → return fallback "Ich finde dazu kein Dokument."
 *      with empty sources array (VAL-CHAT-005). OpenAI is NOT called in
 *      this case, saving cost and guaranteeing the exact fallback string.
 *      The relevance threshold ensures the fallback and sources array are
 *      never mutually contradictory (no fallback with non-empty sources).
 *   6. Call OpenAI GPT-4.1 Mini with system prompt (German answers, source
 *      citation, no hedging, hallucination protection) + user message
 *      (query + context) (VAL-CHAT-010)
 *   7. Return { answer, sources }
 *
 * Sources only include confirmed documents (the search functions filter
 * documents.status = 'confirmed') — VAL-CHAT-031.
 * RLS: All queries use the server client (RLS-scoped), so a user only sees
 *   results from their own family — VAL-CHAT-030.
 * API key: OPENAI_API_KEY is read from server-only env and never exposed
 *   to the client — VAL-CHAT-010.
 *
 * Error handling (VAL-CHAT-011):
 *   - EmbeddingError (OpenAI embeddings failure) → 502 with structured error
 *   - ChatError (OpenAI chat failure) → appropriate status with structured error
 *   - Generic error → 500 with structured German-friendly error
 */

export async function POST(
  request: Request,
): Promise<Response> {
  // 1. Authenticate --------------------------------------------------------
  const auth = await requireUser();
  if (auth.status) {
    const body: ChatErrorResponse = auth.json;
    return Response.json(body, { status: auth.status });
  }

  // 2. Parse & validate the request body -----------------------------------
  let parsed: ChatRequest;
  try {
    const json = await request.json();
    const result = chatRequestSchema.safeParse(json);
    if (!result.success) {
      const body: ChatErrorResponse = {
        error: "Anfrage ungültig (message und family_id erforderlich).",
        code: "INVALID_CHAT_INPUT",
      };
      return Response.json(body, { status: 400 });
    }
    parsed = result.data;
  } catch {
    const body: ChatErrorResponse = {
      error: "Anfrage konnte nicht gelesen werden.",
      code: "INVALID_JSON",
    };
    return Response.json(body, { status: 400 });
  }

  const serverClient = await createServerClient();

  // Dev-only fault injection for testing the chat provider-failure path
  // (VAL-CHAT-011). In production, this header is always ignored (no-op).
  // When triggered, the route returns the same structured error shape a
  // real OpenAI failure produces, so validators can exercise the client
  // error-rendering path end-to-end without touching real credentials.
  if (
    process.env.NODE_ENV !== "production" &&
    request.headers.get("x-dev-simulate-failure") === "chat"
  ) {
    const body: ChatErrorResponse = {
      error: "OpenAI: API-Fehler (Simulierter Ausfall).",
      code: "OPENAI_API_ERROR",
    };
    return Response.json(body, { status: 500 });
  }

  // 3. Run both semantic AND graph search ----------------------------------
  // VAL-CHAT-007: the chat always combines both search types.
  let semanticResults, graphResults;
  try {
    [semanticResults, graphResults] = await Promise.all([
      semanticSearch(serverClient, parsed.message, parsed.family_id),
      graphSearch(serverClient, parsed.message, parsed.family_id),
    ]);
  } catch (err) {
    // EmbeddingError from OpenAI embeddings failure → 502
    if (err instanceof EmbeddingError) {
      const statusCode =
        err.statusCode &&
        err.statusCode >= 400 &&
        err.statusCode < 500
          ? err.statusCode
          : 502;
      const body: ChatErrorResponse = { error: err.message, code: err.code };
      return Response.json(body, { status: statusCode });
    }

    // Generic search error → 500
    const message =
      err instanceof Error
        ? err.message
        : "Suche fehlgeschlagen. Bitte erneut versuchen.";
    const body: ChatErrorResponse = { error: message, code: "SEARCH_FAILED" };
    return Response.json(body, { status: 500 });
  }

  // 4. Combine results into deduplicated sources ---------------------------
  // Filter semantic results by the relevance threshold so that low-relevance
  // documents (below RELEVANCE_THRESHOLD) are dropped before assembling chat
  // context. This prevents the fallback answer from being returned together
  // with a non-empty sources array when semantic search surfaces noise for
  // nonsense/irrelevant queries (chat-api-fallback-relevance-threshold).
  // Graph results are NOT filtered — they are inherently relevant (matched
  // via word-boundary name/keyword matching).
  const relevantSemantic = filterByRelevanceThreshold(semanticResults);
  const sources = combineSearchResults(relevantSemantic, graphResults);

  // 5. Hallucination fallback: no sources → return fallback (VAL-CHAT-005) -
  if (sources.length === 0) {
    const body: ChatSuccessResponse = {
      answer: NO_RESULTS_FALLBACK,
      sources: [],
    };
    return Response.json(body, { status: 200 });
  }

  // 6. Call OpenAI GPT-4.1 Mini to generate the answer --------------------
  try {
    const answer = await generateChatAnswer(parsed.message, sources);
    // Reconcile: if the model emitted the fallback answer (the sources
    // don't answer the question), empty the sources array so the fallback
    // is never returned together with non-empty sources. The two outputs
    // must never contradict each other (chat-api-citation-fallback-hardening).
    const reconciledSources = reconcileFallbackSources(answer, sources);
    const body: ChatSuccessResponse = { answer, sources: reconciledSources };
    return Response.json(body, { status: 200 });
  } catch (err) {
    // ChatError from OpenAI chat completion failure
    if (err instanceof ChatError) {
      const statusCode =
        err.statusCode &&
        err.statusCode >= 400 &&
        err.statusCode < 500
          ? err.statusCode
          : 500;
      const body: ChatErrorResponse = { error: err.message, code: err.code };
      return Response.json(body, { status: statusCode });
    }

    // Generic error → 500
    const message =
      err instanceof Error
        ? err.message
        : "Chat fehlgeschlagen. Bitte erneut versuchen.";
    const body: ChatErrorResponse = { error: message, code: "CHAT_FAILED" };
    return Response.json(body, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Method not allowed
// ---------------------------------------------------------------------------

/**
 * GET /api/chat — method not allowed.
 */
export async function GET(): Promise<Response> {
  const body: ChatErrorResponse = {
    error: "Methode nicht erlaubt. Bitte POST verwenden.",
    code: "METHOD_NOT_ALLOWED",
  };
  return Response.json(body, { status: 405 });
}
