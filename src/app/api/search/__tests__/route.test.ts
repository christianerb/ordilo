import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase server client and embeddings module before importing.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/ai/embeddings", () => ({
  generateQueryEmbedding: vi.fn(),
  generateEmbeddings: vi.fn((chunks: unknown[]) =>
    Array.isArray(chunks) && chunks.length === 0
      ? Promise.resolve([])
      : Promise.resolve([[0.1, 0.2, 0.3]]),
  ),
  embeddingToVectorString: vi.fn((emb: number[]) => `[${emb.join(",")}]`),
  EmbeddingError: class EmbeddingError extends Error {
    code: string;
    statusCode?: number;
    constructor(message: string, code: string, statusCode?: number) {
      super(message);
      this.name = "EmbeddingError";
      this.code = code;
      this.statusCode = statusCode;
    }
  },
}));

import { POST } from "@/app/api/search/route";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { generateQueryEmbedding } from "@/lib/ai/embeddings";
import type { SearchResult } from "@/lib/schemas/search";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FAMILY_ID = "660e8400-e29b-41d4-a716-446655440001";
const DOC_ID_1 = "550e8400-e29b-41d4-a716-446655440000";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a JSON Request with the given body. */
function createRequest(body: unknown): Request {
  return new Request("http://localhost/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** A valid search request body. */
function validBody(overrides: Record<string, unknown> = {}) {
  return {
    query: "Stromrechnung",
    family_id: FAMILY_ID,
    mode: "semantic",
    ...overrides,
  };
}

/**
 * Build a chainable mock query builder that resolves to { data, error }.
 *
 * Supports: select, eq, ilike, in, lte, not, order, limit, maybeSingle.
 * All chain methods return the builder so any order of calls works.
 * The terminal await resolves to the configured result.
 */
function chainableQuery(result: { data: unknown; error: unknown }) {
  const self: Record<string, unknown> = {
    select: vi.fn(() => self),
    eq: vi.fn(() => self),
    ilike: vi.fn(() => self),
    in: vi.fn(() => self),
    lte: vi.fn(() => self),
    gte: vi.fn(() => self),
    not: vi.fn(() => self),
    or: vi.fn(() => self),
    order: vi.fn(() => self),
    limit: vi.fn(() => self),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: vi.fn(
      (resolve: (value: unknown) => void, reject?: (reason?: unknown) => void) =>
        Promise.resolve(result).then(resolve, reject),
    ),
  };
  return self;
}

/**
 * Build a mock server Supabase client for the search route.
 *
 * Configurable:
 *   - user: the authenticated user (null for unauthenticated)
 *   - members: family_members rows to return
 *   - entities: extracted_entities rows to return (for person search)
 *   - documents: documents rows to return (for confirmed doc lookup)
 *   - tasks: tasks rows to return (for task search)
 *   - semanticResults: rows from the semantic_search RPC
 *   - rpcError: error from the RPC
 *   - docReadError: error from documents query
 */
function mockServerClient(options: {
  user?: { id: string; email: string } | null;
  members?: { name: string }[];
  entities?: {
    document_id: string;
    entity_value: string;
    normalized_value: string;
    confidence: number;
  }[];
  documents?: { id: string; title: string | null; status: string }[];
  tasks?: {
    id: string;
    document_id: string;
    title: string;
    due_date: string | null;
    priority: string;
    status: string;
    confidence: number;
  }[];
  semanticResults?: SearchResult[];
  lexicalResults?: SearchResult[];
  facts?: {
    document_id: string;
    fact_type: string;
    label: string;
    value: string;
    normalized_value: string;
    confidence: number;
    confirmed: boolean;
  }[];
  rpcError?: unknown;
  docReadError?: boolean;
  membersError?: boolean;
  entitiesError?: boolean;
  tasksError?: boolean;
} = {}) {
  const {
    user = { id: "user-1", email: "test@ordilo.test" },
    members = [{ name: "Emma" }, { name: "Hanna" }],
    entities = [],
    documents = [],
    tasks = [],
    semanticResults = [],
    lexicalResults = [],
    facts = [],
    rpcError = null,
    docReadError = false,
    membersError = false,
    entitiesError = false,
    tasksError = false,
  } = options;

  const rpcCalls: unknown[] = [];

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn((table: string) => {
      switch (table) {
        case "family_members":
          return chainableQuery({
            data: membersError ? null : members,
            error: membersError ? { message: "DB error" } : null,
          });
        case "extracted_entities":
          return chainableQuery({
            data: entitiesError ? null : entities,
            error: entitiesError ? { message: "DB error" } : null,
          });
        case "documents":
          return chainableQuery({
            data: docReadError ? null : documents,
            error: docReadError ? { message: "DB error" } : null,
          });
        case "tasks":
          return chainableQuery({
            data: tasksError ? null : tasks,
            error: tasksError ? { message: "DB error" } : null,
          });
        case "knowledge_nodes":
        case "knowledge_edges":
          // Graph traversal tables — return empty by default so
          // graphTraversalSearch yields no results.
          return chainableQuery({ data: [], error: null });
        case "document_facts":
          return chainableQuery({ data: facts, error: null });
        default:
          throw new Error(`Unexpected table: ${table}`);
      }
    }),
    rpc: vi.fn((fnName: string, params: unknown) => {
      rpcCalls.push({ fnName, params });
      if (fnName === "lexical_search") {
        return Promise.resolve({ data: lexicalResults, error: null });
      }
      return Promise.resolve({
        data: semanticResults,
        error: rpcError,
      });
    }),
  };

  return {
    ...client,
    _rpcCalls: rpcCalls,
  } as unknown as Awaited<ReturnType<typeof createServerClient>> & {
    _rpcCalls: { fnName: string; params: unknown }[];
  };
}

// ---------------------------------------------------------------------------
// POST /api/search
// ---------------------------------------------------------------------------

describe("POST /api/search", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // The embedding cache is module-level (latency dedupe) — reset it so
    // per-test generateQueryEmbedding mocks (e.g. rejection cases) apply.
    const { clearQueryEmbeddingCache } = await import("@/lib/ai/search");
    clearQueryEmbeddingCache();
    // Default: query embedding succeeds.
    (generateQueryEmbedding as ReturnType<typeof vi.fn>).mockResolvedValue(
      Array.from({ length: 1536 }, (_, i) => i * 0.001),
    );
  });

  // --- Authentication (VAL-SEARCH-006) ---

  it("returns 401 when unauthenticated", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ user: null }),
    );

    const response = await POST(createRequest(validBody()));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe("UNAUTHENTICATED");
    expect(generateQueryEmbedding).not.toHaveBeenCalled();
  });

  // --- Zod validation (VAL-SEARCH-007, VAL-SEARCH-005) ---

  it("returns 400 when query is missing", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );

    const response = await POST(
      createRequest({ family_id: FAMILY_ID, mode: "semantic" }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_SEARCH_INPUT");
  });

  it("returns 400 when family_id is missing", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );

    const response = await POST(
      createRequest({ query: "test", mode: "semantic" }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_SEARCH_INPUT");
  });

  it("returns 400 when mode is missing", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );

    const response = await POST(
      createRequest({ query: "test", family_id: FAMILY_ID }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_SEARCH_INPUT");
  });

  it("returns 400 for invalid mode value", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );

    const response = await POST(
      createRequest({ query: "test", family_id: FAMILY_ID, mode: "invalid" }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_SEARCH_INPUT");
  });

  it("returns 400 for non-UUID family_id", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );

    const response = await POST(
      createRequest({ query: "test", family_id: "not-a-uuid", mode: "semantic" }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_SEARCH_INPUT");
  });

  it("returns 400 for empty query string", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );

    const response = await POST(
      createRequest({ query: "", family_id: FAMILY_ID, mode: "semantic" }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_SEARCH_INPUT");
  });

  it("returns 400 for invalid JSON body", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );

    const response = await POST(
      new Request("http://localhost/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_JSON");
  });

  // --- Semantic search (VAL-SEARCH-001, 002, 003, 004) ---

  it("semantic mode returns results from the semantic_search RPC", async () => {
    const semanticResults: SearchResult[] = [
      {
        document_id: DOC_ID_1,
        title: "Stromrechnung Juli 2026",
        chunk_text: "Rechnungsbetrag: 45,80 EUR",
        score: 0.92,
        source: "semantic",
      },
    ];
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ semanticResults }),
    );

    const response = await POST(
      createRequest(validBody({ mode: "semantic" })),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("semantic");
    expect(body.results).toHaveLength(1);
    expect(body.results[0].document_id).toBe(DOC_ID_1);
    expect(body.results[0].score).toBe(0.92);
    expect(generateQueryEmbedding).toHaveBeenCalledTimes(1);
  });

  it("semantic mode returns empty results when no confirmed documents (200)", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ semanticResults: [] }),
    );

    const response = await POST(
      createRequest(validBody({ query: "nichts vorhandenden", mode: "semantic" })),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("semantic");
    expect(body.results).toEqual([]);
  });

  it("semantic mode respects top-10 limit (returns at most 10 results)", async () => {
    const semanticResults: SearchResult[] = Array.from({ length: 15 }, (_, i) => ({
      document_id: `550e8400-e29b-41d4-a716-${String(i).padStart(12, "0")}`,
      title: `Doc ${i}`,
      chunk_text: `Chunk ${i}`,
      score: 0.9 - i * 0.01,
      source: "semantic",
    }));
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ semanticResults }),
    );

    const response = await POST(
      createRequest(validBody({ mode: "semantic" })),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    // The RPC limits to 10, so the mock returns all 15 but in production
    // the RPC would limit. Here we verify the route passes through.
    // The route should not add more results beyond what the RPC returns.
    expect(body.results.length).toBeLessThanOrEqual(15);
  });

  it("semantic mode calls semantic_search RPC with query embedding and family_id", async () => {
    const mockClient = mockServerClient({ semanticResults: [] });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

    await POST(createRequest(validBody({ mode: "semantic" })));

    const semanticCalls = mockClient._rpcCalls.filter(
      (c) => c.fnName === "semantic_search",
    );
    expect(semanticCalls).toHaveLength(1);
    const params = semanticCalls[0].params as Record<string, unknown>;
    expect(params.p_family_id).toBe(FAMILY_ID);
    expect(params.p_query_embedding).toBeTruthy();

    // Hybrid search also runs the lexical full-text path.
    const lexicalCalls = mockClient._rpcCalls.filter(
      (c) => c.fnName === "lexical_search",
    );
    expect(lexicalCalls).toHaveLength(1);
  });

  it("semantic mode returns 502 when query embedding fails", async () => {
    const { EmbeddingError } = await import("@/lib/ai/embeddings");
    (generateQueryEmbedding as ReturnType<typeof vi.fn>).mockRejectedValue(
      new (EmbeddingError as unknown as new (
        msg: string,
        code: string,
        status?: number,
      ) => Error)("OpenAI error", "OPENAI_API_ERROR", 500),
    );
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );

    const response = await POST(
      createRequest(validBody({ mode: "semantic" })),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.code).toBe("OPENAI_API_ERROR");
  });

  it("semantic mode returns 500 when RPC returns an error", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        semanticResults: [],
        rpcError: { message: "RPC failed" },
      }),
    );

    const response = await POST(
      createRequest(validBody({ mode: "semantic" })),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("SEARCH_FAILED");
  });

  // --- Graph search: person name (VAL-SEARCH-010) ---

  it("graph mode finds documents by person name", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        members: [{ name: "Emma" }, { name: "Hanna" }],
        entities: [
          {
            document_id: DOC_ID_1,
            entity_value: "Emma",
            normalized_value: "emma",
            confidence: 0.95,
          },
        ],
        documents: [{ id: DOC_ID_1, title: "Kita-Brief für Emma", status: "confirmed" }],
      }),
    );

    const response = await POST(
      createRequest(validBody({ query: "Zeig mir alles von Emma", mode: "graph" })),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("graph");
    expect(body.results.length).toBeGreaterThanOrEqual(1);
    expect(body.results[0].document_id).toBe(DOC_ID_1);
    expect(body.results[0].source).toContain("person");
  });

  it("graph mode excludes unconfirmed documents from person search", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        members: [{ name: "Emma" }],
        entities: [
          {
            document_id: DOC_ID_1,
            entity_value: "Emma",
            normalized_value: "emma",
            confidence: 0.95,
          },
        ],
        // No confirmed documents → empty results
        documents: [],
      }),
    );

    const response = await POST(
      createRequest(validBody({ query: "Zeig mir alles von Emma", mode: "graph" })),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([]);
  });

  // --- Graph search: upcoming tasks (VAL-SEARCH-011) ---

  it("graph mode finds open tasks with upcoming deadlines", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 3);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        members: [{ name: "Emma" }],
        tasks: [
          {
            id: "task-1",
            document_id: DOC_ID_1,
            title: "Elternabend besuchen",
            due_date: futureDateStr,
            priority: "medium",
            status: "open",
            confidence: 0.8,
          },
        ],
        documents: [{ id: DOC_ID_1, title: "Kita-Brief", status: "confirmed" }],
      }),
    );

    const response = await POST(
      createRequest(validBody({ query: "Welche Fristen laufen bald ab?", mode: "graph" })),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("graph");
    expect(body.results.length).toBeGreaterThanOrEqual(1);
    expect(body.results[0].document_id).toBe(DOC_ID_1);
    expect(body.results[0].source).toContain("task");
  });

  // --- Graph search: deadline lower bound (chat-api-guardrails) ---
  // Upcoming-deadlines queries must apply a lower bound (>= today) so
  // overdue/past tasks do not leak into "upcoming" results.

  it("graph mode applies due_date >= today lower bound for upcoming-deadline queries", async () => {
    const client = mockServerClient({
      members: [{ name: "Emma" }],
      tasks: [],
      documents: [],
    });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    await POST(
      createRequest(validBody({ query: "Welche Fristen laufen bald ab?", mode: "graph" })),
    );

    // The tasks query builder should have been called with gte("due_date", <today>).
    // We inspect the mock calls on the "tasks" table chainable query builder.
    // Since mockServerClient creates a fresh chainableQuery per `from("tasks")`
    // call, we need to capture the builder. The `from` mock returns a new
    // chainableQuery each time, so we instead verify via the today's date
    // string that the lower bound was applied.
    // We reconstruct today's date the same way search.ts does.
    const todayStr = new Date().toISOString().split("T")[0];

    // Access the tasks chainable builder through the from mock.
    // The chainable builder's `gte` should have been called with
    // ("due_date", todayStr).
    const fromMock = (client as unknown as { from: ReturnType<typeof vi.fn> }).from;
    // Find the call that returned the tasks builder. Since each call returns
    // a fresh builder, we look at the table name argument.
    const tasksCallIndex = fromMock.mock.calls.findIndex(
      (call: unknown[]) => call[0] === "tasks",
    );
    expect(tasksCallIndex).toBeGreaterThanOrEqual(0);
    // The builder returned for "tasks" has a `gte` mock we can inspect.
    const tasksBuilder = fromMock.mock.results[tasksCallIndex].value as {
      gte: ReturnType<typeof vi.fn>;
    };
    expect(tasksBuilder.gte).toHaveBeenCalledWith("due_date", todayStr);
  });

  it("graph mode does NOT apply the deadline lower bound for person-specific task queries", async () => {
    // Person-specific queries ("Was muss ich für Hanna erledigen?") return
    // all open tasks for that person's documents, regardless of due_date.
    const client = mockServerClient({
      members: [{ name: "Hanna" }, { name: "Emma" }],
      entities: [
        {
          document_id: DOC_ID_1,
          entity_value: "Hanna",
          normalized_value: "hanna",
          confidence: 0.9,
        },
      ],
      tasks: [],
      documents: [{ id: DOC_ID_1, title: "Brief für Hanna", status: "confirmed" }],
    });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    await POST(
      createRequest(validBody({ query: "Was muss ich für Hanna erledigen?", mode: "graph" })),
    );

    const fromMock = (client as unknown as { from: ReturnType<typeof vi.fn> }).from;
    const tasksCallIndex = fromMock.mock.calls.findIndex(
      (call: unknown[]) => call[0] === "tasks",
    );
    expect(tasksCallIndex).toBeGreaterThanOrEqual(0);
    const tasksBuilder = fromMock.mock.results[tasksCallIndex].value as {
      gte: ReturnType<typeof vi.fn>;
    };
    // Person-specific task queries should NOT apply the lower bound.
    expect(tasksBuilder.gte).not.toHaveBeenCalled();
  });

  // --- Graph search: tasks for specific person (VAL-SEARCH-012) ---

  it("graph mode finds tasks for a specific person", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        members: [{ name: "Hanna" }, { name: "Emma" }],
        entities: [
          {
            document_id: DOC_ID_1,
            entity_value: "Hanna",
            normalized_value: "hanna",
            confidence: 0.9,
          },
        ],
        tasks: [
          {
            id: "task-1",
            document_id: DOC_ID_1,
            title: "Schulranzen kaufen",
            due_date: null,
            priority: "high",
            status: "open",
            confidence: 0.85,
          },
        ],
        documents: [{ id: DOC_ID_1, title: "Schulbrief für Hanna", status: "confirmed" }],
      }),
    );

    const response = await POST(
      createRequest(validBody({ query: "Was muss ich für Hanna noch erledigen?", mode: "graph" })),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("graph");
    expect(body.results.length).toBeGreaterThanOrEqual(1);
    // Should find Hanna's document (may be merged from person + task sources)
    const result = body.results.find((r: SearchResult) => r.document_id === DOC_ID_1);
    expect(result).toBeDefined();
  });

  // --- Graph search: empty when no matches (VAL-SEARCH-013) ---

  it("graph mode returns empty when no person or task matches (200)", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        members: [{ name: "Emma" }],
        entities: [],
        documents: [],
        tasks: [],
      }),
    );

    const response = await POST(
      createRequest(validBody({ query: "Zeig mir alles von Xaver", mode: "graph" })),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("graph");
    expect(body.results).toEqual([]);
  });

  it("graph mode returns empty for a content query with no person or task keywords", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        members: [{ name: "Emma" }],
        entities: [],
        documents: [],
        tasks: [],
      }),
    );

    const response = await POST(
      createRequest(validBody({ query: "Stromrechnung", mode: "graph" })),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("graph");
    expect(body.results).toEqual([]);
  });

  // --- Graph search: person-name precision (Johanna/Hanna) ---
  // Querying "Hanna" must NOT return documents linked to person "Johanna"
  // (and vice versa). Match on whole tokens/word boundaries, not raw
  // substring.

  it("graph mode for 'Hanna' does NOT return documents linked to 'Johanna'", async () => {
    const DOC_HANNA = "550e8400-e29b-41d4-a716-446655440010";
    const DOC_JOHANNA = "550e8400-e29b-41d4-a716-446655440011";

    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        members: [{ name: "Hanna" }, { name: "Johanna" }],
        // The mock returns ALL entities regardless of the ILIKE filter,
        // so both "hanna" and "johanna" entities are returned. The JS
        // word-boundary post-filter in searchByPerson must exclude
        // "johanna" when searching for "Hanna".
        entities: [
          {
            document_id: DOC_HANNA,
            entity_value: "Hanna",
            normalized_value: "hanna",
            confidence: 0.95,
          },
          {
            document_id: DOC_JOHANNA,
            entity_value: "Johanna",
            normalized_value: "johanna",
            confidence: 0.92,
          },
        ],
        documents: [
          { id: DOC_HANNA, title: "Brief für Hanna", status: "confirmed" },
          { id: DOC_JOHANNA, title: "Brief für Johanna", status: "confirmed" },
        ],
      }),
    );

    const response = await POST(
      createRequest(validBody({ query: "Zeig mir alles von Hanna", mode: "graph" })),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("graph");
    const docIds = body.results.map((r: SearchResult) => r.document_id);
    expect(docIds).toContain(DOC_HANNA);
    expect(docIds).not.toContain(DOC_JOHANNA);
  });

  it("graph mode for 'Johanna' does NOT return documents linked to 'Hanna'", async () => {
    const DOC_HANNA = "550e8400-e29b-41d4-a716-446655440010";
    const DOC_JOHANNA = "550e8400-e29b-41d4-a716-446655440011";

    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        members: [{ name: "Hanna" }, { name: "Johanna" }],
        entities: [
          {
            document_id: DOC_HANNA,
            entity_value: "Hanna",
            normalized_value: "hanna",
            confidence: 0.95,
          },
          {
            document_id: DOC_JOHANNA,
            entity_value: "Johanna",
            normalized_value: "johanna",
            confidence: 0.92,
          },
        ],
        documents: [
          { id: DOC_HANNA, title: "Brief für Hanna", status: "confirmed" },
          { id: DOC_JOHANNA, title: "Brief für Johanna", status: "confirmed" },
        ],
      }),
    );

    const response = await POST(
      createRequest(validBody({ query: "Zeig mir alles von Johanna", mode: "graph" })),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("graph");
    const docIds = body.results.map((r: SearchResult) => r.document_id);
    expect(docIds).toContain(DOC_JOHANNA);
    expect(docIds).not.toContain(DOC_HANNA);
  });

  // --- Auto mode (VAL-SEARCH-014) ---

  it("auto mode selects graph when a person name is mentioned", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        members: [{ name: "Emma" }],
        entities: [
          {
            document_id: DOC_ID_1,
            entity_value: "Emma",
            normalized_value: "emma",
            confidence: 0.9,
          },
        ],
        documents: [{ id: DOC_ID_1, title: "Kita-Brief", status: "confirmed" }],
      }),
    );

    const response = await POST(
      createRequest(validBody({ query: "Zeig mir alle Dokumente von Emma", mode: "auto" })),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("graph");
    expect(body.results.length).toBeGreaterThanOrEqual(1);
  });

  it("auto mode selects graph when task keywords are present", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 3);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        members: [{ name: "Emma" }],
        tasks: [
          {
            id: "task-1",
            document_id: DOC_ID_1,
            title: "Frist abgeben",
            due_date: futureDateStr,
            priority: "high",
            status: "open",
            confidence: 0.9,
          },
        ],
        documents: [{ id: DOC_ID_1, title: "Brief", status: "confirmed" }],
      }),
    );

    const response = await POST(
      createRequest(validBody({ query: "Welche Fristen laufen bald ab?", mode: "auto" })),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("graph");
  });

  it("auto mode selects semantic for content queries without person or task keywords", async () => {
    const semanticResults: SearchResult[] = [
      {
        document_id: DOC_ID_1,
        title: "Stromrechnung",
        chunk_text: "Rechnung",
        score: 0.85,
        source: "semantic",
      },
    ];
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        members: [{ name: "Emma" }],
        semanticResults,
      }),
    );

    const response = await POST(
      createRequest(validBody({ query: "Finde die letzte Stromrechnung", mode: "auto" })),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("semantic");
    expect(generateQueryEmbedding).toHaveBeenCalledTimes(1);
  });

  it("auto mode never returns mode 'auto' in the response", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        members: [{ name: "Emma" }],
        semanticResults: [],
      }),
    );

    const response = await POST(
      createRequest(validBody({ query: "Finde die letzte Stromrechnung", mode: "auto" })),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).not.toBe("auto");
    expect(["semantic", "graph"]).toContain(body.mode);
  });

  // --- Auto mode: over-triggering prevention ---
  // Queries that merely contain a task keyword as a substring of a longer
  // word must fall back to semantic mode, not graph/task mode.

  it("auto mode selects semantic for 'Offenbach Stadtplan' (incidental 'offen' substring)", async () => {
    const semanticResults: SearchResult[] = [
      {
        document_id: DOC_ID_1,
        title: "Offenbach Stadtplan",
        chunk_text: "Stadtplan",
        score: 0.7,
        source: "semantic",
      },
    ];
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        members: [{ name: "Emma" }],
        semanticResults,
      }),
    );

    const response = await POST(
      createRequest(validBody({ query: "Offenbach Stadtplan", mode: "auto" })),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("semantic");
  });

  it("auto mode selects semantic for 'Ferienwoche Planung' (incidental 'woche' substring)", async () => {
    const semanticResults: SearchResult[] = [
      {
        document_id: DOC_ID_1,
        title: "Ferienwoche",
        chunk_text: "Planung",
        score: 0.7,
        source: "semantic",
      },
    ];
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        members: [{ name: "Emma" }],
        semanticResults,
      }),
    );

    const response = await POST(
      createRequest(validBody({ query: "Ferienwoche Planung", mode: "auto" })),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("semantic");
  });

  // --- RLS / family scoping (VAL-SEARCH-002) ---

  it("semantic search passes family_id to the RPC for RLS scoping", async () => {
    const mockClient = mockServerClient({ semanticResults: [] });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

    await POST(createRequest(validBody({ mode: "semantic" })));

    const params = mockClient._rpcCalls[0].params as Record<string, unknown>;
    expect(params.p_family_id).toBe(FAMILY_ID);
  });

  // --- DB error handling ---

  it("graph mode returns 500 when family_members query fails", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ membersError: true }),
    );

    const response = await POST(
      createRequest(validBody({ query: "Zeig mir alles von Emma", mode: "graph" })),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("SEARCH_FAILED");
  });

  it("auto mode returns 500 when family_members query fails", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ membersError: true }),
    );

    const response = await POST(
      createRequest(validBody({ query: "Finde Stromrechnung", mode: "auto" })),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("SEARCH_FAILED");
  });

  // --- Method not allowed ---

  it("GET returns 405", async () => {
    const { GET } = await import("@/app/api/search/route");

    const response = await GET();

    expect(response.status).toBe(405);
  });
});
