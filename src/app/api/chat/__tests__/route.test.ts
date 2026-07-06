import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase server client.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// Mock the search functions (partial mock — keep types, override functions).
vi.mock("@/lib/ai/search", async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import("@/lib/ai/search");
  return {
    ...actual,
    semanticSearch: vi.fn(),
    graphSearch: vi.fn(),
  };
});

// Mock the chat AI module — override generateChatAnswer (which calls OpenAI),
// but keep combineSearchResults (pure function) and ChatError (class) real.
vi.mock("@/lib/ai/chat", async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import("@/lib/ai/chat");
  return {
    ...actual,
    generateChatAnswer: vi.fn(),
  };
});

import { POST, GET } from "@/app/api/chat/route";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  semanticSearch,
  graphSearch,
  RELEVANCE_THRESHOLD,
} from "@/lib/ai/search";
import { generateChatAnswer, ChatError } from "@/lib/ai/chat";
import { EmbeddingError } from "@/lib/ai/embeddings";
import { NO_RESULTS_FALLBACK } from "@/lib/schemas/chat";
import type { SearchResult } from "@/lib/schemas/search";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FAMILY_ID = "660e8400-e29b-41d4-a716-446655440001";
const DOC_ID_1 = "550e8400-e29b-41d4-a716-446655440000";
const DOC_ID_2 = "550e8400-e29b-41d4-a716-446655440001";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a JSON Request with the given body. */
function createRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Create a JSON Request with the given body and additional headers. */
function createRequestWithHeaders(
  body: unknown,
  extraHeaders: Record<string, string>,
): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
}

/** A valid chat request body. */
function validBody(overrides: Record<string, unknown> = {}) {
  return {
    message: "Zeig mir alle Briefe zur Einschulung von Emma",
    family_id: FAMILY_ID,
    ...overrides,
  };
}

/** Mock the supabase server client to return an authenticated or unauthenticated user. */
function mockServerClient(user: { id: string; email: string } | null) {
  (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
  });
}

/** A semantic search result. */
function semanticResult(
  docId: string,
  title: string,
  chunkText: string,
  score: number,
): SearchResult {
  return {
    document_id: docId,
    title,
    chunk_text: chunkText,
    score,
    source: "semantic",
  };
}

/** A graph person search result. */
function graphPersonResult(
  docId: string,
  title: string,
  personName: string,
  score: number,
): SearchResult {
  return {
    document_id: docId,
    title,
    chunk_text: `Person: ${personName}`,
    score,
    source: "graph:person",
  };
}

// ---------------------------------------------------------------------------
// POST /api/chat
// ---------------------------------------------------------------------------

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authenticated user
    mockServerClient({ id: "user-1", email: "test@ordilo.test" });
    // Default: search returns empty, chat returns a default answer
    (semanticSearch as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (graphSearch as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (generateChatAnswer as ReturnType<typeof vi.fn>).mockResolvedValue(
      "Antwort",
    );
  });

  // --- Authentication (VAL-CHAT-002) ---

  it("returns 401 when unauthenticated", async () => {
    mockServerClient(null);

    const response = await POST(createRequest(validBody()));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe("UNAUTHENTICATED");
    expect(semanticSearch).not.toHaveBeenCalled();
    expect(graphSearch).not.toHaveBeenCalled();
  });

  // --- Zod validation (VAL-CHAT-003) ---

  it("returns 400 when message is missing", async () => {
    const response = await POST(
      createRequest({ family_id: FAMILY_ID }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_CHAT_INPUT");
  });

  it("returns 400 when family_id is missing", async () => {
    const response = await POST(
      createRequest({ message: "test question" }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_CHAT_INPUT");
  });

  it("returns 400 when message is empty", async () => {
    const response = await POST(
      createRequest({ message: "", family_id: FAMILY_ID }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_CHAT_INPUT");
  });

  it("returns 400 when message is whitespace only", async () => {
    const response = await POST(
      createRequest({ message: "   ", family_id: FAMILY_ID }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_CHAT_INPUT");
  });

  it("returns 400 when family_id is not a UUID", async () => {
    const response = await POST(
      createRequest({ message: "test", family_id: "not-a-uuid" }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_CHAT_INPUT");
  });

  it("returns 400 for invalid JSON body", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_JSON");
  });

  // --- Hallucination fallback (VAL-CHAT-005) ---

  it("returns fallback answer with empty sources when no results found", async () => {
    (semanticSearch as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (graphSearch as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const response = await POST(createRequest(validBody()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.answer).toBe(NO_RESULTS_FALLBACK);
    expect(body.sources).toEqual([]);
    // OpenAI should NOT be called when there are no sources
    expect(generateChatAnswer).not.toHaveBeenCalled();
  });

  // --- Relevance threshold filtering (chat-api-fallback-relevance-threshold) ---

  it("returns fallback with empty sources when all semantic matches are below the relevance threshold and graph is empty", async () => {
    // Irrelevant/nonsense query: semantic search still surfaces documents,
    // but all with very low cosine-similarity scores (below RELEVANCE_THRESHOLD).
    // Graph search finds nothing (no person name or task keyword in the query).
    (semanticSearch as ReturnType<typeof vi.fn>).mockResolvedValue([
      semanticResult(DOC_ID_1, "Zufälliges Dokument", "Irrelevant content", 0.12),
      semanticResult(DOC_ID_2, "Anderes Dokument", "More irrelevant text", 0.08),
    ]);
    (graphSearch as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const response = await POST(
      createRequest(validBody({ message: "asdf qwerty xyz" })),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    // The fallback answer must be returned, NOT a synthesized answer
    expect(body.answer).toBe(NO_RESULTS_FALLBACK);
    // The sources array must be EMPTY — the fallback and sources must
    // never be mutually contradictory
    expect(body.sources).toEqual([]);
    // OpenAI must NOT be called — no relevant sources to synthesize from
    expect(generateChatAnswer).not.toHaveBeenCalled();
  });

  it("returns fallback with empty sources when semantic matches are below the threshold even if graph returns sub-threshold results", async () => {
    // Edge case: graph results can have low confidence scores too, but
    // graph:person matches are legitimate (the name was found via
    // word-boundary matching). Here we test the pure semantic-only
    // sub-threshold case where graph is empty.
    (semanticSearch as ReturnType<typeof vi.fn>).mockResolvedValue([
      semanticResult(DOC_ID_1, "Doc", "text", RELEVANCE_THRESHOLD - 0.01),
    ]);
    (graphSearch as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const response = await POST(createRequest(validBody()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.answer).toBe(NO_RESULTS_FALLBACK);
    expect(body.sources).toEqual([]);
    expect(generateChatAnswer).not.toHaveBeenCalled();
  });

  it("returns synthesized cited answer with only above-threshold sources when some semantic results are below the threshold", async () => {
    // A query with at least one above-threshold semantic source: the
    // sub-threshold results must be dropped, but the above-threshold one
    // must be kept and the answer synthesized from it.
    (semanticSearch as ReturnType<typeof vi.fn>).mockResolvedValue([
      semanticResult(DOC_ID_1, "Kita-Brief", "Einschulung am 15. August", 0.85),
      semanticResult(DOC_ID_2, "Zufälliges Dokument", "Irrelevant content", 0.1),
    ]);
    (graphSearch as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (generateChatAnswer as ReturnType<typeof vi.fn>).mockResolvedValue(
      "Laut dem Kita-Brief findet die Einschulung am 15. August statt.",
    );

    const response = await POST(
      createRequest(validBody({ message: "Wann wird Emma eingeschult?" })),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.answer).toBe(
      "Laut dem Kita-Brief findet die Einschulung am 15. August statt.",
    );
    // Only the above-threshold source should be in the response
    expect(body.sources).toHaveLength(1);
    expect(body.sources[0].document_id).toBe(DOC_ID_1);
    expect(body.sources[0].title).toBe("Kita-Brief");
    // The sub-threshold document must NOT appear in sources
    const docIds = body.sources.map(
      (s: { document_id: string }) => s.document_id,
    );
    expect(docIds).not.toContain(DOC_ID_2);
    // OpenAI WAS called (there is at least one relevant source)
    expect(generateChatAnswer).toHaveBeenCalledTimes(1);
  });

  it("never returns the fallback answer together with a non-empty sources array", async () => {
    // Regression guard: the fallback and sources array must never be
    // mutually contradictory. This test verifies the invariant holds
    // when all semantic results are below the threshold.
    (semanticSearch as ReturnType<typeof vi.fn>).mockResolvedValue([
      semanticResult(DOC_ID_1, "Doc", "text", 0.05),
      semanticResult(DOC_ID_2, "Doc 2", "text 2", 0.15),
    ]);
    (graphSearch as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const response = await POST(createRequest(validBody()));
    const body = await response.json();

    // If the answer is the fallback, sources MUST be empty
    if (body.answer === NO_RESULTS_FALLBACK) {
      expect(body.sources).toEqual([]);
    }
    // If sources are non-empty, the answer must NOT be the fallback
    if (body.sources.length > 0) {
      expect(body.answer).not.toBe(NO_RESULTS_FALLBACK);
    }
  });

  // --- Model-emitted fallback reconciliation (chat-api-citation-fallback-hardening) ---

  it("reconciles sources to empty when the model emits the fallback answer with sources present", async () => {
    // Sources exist (above threshold), but the model decides they don't
    // answer the question and emits the fallback. The route must reconcile
    // so the fallback is never returned with a non-empty sources array.
    (semanticSearch as ReturnType<typeof vi.fn>).mockResolvedValue([
      semanticResult(DOC_ID_1, "Kita-Brief", "Einschulung am 15. August", 0.85),
    ]);
    (graphSearch as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (generateChatAnswer as ReturnType<typeof vi.fn>).mockResolvedValue(
      NO_RESULTS_FALLBACK,
    );

    const response = await POST(createRequest(validBody()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.answer).toBe(NO_RESULTS_FALLBACK);
    // Sources MUST be empty — the fallback and sources must never contradict
    expect(body.sources).toEqual([]);
    // OpenAI WAS called (sources existed before reconciliation)
    expect(generateChatAnswer).toHaveBeenCalledTimes(1);
  });

  it("preserves sources when the model emits a normal cited answer", async () => {
    // Normal case: model emits a real answer → sources are preserved.
    (semanticSearch as ReturnType<typeof vi.fn>).mockResolvedValue([
      semanticResult(DOC_ID_1, "Kita-Brief", "Einschulung am 15. August", 0.85),
    ]);
    (graphSearch as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (generateChatAnswer as ReturnType<typeof vi.fn>).mockResolvedValue(
      "Laut dem Kita-Brief findet die Einschulung am 15. August statt.",
    );

    const response = await POST(createRequest(validBody()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.answer).not.toBe(NO_RESULTS_FALLBACK);
    expect(body.sources).toHaveLength(1);
    expect(body.sources[0].document_id).toBe(DOC_ID_1);
  });

  // --- Successful chat with sources (VAL-CHAT-001) ---

  it("returns German answer with sources when results are found", async () => {
    const semantic = [
      semanticResult(DOC_ID_1, "Kita-Brief", "Einschulung am 15. August", 0.85),
    ];
    const graph = [
      graphPersonResult(DOC_ID_1, "Kita-Brief", "Emma", 0.9),
    ];
    (semanticSearch as ReturnType<typeof vi.fn>).mockResolvedValue(semantic);
    (graphSearch as ReturnType<typeof vi.fn>).mockResolvedValue(graph);
    (generateChatAnswer as ReturnType<typeof vi.fn>).mockResolvedValue(
      "Laut dem Kita-Brief wird Emma am 15. August eingeschult.",
    );

    const response = await POST(createRequest(validBody()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.answer).toBe(
      "Laut dem Kita-Brief wird Emma am 15. August eingeschult.",
    );
    expect(body.sources).toHaveLength(1);
    expect(body.sources[0].document_id).toBe(DOC_ID_1);
    expect(body.sources[0].title).toBe("Kita-Brief");
    expect(body.sources[0].excerpt).toBe("Einschulung am 15. August");
    expect(body.sources[0].score).toBe(0.9);
  });

  // --- Combines semantic and graph search (VAL-CHAT-007) ---

  it("calls both semanticSearch and graphSearch", async () => {
    (semanticSearch as ReturnType<typeof vi.fn>).mockResolvedValue([
      semanticResult(DOC_ID_1, "Brief", "Inhalt", 0.8),
    ]);
    (graphSearch as ReturnType<typeof vi.fn>).mockResolvedValue([
      graphPersonResult(DOC_ID_2, "Brief 2", "Emma", 0.9),
    ]);

    await POST(createRequest(validBody()));

    expect(semanticSearch).toHaveBeenCalledTimes(1);
    expect(graphSearch).toHaveBeenCalledTimes(1);
    // Verify family_id and message are passed correctly
    const semanticArgs = (
      semanticSearch as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(semanticArgs[1]).toBe("Zeig mir alle Briefe zur Einschulung von Emma");
    expect(semanticArgs[2]).toBe(FAMILY_ID);
  });

  it("combines sources from both semantic and graph search", async () => {
    (semanticSearch as ReturnType<typeof vi.fn>).mockResolvedValue([
      semanticResult(DOC_ID_1, "Stromrechnung", "Betrag: 45 EUR", 0.8),
    ]);
    (graphSearch as ReturnType<typeof vi.fn>).mockResolvedValue([
      graphPersonResult(DOC_ID_2, "Kita-Brief", "Emma", 0.9),
    ]);

    const response = await POST(createRequest(validBody()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sources).toHaveLength(2);
    const docIds = body.sources.map((s: { document_id: string }) => s.document_id);
    expect(docIds).toContain(DOC_ID_1);
    expect(docIds).toContain(DOC_ID_2);
  });

  it("deduplicates sources when both searches find the same document", async () => {
    (semanticSearch as ReturnType<typeof vi.fn>).mockResolvedValue([
      semanticResult(DOC_ID_1, "Kita-Brief", "Einschulung", 0.85),
    ]);
    (graphSearch as ReturnType<typeof vi.fn>).mockResolvedValue([
      graphPersonResult(DOC_ID_1, "Kita-Brief", "Emma", 0.95),
    ]);

    const response = await POST(createRequest(validBody()));
    const body = await response.json();

    expect(body.sources).toHaveLength(1);
    expect(body.sources[0].document_id).toBe(DOC_ID_1);
    // Should prefer the semantic excerpt
    expect(body.sources[0].excerpt).toBe("Einschulung");
    // Should take the max score
    expect(body.sources[0].score).toBe(0.95);
  });

  // --- Special characters (VAL-CHAT-034) ---

  it("handles umlauts and special characters in the message", async () => {
    (semanticSearch as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (graphSearch as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const response = await POST(
      createRequest({
        message: 'Müller & Söhne "Rechnung" — äöü',
        family_id: FAMILY_ID,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    // No results → fallback (no 500 error from special chars)
    expect(body.answer).toBe(NO_RESULTS_FALLBACK);
  });

  // --- Error handling (VAL-CHAT-011) ---

  it("returns 502 when embedding generation fails (EmbeddingError)", async () => {
    (semanticSearch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new EmbeddingError("OpenAI error", "OPENAI_API_ERROR", 500),
    );

    const response = await POST(createRequest(validBody()));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.code).toBe("OPENAI_API_ERROR");
    expect(body.error).toBeDefined();
  });

  it("returns 502 when embedding auth fails (401 EmbeddingError)", async () => {
    (semanticSearch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new EmbeddingError("Auth failed", "OPENAI_AUTH_ERROR", 401),
    );

    const response = await POST(createRequest(validBody()));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe("OPENAI_AUTH_ERROR");
  });

  it("returns 500 when graph search fails with a generic error", async () => {
    (semanticSearch as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (graphSearch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("DB error"),
    );

    const response = await POST(createRequest(validBody()));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("SEARCH_FAILED");
  });

  it("returns 500 when generateChatAnswer fails (ChatError, no status)", async () => {
    (semanticSearch as ReturnType<typeof vi.fn>).mockResolvedValue([
      semanticResult(DOC_ID_1, "Brief", "Inhalt", 0.9),
    ]);
    (graphSearch as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (generateChatAnswer as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ChatError("Chat failed", "OPENAI_API_ERROR", 500),
    );

    const response = await POST(createRequest(validBody()));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("OPENAI_API_ERROR");
  });

  it("returns 401 when OpenAI auth fails (ChatError 401)", async () => {
    (semanticSearch as ReturnType<typeof vi.fn>).mockResolvedValue([
      semanticResult(DOC_ID_1, "Brief", "Inhalt", 0.9),
    ]);
    (graphSearch as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (generateChatAnswer as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ChatError("Auth failed", "OPENAI_AUTH_ERROR", 401),
    );

    const response = await POST(createRequest(validBody()));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe("OPENAI_AUTH_ERROR");
  });

  it("returns 429 when OpenAI rate limit (ChatError 429)", async () => {
    (semanticSearch as ReturnType<typeof vi.fn>).mockResolvedValue([
      semanticResult(DOC_ID_1, "Brief", "Inhalt", 0.9),
    ]);
    (graphSearch as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (generateChatAnswer as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ChatError("Rate limited", "OPENAI_RATE_LIMITED", 429),
    );

    const response = await POST(createRequest(validBody()));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.code).toBe("OPENAI_RATE_LIMITED");
  });

  it("returns 500 with structured error for unexpected errors", async () => {
    (semanticSearch as ReturnType<typeof vi.fn>).mockResolvedValue([
      semanticResult(DOC_ID_1, "Brief", "Inhalt", 0.9),
    ]);
    (graphSearch as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (generateChatAnswer as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Unexpected error"),
    );

    const response = await POST(createRequest(validBody()));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("CHAT_FAILED");
    expect(body.error).toBeDefined();
  });

  it("does not expose the OpenAI API key in the response", async () => {
    (semanticSearch as ReturnType<typeof vi.fn>).mockResolvedValue([
      semanticResult(DOC_ID_1, "Brief", "Inhalt", 0.9),
    ]);
    (graphSearch as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (generateChatAnswer as ReturnType<typeof vi.fn>).mockResolvedValue(
      "Antwort",
    );

    const response = await POST(createRequest(validBody()));
    const body = await response.json();
    const bodyStr = JSON.stringify(body);

    expect(bodyStr).not.toContain("OPENAI_API_KEY");
    expect(bodyStr).not.toContain("api_key");
    expect(bodyStr).not.toContain("sk-");
  });

  // --- Dev-only fault injection (VAL-CHAT-011) ---

  it("returns 500 with structured error when dev fault-injection header is present (non-production)", async () => {
    // NODE_ENV in the test environment is 'test' (not 'production'),
    // so the fault injection hook should be active.
    vi.stubEnv("NODE_ENV", "test");

    try {
      const response = await POST(
        createRequestWithHeaders(validBody(), {
          "x-dev-simulate-failure": "chat",
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toBeDefined();
      expect(body.code).toBe("OPENAI_API_ERROR");
      // The search and chat functions should NOT have been called —
      // the fault injection short-circuits before them.
      expect(semanticSearch).not.toHaveBeenCalled();
      expect(graphSearch).not.toHaveBeenCalled();
      expect(generateChatAnswer).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("ignores the fault-injection header in production (no-op)", async () => {
    vi.stubEnv("NODE_ENV", "production");

    try {
      // In production, the header must be ignored. The route proceeds
      // normally (search + chat). With empty search results, the fallback
      // is returned.
      (semanticSearch as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (graphSearch as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const response = await POST(
        createRequestWithHeaders(validBody(), {
          "x-dev-simulate-failure": "chat",
        }),
      );
      const body = await response.json();

      // Should NOT be a 500 — the header is ignored in production.
      expect(response.status).toBe(200);
      expect(body.answer).toBe(NO_RESULTS_FALLBACK);
      expect(body.sources).toEqual([]);
      // Search functions SHOULD have been called (fault injection was
      // a no-op in production).
      expect(semanticSearch).toHaveBeenCalledTimes(1);
      expect(graphSearch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("does not trigger fault injection without the header (non-production)", async () => {
    vi.stubEnv("NODE_ENV", "test");

    try {
      (semanticSearch as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (graphSearch as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const response = await POST(createRequest(validBody()));
      const body = await response.json();

      // No header → normal flow (fallback for empty results).
      expect(response.status).toBe(200);
      expect(body.answer).toBe(NO_RESULTS_FALLBACK);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("does not trigger fault injection before Zod validation (unauthenticated requests still get 401)", async () => {
    // The fault injection hook is placed AFTER auth and Zod validation.
    // An unauthenticated request with the fault-injection header should
    // still get 401, not 500.
    mockServerClient(null);

    const response = await POST(
      createRequestWithHeaders(validBody(), {
        "x-dev-simulate-failure": "chat",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe("UNAUTHENTICATED");
  });

  it("does not trigger fault injection for invalid input (Zod validation still returns 400)", async () => {
    // The fault injection hook is placed AFTER Zod validation.
    // An invalid request with the fault-injection header should still
    // get 400, not 500.
    const response = await POST(
      createRequestWithHeaders(
        { message: "", family_id: FAMILY_ID },
        { "x-dev-simulate-failure": "chat" },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_CHAT_INPUT");
  });

  // --- Method not allowed ---

  it("GET returns 405", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(405);
    expect(body.code).toBe("METHOD_NOT_ALLOWED");
  });
});
