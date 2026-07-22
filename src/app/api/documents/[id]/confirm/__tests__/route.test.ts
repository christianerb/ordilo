import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase server client and embeddings module before importing.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/ai/embeddings", () => ({
  chunkText: vi.fn((text: string) => [{ text, index: 0 }]),
  chunkPages: vi.fn((pages: { text: string; page_number: number }[]) =>
    pages.map((p, i) => ({ text: p.text, index: i, page_number: p.page_number })),
  ),
  cleanOcrForEmbedding: vi.fn((text: string) => text),
  contextualizeForEmbedding: vi.fn((text: string) => text),
  generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  embeddingToVectorString: vi.fn((emb: number[]) => `[${emb.join(",")}]`),
  deduplicateChunks: vi.fn((chunks: unknown[]) => ({
    kept: chunks,
    removedIndices: [],
  })),
  generateSyntheticQuestions: vi.fn(() => []),
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

import { POST } from "@/app/api/documents/[id]/confirm/route";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { generateEmbeddings, chunkPages } from "@/lib/ai/embeddings";
import type { DocumentAnalysis } from "@/lib/schemas/extraction";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_DOC_ID = "550e8400-e29b-41d4-a716-446655440000";
const FAMILY_ID = "660e8400-e29b-41d4-a716-446655440001";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createParams(id: string = VALID_DOC_ID) {
  return { params: Promise.resolve({ id }) };
}

/** Create a valid DocumentAnalysis for testing. */
function validAnalysis(overrides: Partial<DocumentAnalysis> = {}): DocumentAnalysis {
  return {
    document_type: "letter",
    title: "Einladung zum Elternabend",
    summary: "Elternabend in der Kita Sonnenblume am 15. Juli 2026.",
    family_members: [
      { person_id: "member-1", name: "Emma", confidence: 0.95 },
    ],
    organizations: [
      { name: "Kita Sonnenblume", type: "Kita", confidence: 0.9 },
    ],
    dates: [
      { date: "2026-07-15", type: "event", label: "Elternabend", confidence: 0.88 },
    ],
    amounts: [],
    tasks: [
      { title: "Elternabend besuchen", due_date: "2026-07-15", priority: "medium", confidence: 0.8 },
    ],
    facts: [],
    suggested_category: "Kita",
    tags: ["Elternabend", "Kita"],
    needs_user_review: false,
    ...overrides,
  };
}

/** Create a valid confirm payload. */
function validPayload(overrides: Partial<DocumentAnalysis> & { deletedTaskIndices?: number[] } = {}) {
  const { deletedTaskIndices, ...analysisOverrides } = overrides;
  return {
    ...validAnalysis(analysisOverrides),
    deletedTaskIndices: deletedTaskIndices ?? [],
  };
}

/** Create a JSON Request with the given body. */
function createRequest(body: unknown): Request {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Build a mock server Supabase client that supports the RPC-based confirm
 * flow.
 *
 * The route performs:
 *   - documents.select(...).eq("id").maybeSingle()  — read document
 *   - document_pages.select(...).eq(...).order(...)  — fetch OCR pages
 *   - documents.update({failure_stage,...}).eq("id",...)  — diagnostics
 *   - rpc("confirm_document", params)  — the single atomic confirm RPC
 *
 * All graph/embedding/entity/task mutations now happen inside the RPC, so
 * the mock no longer needs per-table builders for those tables.
 */
function mockServerClient(options: {
  user?: { id: string; email: string } | null;
  docStatus?: string;
  docOcrText?: string | null;
  docNotFound?: boolean;
  pages?: { ocr_markdown: string | null; page_number: number }[];
  rpcResult?: { status: string; document_id?: string } | null;
  rpcError?: unknown;
  transitionStatusChanged?: boolean;
} = {}) {
  const {
    user = { id: "user-1", email: "test@ordilo.test" },
    docStatus = "analyzed",
    docOcrText = "OCR text from document",
    docNotFound = false,
    pages = [{ ocr_markdown: "# Page 1\n\nOCR content", page_number: 1 }],
    rpcResult = { status: "confirmed", document_id: VALID_DOC_ID },
    rpcError = null,
    transitionStatusChanged = false,
  } = options;

  const operations: Record<string, number> = {};
  const rpcCalls: unknown[] = [];

  // Helper: make a chain thenable for direct await (used by markFailed).
  function thenable(result: { data: unknown; error: unknown }) {
    const chain: Record<string, unknown> = {};
    chain.then = vi.fn(
      (resolve: (value: unknown) => void, reject?: (reason?: unknown) => void) =>
        Promise.resolve(result).then(resolve, reject),
    );
    return chain;
  }

  // If transitionStatusChanged, the RPC returns status_changed.
  const effectiveRpcResult = transitionStatusChanged
    ? { status: "status_changed" }
    : rpcResult;

  // --- documents table ---
  const documentsBuilder = {
    select: vi.fn(() => {
      operations.documentsRead = (operations.documentsRead ?? 0) + 1;
      return {
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: docNotFound ? null : {
              id: VALID_DOC_ID,
              family_id: FAMILY_ID,
              status: docStatus,
              ocr_text: docOcrText,
              title: "Test Document",
            },
            error: null,
          }),
        }),
      };
    }),
    // update().eq("id",...) → thenable (used by markFailed only).
    update: vi.fn((payload: Record<string, unknown>) => {
      if (payload.status === "failed") {
        operations.markFailed = (operations.markFailed ?? 0) + 1;
      }
      return {
        eq: vi.fn().mockReturnValue(
          thenable({ data: null, error: null }),
        ),
      };
    }),
  };

  // --- document_pages table ---
  const pagesBuilder = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue(
          thenable({ data: pages, error: null }),
        ),
      }),
    }),
  };

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn((table: string) => {
      switch (table) {
        case "documents":
          return documentsBuilder;
        case "document_pages":
          return pagesBuilder;
        default:
          throw new Error(`Unexpected table: ${table}`);
      }
    }),
    rpc: vi.fn((fnName: string, params: unknown) => {
      operations.rpc = (operations.rpc ?? 0) + 1;
      rpcCalls.push({ fnName, params });
      return Promise.resolve({
        data: effectiveRpcResult,
        error: rpcError,
      });
    }),
  };

  return {
    ...client,
    _operations: operations,
    _rpcCalls: rpcCalls,
    _documentsBuilder: documentsBuilder,
  } as unknown as Awaited<ReturnType<typeof createServerClient>> & {
    _operations: Record<string, number>;
    _rpcCalls: { fnName: string; params: unknown }[];
    _documentsBuilder: { update: ReturnType<typeof vi.fn> };
  };
}

/**
 * Build a mock admin (service-role) Supabase client.
 *
 * Used to distinguish existence from ownership: when the RLS-scoped
 * server client returns no document, the route checks the admin client.
 * If the admin client finds the document → 403 (not owned).
 * If the admin client also returns null → 404 (truly not found).
 */
function mockAdminClient(options: { docExists?: boolean } = {}) {
  const { docExists = false } = options;

  const documentsBuilder = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: docExists ? { id: VALID_DOC_ID } : null,
          error: null,
        }),
      }),
    }),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "documents") return documentsBuilder;
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as ReturnType<typeof createAdminClient>;
}

// ---------------------------------------------------------------------------
// POST /api/documents/[id]/confirm
// ---------------------------------------------------------------------------

describe("POST /api/documents/[id]/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: embeddings succeed.
    (generateEmbeddings as ReturnType<typeof vi.fn>).mockResolvedValue([[0.1, 0.2]]);
    // Default: chunkPages is input-aware (empty input → empty output), so
    // the "no OCR text" path does not generate embeddings.
    (chunkPages as ReturnType<typeof vi.fn>).mockImplementation(
      (pages: { text: string; page_number: number }[]) =>
        pages.map((p, i) => ({ text: p.text, index: i, page_number: p.page_number })),
    );
  });

  // --- Authentication ---

  it("returns 401 when unauthenticated", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ user: null }),
    );

    const response = await POST(
      createRequest(validPayload()),
      createParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe("UNAUTHENTICATED");
    expect(generateEmbeddings).not.toHaveBeenCalled();
  });

  // --- Document ID validation ---

  it("returns 400 for invalid document ID (not a UUID)", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );

    const response = await POST(
      createRequest(validPayload()),
      createParams("not-a-uuid"),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_DOCUMENT_ID");
  });

  // --- Invalid JSON body ---

  it("returns 400 for invalid JSON body", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json {{{",
      }),
      createParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_JSON");
  });

  // --- Invalid payload (Zod validation) ---

  it("returns 400 for payload with invalid document_type", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );

    const response = await POST(
      createRequest({ ...validPayload(), document_type: "blog" }),
      createParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_PAYLOAD");
  });

  // --- Document not found / not owned (403 vs 404) ---

  it("returns 404 when document truly does not exist (admin also finds nothing)", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ docNotFound: true }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({ docExists: false }),
    );

    const response = await POST(
      createRequest(validPayload()),
      createParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe("DOCUMENT_NOT_FOUND");
    expect(generateEmbeddings).not.toHaveBeenCalled();
  });

  it("returns 403 when document exists but belongs to another family (non-owner)", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ docNotFound: true }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({ docExists: true }),
    );

    const response = await POST(
      createRequest(validPayload()),
      createParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
    // No embeddings should be generated for non-owned documents.
    expect(generateEmbeddings).not.toHaveBeenCalled();
  });

  // --- Invalid status (409) ---

  it("returns 409 when document is in uploaded status", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ docStatus: "uploaded" }),
    );

    const response = await POST(
      createRequest(validPayload()),
      createParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("INVALID_STATUS_TRANSITION");
    expect(generateEmbeddings).not.toHaveBeenCalled();
  });

  it("returns 409 when document is already confirmed", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ docStatus: "confirmed" }),
    );

    const response = await POST(
      createRequest(validPayload()),
      createParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("INVALID_STATUS_TRANSITION");
    expect(generateEmbeddings).not.toHaveBeenCalled();
  });

  it("returns 409 when document is in failed status", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ docStatus: "failed" }),
    );

    const response = await POST(
      createRequest(validPayload()),
      createParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("INVALID_STATUS_TRANSITION");
  });

  // --- Success (200) ---

  it("returns 200 with status confirmed on success", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );

    const response = await POST(
      createRequest(validPayload()),
      createParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("confirmed");
    expect(body.document_id).toBe(VALID_DOC_ID);
  });

  it("calls generateEmbeddings with chunked OCR text", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );

    await POST(createRequest(validPayload()), createParams());

    expect(chunkPages).toHaveBeenCalled();
    expect(generateEmbeddings).toHaveBeenCalled();
  });

  it("calls the confirm_document RPC exactly once on success", async () => {
    const client = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    await POST(createRequest(validPayload()), createParams());

    expect(client._operations.rpc).toBe(1);
    expect(client._rpcCalls[0].fnName).toBe("confirm_document");
  });

  it("passes the document and family IDs to the RPC", async () => {
    const client = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    await POST(createRequest(validPayload()), createParams());

    const params = client._rpcCalls[0].params as Record<string, unknown>;
    expect(params.p_document_id).toBe(VALID_DOC_ID);
    expect(params.p_family_id).toBe(FAMILY_ID);
  });

  // --- Edited payload (VAL-CONFIRM-008) ---

  it("passes edited payload values (title, summary, category) to the RPC", async () => {
    const client = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const editedPayload = validPayload({
      title: "Edited Title",
      summary: "Edited summary",
      facts: [],
      suggested_category: "Edited Category",
      document_type: "invoice",
    });

    await POST(createRequest(editedPayload), createParams());

    const params = client._rpcCalls[0].params as Record<string, unknown>;
    expect(params.p_title).toBe("Edited Title");
    expect(params.p_summary).toBe("Edited summary");
    expect(params.p_category).toBe("Edited Category");
    expect(params.p_document_type).toBe("invoice");
  });

  it("passes edited person name to the RPC (used for node upsert)", async () => {
    const client = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const editedPayload = validPayload({
      family_members: [
        { person_id: "member-2", name: "Hanna", confidence: 0.9 },
      ],
    });

    await POST(createRequest(editedPayload), createParams());

    const params = client._rpcCalls[0].params as {
      p_persons: { name: string; person_id: string | null; confidence: number }[];
    };
    expect(params.p_persons).toHaveLength(1);
    expect(params.p_persons[0].name).toBe("Hanna");
    expect(params.p_persons[0].person_id).toBe("member-2");
  });

  it("excludes deleted tasks from the tasks passed to the RPC", async () => {
    const client = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const payloadWithDeletedTasks = validPayload({
      tasks: [], // All tasks deleted (empty array).
      deletedTaskIndices: [0],
    });

    await POST(createRequest(payloadWithDeletedTasks), createParams());

    const params = client._rpcCalls[0].params as { p_tasks: unknown[] };
    expect(params.p_tasks).toHaveLength(0);
  });

  it("passes organizations to the RPC for node upsert", async () => {
    const client = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    await POST(createRequest(validPayload()), createParams());

    const params = client._rpcCalls[0].params as {
      p_organizations: { name: string; type: string; confidence: number }[];
    };
    expect(params.p_organizations).toHaveLength(1);
    expect(params.p_organizations[0].name).toBe("Kita Sonnenblume");
  });

  // --- Page-aware embeddings (VAL-CONFIRM-005) ---

  it("includes page_number in each embedding passed to the RPC", async () => {
    const client = mockServerClient({
      pages: [
        { ocr_markdown: "# Page 1\n\nContent A", page_number: 1 },
        { ocr_markdown: "# Page 2\n\nContent B", page_number: 2 },
      ],
    });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);
    (chunkPages as ReturnType<typeof vi.fn>).mockReturnValue([
      { text: "Content A", index: 0, page_number: 1 },
      { text: "Content B", index: 1, page_number: 2 },
    ]);
    // Return one embedding per chunk.
    (generateEmbeddings as ReturnType<typeof vi.fn>).mockResolvedValue([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);

    await POST(createRequest(validPayload()), createParams());

    // Verify chunkPages was called with page-aware content.
    expect(chunkPages).toHaveBeenCalled();
    const pageArg = (chunkPages as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(pageArg[0].page_number).toBe(1);
    expect(pageArg[1].page_number).toBe(2);

    // Verify the embeddings param includes page_number provenance.
    const params = client._rpcCalls[0].params as {
      p_embeddings: {
        chunk_text: string;
        embedding: string;
        page_number: number;
        chunk_index: number;
        chunk_total: number;
      }[];
    };
    expect(params.p_embeddings).toHaveLength(2);
    expect(params.p_embeddings[0].page_number).toBe(1);
    expect(params.p_embeddings[1].page_number).toBe(2);
    // metadata provenance: document_id is added by the RPC, not the route,
    // but the chunk_index/chunk_total are passed.
    expect(params.p_embeddings[0].chunk_total).toBe(2);
  });

  // --- Atomic rollback on RPC failure (VAL-CONFIRM-011) ---
  //
  // All DB mutations happen inside the single confirm_document RPC. If the
  // RPC errors, the Postgres transaction rolls back — no partial graph,
  // embedding, entity, or task state persists. The route then records the
  // failure. This test verifies the route's contract: on RPC error
  // it makes no individual graph/embedding/entity/task mutation calls
  // (they are all inside the atomic RPC), records diagnostics without
  // discarding the analyzed state, and returns a structured error.

  it("keeps the document retryable and returns 500 when the RPC errors", async () => {
    const client = mockServerClient({
      rpcResult: null,
      rpcError: { message: "constraint violation", code: "23505" },
    });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const response = await POST(
      createRequest(validPayload()),
      createParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("CONFIRM_RPC_FAILED");
    // The RPC was called exactly once.
    expect(client._operations.rpc).toBe(1);
    expect(client._operations.markFailed ?? 0).toBe(0);
    expect(client._documentsBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        failure_stage: "confirmation",
        failure_code: "23505",
        failed_at: expect.any(String),
      }),
    );
    expect(client._documentsBuilder.update.mock.calls[0][0]).not.toHaveProperty(
      "status",
    );
  });

  it("does not call the RPC when embedding generation fails (no DB mutations)", async () => {
    const client = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const { EmbeddingError } = await import("@/lib/ai/embeddings");
    (generateEmbeddings as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new EmbeddingError("OpenAI error", "OPENAI_API_ERROR", 500),
    );

    const response = await POST(
      createRequest(validPayload()),
      createParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.code).toBe("OPENAI_API_ERROR");
    // The RPC must NOT have been called (embeddings are generated first,
    // before the DB transaction).
    expect(client._operations.rpc).toBeUndefined();
    expect(client._operations.markFailed ?? 0).toBe(0);
    expect(client._documentsBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        failure_stage: "embedding",
        failure_code: "OPENAI_API_ERROR",
      }),
    );
  });

  // --- Concurrent node reuse via upsert (VAL-CONFIRM-012) ---
  //
  // The person/organization nodes are upserted inside the RPC with
  // ON CONFLICT DO UPDATE (see migration 0005). This test verifies the
  // route passes the persons array to the RPC so the upsert can converge
  // concurrent confirms on the same node. The DB-level ON CONFLICT is
  // enforced by the migration's partial unique index
  // knowledge_nodes_person_org_unique_idx.

  it("passes person nodes to the RPC so concurrent confirms converge via upsert", async () => {
    const client = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const payload = validPayload({
      family_members: [
        { person_id: "member-1", name: "Emma", confidence: 0.95 },
        { person_id: null, name: "Max", confidence: 0.6 },
      ],
    });

    await POST(createRequest(payload), createParams());

    const params = client._rpcCalls[0].params as {
      p_persons: { name: string; person_id: string | null; confidence: number }[];
    };
    expect(params.p_persons).toHaveLength(2);
    expect(params.p_persons[0].name).toBe("Emma");
    expect(params.p_persons[1].name).toBe("Max");
    expect(params.p_persons[1].person_id).toBeNull();
  });

  // --- Idempotent double-confirm (VAL-CONFIRM-012) ---

  it("returns 409 STATUS_CHANGED when RPC reports status_changed (double-submit)", async () => {
    const client = mockServerClient({ transitionStatusChanged: true });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const response = await POST(
      createRequest(validPayload()),
      createParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("STATUS_CHANGED");
    // The RPC was called (it performed no mutations, just returned early).
    expect(client._operations.rpc).toBe(1);
    // The document must NOT be marked failed (it was likely confirmed by a
    // concurrent request — this is a double-submit, not a failure).
    expect(client._operations.markFailed).toBeUndefined();
  });

  it("idempotent double-confirm: second call returns 409 and does not mark failed", async () => {
    // First confirm: succeeds.
    const client1 = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client1);

    const response1 = await POST(
      createRequest(validPayload()),
      createParams(),
    );
    expect(response1.status).toBe(200);

    // Second confirm: RPC reports status_changed (already confirmed).
    const client2 = mockServerClient({ transitionStatusChanged: true });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client2);

    const response2 = await POST(
      createRequest(validPayload()),
      createParams(),
    );
    const body2 = await response2.json();

    expect(response2.status).toBe(409);
    expect(body2.code).toBe("STATUS_CHANGED");
    // No markFailed on the second call.
    expect(client2._operations.markFailed).toBeUndefined();
    // The RPC was called exactly once on the second call.
    expect(client2._operations.rpc).toBe(1);
  });

  it("passes entities (persons, orgs, dates, category, tags) to the RPC", async () => {
    const client = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    await POST(createRequest(validPayload()), createParams());

    const params = client._rpcCalls[0].params as {
      p_entities: { entity_type: string; entity_value: string; confidence: number }[];
    };
    const types = params.p_entities.map((e) => e.entity_type);
    expect(types).toContain("person");
    expect(types).toContain("organization");
    expect(types).toContain("date");
    expect(types).toContain("category");
    expect(types).toContain("tag");
  });

  it("passes tasks with due_date and priority to the RPC", async () => {
    const client = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    await POST(createRequest(validPayload()), createParams());

    const params = client._rpcCalls[0].params as {
      p_tasks: { title: string; due_date: string | null; priority: string }[];
    };
    expect(params.p_tasks).toHaveLength(1);
    expect(params.p_tasks[0].title).toBe("Elternabend besuchen");
    expect(params.p_tasks[0].due_date).toBe("2026-07-15");
    expect(params.p_tasks[0].priority).toBe("medium");
  });

  // --- Empty OCR text ---

  it("succeeds without embeddings when OCR text is empty", async () => {
    const client = mockServerClient({
      docOcrText: null,
      pages: [{ ocr_markdown: null, page_number: 1 }],
    });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const response = await POST(
      createRequest(validPayload()),
      createParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("confirmed");
    // generateEmbeddings may be called for label embeddings (title, person
    // names) even with no OCR text — that's expected. The chunk embeddings
    // array should still be empty.
    expect(client._operations.rpc).toBe(1);
    const params = client._rpcCalls[0].params as { p_embeddings: unknown[] };
    expect(params.p_embeddings).toHaveLength(0);
  });

  it("falls back to documents.ocr_text when pages have no markdown", async () => {
    const client = mockServerClient({
      docOcrText: "Fallback OCR text from documents table",
      pages: [{ ocr_markdown: null, page_number: 1 }],
    });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const response = await POST(
      createRequest(validPayload()),
      createParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("confirmed");
    // Embeddings should have been generated from the fallback OCR text.
    expect(generateEmbeddings).toHaveBeenCalled();
  });

  // --- Unexpected RPC result ---

  it("records diagnostics when the RPC returns an unexpected result shape", async () => {
    const client = mockServerClient({
      rpcResult: { status: "something_else" } as { status: string; document_id?: string },
    });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const response = await POST(
      createRequest(validPayload()),
      createParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("CONFIRM_UNEXPECTED_RESULT");
    expect(client._operations.markFailed ?? 0).toBe(0);
    expect(client._documentsBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        failure_stage: "confirmation",
        failure_code: "CONFIRM_UNEXPECTED_RESULT",
      }),
    );
  });

  // --- Method not allowed ---

  it("GET returns 405", async () => {
    const { GET } = await import("@/app/api/documents/[id]/confirm/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(405);
    expect(body.code).toBe("METHOD_NOT_ALLOWED");
  });
});
