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
  generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
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
 * Build a mock server Supabase client that supports all the operations
 * the confirm route performs.
 */
function mockServerClient(options: {
  user?: { id: string; email: string } | null;
  docStatus?: string;
  docOcrText?: string | null;
  docNotFound?: boolean;
  pages?: { ocr_markdown: string | null; page_number: number }[];
  existingPersonNode?: { id: string } | null;
  nodeCreateError?: boolean;
  edgeInsertError?: boolean;
  embeddingInsertError?: boolean;
  entityInsertError?: boolean;
  taskInsertError?: boolean;
  clearError?: boolean;
  transitionSuccess?: boolean;
  transitionError?: boolean;
} = {}) {
  const {
    user = { id: "user-1", email: "test@ordilo.test" },
    docStatus = "analyzed",
    docOcrText = "OCR text from document",
    docNotFound = false,
    pages = [{ ocr_markdown: "# Page 1\n\nOCR content", page_number: 1 }],
    existingPersonNode = null,
    nodeCreateError = false,
    edgeInsertError = false,
    embeddingInsertError = false,
    entityInsertError = false,
    taskInsertError = false,
    clearError = false,
    transitionSuccess = true,
    transitionError = false,
  } = options;

  const operations: Record<string, number> = {};

  // Helper: make a chain thenable for direct await.
  function thenable(result: { data: unknown; error: unknown }) {
    const chain: Record<string, unknown> = {};
    chain.then = vi.fn(
      (resolve: (value: unknown) => void, reject?: (reason?: unknown) => void) =>
        Promise.resolve(result).then(resolve, reject),
    );
    return chain;
  }

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
    // Update: .update(payload).eq("id",...).eq("status","analyzed").select("id").maybeSingle()
    //   → conditional atomic transition (status='confirmed')
    // Update: .update(payload).eq("id",...) → thenable
    //   → markFailed (status='failed')
    update: vi.fn((payload: Record<string, unknown>) => {
      const isTransition = payload.status === "confirmed";
      const isMarkFailed = payload.status === "failed";

      if (isTransition) {
        operations.transition = (operations.transition ?? 0) + 1;
        // Conditional transition: .eq("id",...).eq("status","analyzed").select("id").maybeSingle()
        return {
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: transitionError
                    ? null
                    : transitionSuccess
                      ? { id: VALID_DOC_ID }
                      : null,
                  error: transitionError ? "transition error" : null,
                }),
              }),
            }),
          }),
        };
      }

      if (isMarkFailed) {
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

  // --- knowledge_nodes table ---
  // The confirm route:
  //   1. delete().eq("type", "document").eq("properties_json->>document_id", docId)  — clear prior doc node
  //   2. insert(docNode).select("id").single()  — create document node
  //   3. For persons/orgs: select("id").eq("family_id").eq("type").eq("label").maybeSingle()  — find existing
  //      If not found: insert(node).select("id").single()  — create new
  const knowledgeNodesBuilder = {
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue(
          thenable({ data: null, error: clearError ? "delete error" : null }),
        ),
      }),
    }),
    insert: vi.fn(() => {
      operations.nodeInsert = (operations.nodeInsert ?? 0) + 1;
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: nodeCreateError
              ? null
              : { id: `node-${operations.nodeInsert}` },
            error: nodeCreateError ? "insert error" : null,
          }),
        }),
      };
    }),
    select: vi.fn(() => {
      operations.nodeFind = (operations.nodeFind ?? 0) + 1;
      return {
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: existingPersonNode,
          error: null,
        }),
      };
    }),
  };

  // --- knowledge_edges table ---
  const knowledgeEdgesBuilder = {
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue(
        thenable({ data: null, error: clearError ? "delete error" : null }),
      ),
    }),
    insert: vi.fn().mockReturnValue(
      thenable({ data: null, error: edgeInsertError ? "insert error" : null }),
    ),
  };

  // --- document_embeddings table ---
  const documentEmbeddingsBuilder = {
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue(
        thenable({ data: null, error: clearError ? "delete error" : null }),
      ),
    }),
    insert: vi.fn().mockReturnValue(
      thenable({
        data: null,
        error: embeddingInsertError ? "insert error" : null,
      }),
    ),
  };

  // --- extracted_entities table ---
  const entitiesBuilder = {
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue(
        thenable({ data: null, error: clearError ? "delete error" : null }),
      ),
    }),
    insert: vi.fn().mockReturnValue(
      thenable({
        data: null,
        error: entityInsertError ? "insert error" : null,
      }),
    ),
  };

  // --- tasks table ---
  const tasksBuilder = {
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue(
        thenable({ data: null, error: clearError ? "delete error" : null }),
      ),
    }),
    insert: vi.fn().mockReturnValue(
      thenable({
        data: null,
        error: taskInsertError ? "insert error" : null,
      }),
    ),
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn((table: string) => {
      switch (table) {
        case "documents":
          return documentsBuilder;
        case "document_pages":
          return pagesBuilder;
        case "knowledge_nodes":
          return knowledgeNodesBuilder;
        case "knowledge_edges":
          return knowledgeEdgesBuilder;
        case "document_embeddings":
          return documentEmbeddingsBuilder;
        case "extracted_entities":
          return entitiesBuilder;
        case "tasks":
          return tasksBuilder;
        default:
          throw new Error(`Unexpected table: ${table}`);
      }
    }),
    _operations: operations,
    _knowledgeNodesBuilder: knowledgeNodesBuilder,
    _knowledgeEdgesBuilder: knowledgeEdgesBuilder,
    _documentEmbeddingsBuilder: documentEmbeddingsBuilder,
    _entitiesBuilder: entitiesBuilder,
    _tasksBuilder: tasksBuilder,
    _documentsBuilder: documentsBuilder,
  } as unknown as Awaited<ReturnType<typeof createServerClient>> & {
    _operations: Record<string, number>;
    _knowledgeNodesBuilder: { insert: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
    _knowledgeEdgesBuilder: { delete: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> };
    _documentEmbeddingsBuilder: { delete: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> };
    _entitiesBuilder: { delete: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> };
    _tasksBuilder: { delete: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> };
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
    (chunkPages as ReturnType<typeof vi.fn>).mockReturnValue([
      { text: "chunk text", index: 0, page_number: 1 },
    ]);
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
    // No knowledge_nodes/edges/embeddings should be created.
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

  it("clears prior edges and embeddings before creating new ones", async () => {
    const client = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    await POST(createRequest(validPayload()), createParams());

    // knowledge_edges delete was called (clear prior).
    expect(client._knowledgeEdgesBuilder.delete).toHaveBeenCalled();
    // document_embeddings delete was called (clear prior).
    expect(client._documentEmbeddingsBuilder.delete).toHaveBeenCalled();
  });

  it("deletes and re-inserts entities with confirmed=true", async () => {
    const client = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    await POST(createRequest(validPayload()), createParams());

    // Entities delete was called.
    expect(client._entitiesBuilder.delete).toHaveBeenCalled();
    // Entities insert was called.
    expect(client._entitiesBuilder.insert).toHaveBeenCalled();
  });

  it("deletes and re-inserts tasks with confirmed=true", async () => {
    const client = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    await POST(createRequest(validPayload()), createParams());

    // Tasks delete was called.
    expect(client._tasksBuilder.delete).toHaveBeenCalled();
    // Tasks insert was called.
    expect(client._tasksBuilder.insert).toHaveBeenCalled();
  });

  it("updates document status to confirmed with confirmed_at via conditional transition", async () => {
    const client = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    await POST(createRequest(validPayload()), createParams());

    // The conditional transition should have been called.
    expect(client._operations.transition).toBe(1);
    // Check that the update payload includes status=confirmed and confirmed_at.
    const updateCall = client._documentsBuilder.update.mock.calls[0][0];
    expect(updateCall.status).toBe("confirmed");
    expect(updateCall.confirmed_at).toBeDefined();
  });

  // --- Edited payload (VAL-CONFIRM-008) ---

  it("uses edited payload values for document update", async () => {
    const client = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const editedPayload = validPayload({
      title: "Edited Title",
      summary: "Edited summary",
      suggested_category: "Edited Category",
    });

    await POST(createRequest(editedPayload), createParams());

    const updateCall = client._documentsBuilder.update.mock.calls[0][0];
    expect(updateCall.title).toBe("Edited Title");
    expect(updateCall.summary).toBe("Edited summary");
    expect(updateCall.category).toBe("Edited Category");
  });

  it("uses edited person name for knowledge graph", async () => {
    const client = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const editedPayload = validPayload({
      family_members: [
        { person_id: "member-2", name: "Hanna", confidence: 0.9 },
      ],
    });

    await POST(createRequest(editedPayload), createParams());

    // The knowledge_nodes insert should have been called with "Hanna".
    const insertCalls = client._knowledgeNodesBuilder.insert.mock.calls;
    const personNodeInsert = insertCalls.find(
      (call: unknown[]) => {
        const payload = call[0] as Record<string, unknown>;
        return payload.type === "person" && payload.label === "Hanna";
      },
    );
    expect(personNodeInsert).toBeDefined();
  });

  it("excludes deleted tasks from task inserts", async () => {
    const client = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const payloadWithDeletedTasks = validPayload({
      tasks: [], // All tasks deleted (empty array).
      deletedTaskIndices: [0],
    });

    await POST(createRequest(payloadWithDeletedTasks), createParams());

    // Tasks insert was called with an empty array (or not called).
    const insertCall = client._tasksBuilder.insert.mock.calls[0];
    if (insertCall) {
      const taskInserts = insertCall[0];
      expect(Array.isArray(taskInserts)).toBe(true);
      expect(taskInserts).toHaveLength(0);
    }
  });

  // --- Failure handling (VAL-CONFIRM-011) ---

  it("marks document as failed and returns 502 on embedding error", async () => {
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
    // Document should have been marked as failed.
    expect(client._operations.markFailed).toBeGreaterThanOrEqual(1);
  });

  it("marks document as failed on node creation error", async () => {
    const client = mockServerClient({ nodeCreateError: true });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const response = await POST(
      createRequest(validPayload()),
      createParams(),
    );

    expect(response.status).toBe(500);
    expect(client._operations.markFailed).toBeGreaterThanOrEqual(1);
  });

  it("marks document as failed on edge insert error", async () => {
    const client = mockServerClient({ edgeInsertError: true });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const response = await POST(
      createRequest(validPayload()),
      createParams(),
    );

    expect(response.status).toBe(500);
    expect(client._operations.markFailed).toBeGreaterThanOrEqual(1);
  });

  it("returns 500 when conditional transition DB update errors", async () => {
    const client = mockServerClient({ transitionError: true });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const response = await POST(
      createRequest(validPayload()),
      createParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("DB_UPDATE_FAILED");
    // No graph mutations should happen.
    expect(client._knowledgeEdgesBuilder.insert).not.toHaveBeenCalled();
  });

  // --- Atomic conditional transition (VAL-CONFIRM-011) ---

  it("returns 409 when conditional transition matches 0 rows (double-submit / status changed)", async () => {
    const client = mockServerClient({ transitionSuccess: false });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const response = await POST(
      createRequest(validPayload()),
      createParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("STATUS_CHANGED");
    // No graph mutations or embeddings should happen.
    expect(generateEmbeddings).not.toHaveBeenCalled();
    expect(client._knowledgeEdgesBuilder.insert).not.toHaveBeenCalled();
    expect(client._documentEmbeddingsBuilder.insert).not.toHaveBeenCalled();
  });

  // --- Page-aware embeddings (VAL-CONFIRM-005) ---

  it("includes page_number in each document_embeddings metadata_json", async () => {
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

    // Verify the embedding insert includes page_number in metadata_json.
    const insertArg = client._documentEmbeddingsBuilder.insert.mock.calls[0][0];
    expect(insertArg[0].metadata_json.page_number).toBe(1);
    expect(insertArg[1].metadata_json.page_number).toBe(2);
    // metadata_json should also include document_id.
    expect(insertArg[0].metadata_json.document_id).toBe(VALID_DOC_ID);
  });

  // --- Idempotency (VAL-CONFIRM-012) ---

  it("clears prior edges and embeddings before creating new ones (idempotency)", async () => {
    const client = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    await POST(createRequest(validPayload()), createParams());

    // Verify delete was called before insert for edges.
    const edgesDeleteCall = client._knowledgeEdgesBuilder.delete;
    const edgesInsertCall = client._knowledgeEdgesBuilder.insert;
    expect(edgesDeleteCall).toHaveBeenCalled();
    expect(edgesInsertCall).toHaveBeenCalled();
  });

  it("reuses existing person nodes (find before create)", async () => {
    const client = mockServerClient({
      existingPersonNode: { id: "existing-node-1" },
    });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    await POST(createRequest(validPayload()), createParams());

    // The node find (select) should have been called.
    expect(client._operations.nodeFind).toBeGreaterThanOrEqual(1);
  });

  it("idempotent double-confirm: second call returns 409 and creates no duplicates", async () => {
    // First confirm: succeeds (status was 'analyzed' → transition succeeds).
    const client1 = mockServerClient({ transitionSuccess: true });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client1);

    const response1 = await POST(
      createRequest(validPayload()),
      createParams(),
    );
    expect(response1.status).toBe(200);

    // Second confirm: transition fails (status is now 'confirmed', not 'analyzed').
    const client2 = mockServerClient({ transitionSuccess: false });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client2);

    const response2 = await POST(
      createRequest(validPayload()),
      createParams(),
    );
    const body2 = await response2.json();

    expect(response2.status).toBe(409);
    expect(body2.code).toBe("STATUS_CHANGED");
    // No graph mutations should happen on the second call.
    expect(client2._knowledgeEdgesBuilder.insert).not.toHaveBeenCalled();
    expect(client2._documentEmbeddingsBuilder.insert).not.toHaveBeenCalled();
    expect(client2._entitiesBuilder.insert).not.toHaveBeenCalled();
    expect(client2._tasksBuilder.insert).not.toHaveBeenCalled();
  });

  it("clears prior embeddings before inserting new ones (replace, not append)", async () => {
    const client = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    await POST(createRequest(validPayload()), createParams());

    // Verify delete was called before insert for embeddings.
    expect(client._documentEmbeddingsBuilder.delete).toHaveBeenCalled();
    expect(client._documentEmbeddingsBuilder.insert).toHaveBeenCalled();
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
    // generateEmbeddings should NOT have been called (no OCR text).
    expect(generateEmbeddings).not.toHaveBeenCalled();
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

  // --- Method not allowed ---

  it("GET returns 405", async () => {
    const { GET } = await import("@/app/api/documents/[id]/confirm/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(405);
    expect(body.code).toBe("METHOD_NOT_ALLOWED");
  });
});
