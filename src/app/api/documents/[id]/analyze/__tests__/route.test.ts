import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase server client and extraction client before importing.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/ai/extraction", () => ({
  runExtraction: vi.fn(),
  ExtractionError: class ExtractionError extends Error {
    code: string;
    statusCode?: number;
    constructor(message: string, code: string, statusCode?: number) {
      super(message);
      this.name = "ExtractionError";
      this.code = code;
      this.statusCode = statusCode;
    }
  },
}));

import { POST } from "@/app/api/documents/[id]/analyze/route";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { runExtraction, ExtractionError } from "@/lib/ai/extraction";
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

/**
 * Build a mock server Supabase client that supports all the operations
 * the analyze route performs:
 *
 *   documents:
 *     - read: .select().eq().maybeSingle() → returns { id, family_id, status, ocr_text }
 *     - atomic transition: .update({status:"analyzing"}).eq().in().select().maybeSingle()
 *     - final update: .update({status:"analyzed",...}).eq() → thenable
 *     - markFailed: .update({status:"failed",...}).eq() → thenable
 *
 *   document_pages:
 *     - .select().eq().order() → thenable returning pages
 *
 *   family_members:
 *     - .select().eq().order() → thenable returning members
 *
 *   documents (categories):
 *     - .select().eq().not() → thenable returning category docs
 *
 *   knowledge_nodes:
 *     - .select().eq().order() → thenable returning nodes
 *
 *   extracted_entities:
 *     - .delete().eq() → thenable (clear prior)
 *     - .insert() → thenable (store new)
 *
 *   tasks:
 *     - .delete().eq() → thenable (clear prior)
 *     - .insert() → thenable (store new)
 *
 *   knowledge_edges:
 *     - .delete().eq() → thenable (clear if was confirmed)
 *
 *   document_embeddings:
 *     - .delete().eq() → thenable (clear if was confirmed)
 */
function mockServerClient(options: {
  user?: { id: string; email: string } | null;
  docStatus?: string;
  docOcrText?: string | null;
  docNotFound?: boolean;
  pages?: { ocr_markdown: string | null }[];
  members?: { id: string; name: string; role: string | null }[];
  membersError?: boolean;
  categoryDocs?: { category: string | null }[];
  knowledgeNodes?: { type: string; label: string }[];
  transitionSuccess?: boolean;
  storeError?: boolean;
  finalUpdateError?: boolean;
} = {}) {
  const {
    user = { id: "user-1", email: "test@ordilo.test" },
    docStatus = "ocr_done",
    docOcrText = "OCR text from document",
    docNotFound = false,
    pages = [{ ocr_markdown: "# Page 1\n\nOCR content" }],
    members = [{ id: "member-1", name: "Emma", role: "Kind" }],
    membersError = false,
    categoryDocs = [{ category: "Kita" }, { category: "Rechnungen" }],
    knowledgeNodes = [{ type: "organization", label: "Kita Sonnenblume" }],
    transitionSuccess = true,
    storeError = false,
    finalUpdateError = false,
  } = options;

  // Track operations for assertions.
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
    // select is used for:
    //   1. Initial read: .select("id, family_id, status, ocr_text").eq().maybeSingle()
    //   2. Categories query: .select("category").eq().not() (thenable)
    //   3. Atomic transition: .update().eq().in().select("id").maybeSingle()
    //      (this select is on the update chain, not here)
    select: vi.fn((fields?: string) => {
      // Initial read — fields include "family_id".
      if (fields === "*" || (fields && fields.includes("family_id"))) {
        operations.documentsRead = (operations.documentsRead ?? 0) + 1;
        return {
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: docNotFound ? null : {
                id: VALID_DOC_ID,
                family_id: FAMILY_ID,
                status: docStatus,
                ocr_text: docOcrText,
              },
              error: null,
            }),
          }),
        };
      }
      // Categories query — fields is "category".
      if (fields === "category") {
        return {
          eq: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnValue(
              thenable({ data: categoryDocs, error: null }),
            ),
          }),
        };
      }
      // Fallback for .select("id") (shouldn't reach here — handled by update chain).
      return {
        maybeSingle: vi.fn().mockResolvedValue({
          data: transitionSuccess ? { id: VALID_DOC_ID } : null,
          error: null,
        }),
      };
    }),
    // Update: .update(payload).eq() or .update(payload).eq().in().select().maybeSingle()
    update: vi.fn((payload: Record<string, unknown>) => {
      const isTransition = payload.status === "analyzing";
      const isFinalUpdate = payload.status === "analyzed";
      const isMarkFailed = payload.status === "failed";

      if (isTransition) {
        operations.transition = (operations.transition ?? 0) + 1;
        const chain: Record<string, unknown> = {
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: transitionSuccess ? { id: VALID_DOC_ID } : null,
                error: null,
              }),
            }),
          }),
        };
        return chain;
      }

      // Final update and markFailed: .update().eq() → thenable
      if (isFinalUpdate) {
        operations.finalUpdate = (operations.finalUpdate ?? 0) + 1;
      }
      if (isMarkFailed) {
        operations.markFailed = (operations.markFailed ?? 0) + 1;
      }
      return {
        eq: vi.fn().mockReturnValue(
          thenable({
            data: null,
            error: finalUpdateError && isFinalUpdate ? "update error" : null,
          }),
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

  // --- family_members table ---
  const membersBuilder = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue(
          thenable({ data: members, error: membersError ? "members error" : null }),
        ),
      }),
    }),
  };

  // --- knowledge_nodes table ---
  const nodesBuilder = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue(
          thenable({ data: knowledgeNodes, error: null }),
        ),
      }),
    }),
  };

  // --- extracted_entities table ---
  const entitiesBuilder = {
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue(
        thenable({ data: null, error: storeError ? "delete error" : null }),
      ),
    }),
    insert: vi.fn().mockReturnValue(
      thenable({ data: null, error: storeError ? "insert error" : null }),
    ),
  };

  // --- tasks table ---
  const tasksBuilder = {
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue(
        thenable({ data: null, error: storeError ? "delete error" : null }),
      ),
    }),
    insert: vi.fn().mockReturnValue(
      thenable({ data: null, error: storeError ? "insert error" : null }),
    ),
  };

  // --- knowledge_edges table ---
  const edgesBuilder = {
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue(
        thenable({ data: null, error: storeError ? "delete error" : null }),
      ),
    }),
  };

  // --- document_embeddings table ---
  const embeddingsBuilder = {
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue(
        thenable({ data: null, error: storeError ? "delete error" : null }),
      ),
    }),
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn((table: string) => {
      switch (table) {
        case "documents":
          // The categories query uses .select("category") and the initial
          // read uses .select("id, family_id, status, ocr_text").
          // We handle this in the select mock by checking the fields.
          return documentsBuilder;
        case "document_pages":
          return pagesBuilder;
        case "family_members":
          return membersBuilder;
        case "knowledge_nodes":
          return nodesBuilder;
        case "extracted_entities":
          return entitiesBuilder;
        case "tasks":
          return tasksBuilder;
        case "knowledge_edges":
          return edgesBuilder;
        case "document_embeddings":
          return embeddingsBuilder;
        default:
          throw new Error(`Unexpected table: ${table}`);
      }
    }),
    _operations: operations,
    _entitiesBuilder: entitiesBuilder,
    _tasksBuilder: tasksBuilder,
    _edgesBuilder: edgesBuilder,
    _embeddingsBuilder: embeddingsBuilder,
    _documentsBuilder: documentsBuilder,
  } as unknown as Awaited<ReturnType<typeof createServerClient>> & {
    _operations: Record<string, number>;
    _entitiesBuilder: { delete: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> };
    _tasksBuilder: { delete: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> };
    _edgesBuilder: { delete: ReturnType<typeof vi.fn> };
    _embeddingsBuilder: { delete: ReturnType<typeof vi.fn> };
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
// POST /api/documents/[id]/analyze
// ---------------------------------------------------------------------------

describe("POST /api/documents/[id]/analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: extraction succeeds.
    (runExtraction as ReturnType<typeof vi.fn>).mockResolvedValue(validAnalysis());
  });

  // --- Authentication ---

  it("returns 401 when unauthenticated", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ user: null }),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe("UNAUTHENTICATED");
    expect(runExtraction).not.toHaveBeenCalled();
  });

  // --- Document ID validation ---

  it("returns 400 for invalid document ID (not a UUID)", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );

    const response = await POST(
      new Request("http://localhost"),
      createParams("not-a-uuid"),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_DOCUMENT_ID");
  });

  // --- Document not found / not owned (403 vs 404) ---

  it("returns 404 when document truly does not exist (admin also finds nothing)", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ docNotFound: true }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({ docExists: false }),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe("DOCUMENT_NOT_FOUND");
    expect(runExtraction).not.toHaveBeenCalled();
  });

  it("returns 403 when document exists but belongs to another family (non-owner)", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ docNotFound: true }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({ docExists: true }),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
    expect(runExtraction).not.toHaveBeenCalled();
  });

  // --- Invalid status (409) ---

  it("returns 409 when document is in uploaded status", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ docStatus: "uploaded" }),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("INVALID_STATUS_TRANSITION");
    expect(runExtraction).not.toHaveBeenCalled();
  });

  it("returns 409 when document is in ocr_processing status", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ docStatus: "ocr_processing" }),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("INVALID_STATUS_TRANSITION");
    expect(runExtraction).not.toHaveBeenCalled();
  });

  it("returns 409 when document is in analyzing status", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ docStatus: "analyzing" }),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("INVALID_STATUS_TRANSITION");
    expect(runExtraction).not.toHaveBeenCalled();
  });

  // --- Empty OCR text (400) ---

  it("returns 400 when OCR text is empty (no pages, no ocr_text)", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        docOcrText: null,
        pages: [],
      }),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("NO_OCR_TEXT");
    expect(runExtraction).not.toHaveBeenCalled();
  });

  it("returns 400 when pages have empty markdown and ocr_text is null", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        docOcrText: null,
        pages: [{ ocr_markdown: null }, { ocr_markdown: "  " }],
      }),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("NO_OCR_TEXT");
    expect(runExtraction).not.toHaveBeenCalled();
  });

  it("falls back to documents.ocr_text when pages have no markdown", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        docOcrText: "Fallback OCR text from documents table",
        pages: [{ ocr_markdown: null }],
      }),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("analyzed");
  });

  // --- Success (200) ---

  it("returns 200 with the full analysis on success", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("analyzed");
    expect(body.document_id).toBe(VALID_DOC_ID);
    expect(body.document_type).toBe("letter");
    expect(body.title).toBe("Einladung zum Elternabend");
    expect(body.family_members).toHaveLength(1);
    expect(body.tasks).toHaveLength(1);
  });

  it("calls runExtraction with OCR text and family context", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );

    await POST(new Request("http://localhost"), createParams());

    expect(runExtraction).toHaveBeenCalledTimes(1);
    const [ocrText, familyContext] = (runExtraction as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(ocrText).toContain("OCR content");
    expect(familyContext.members).toBeDefined();
    expect(familyContext.members.length).toBeGreaterThan(0);
    expect(familyContext.categories).toBeDefined();
    expect(familyContext.knowledgeNodes).toBeDefined();
  });

  it("overrides needs_user_review based on confidence thresholds", async () => {
    const analysisWithLowConfidence = validAnalysis({
      family_members: [{ person_id: null, name: "Unbekannt", confidence: 0.3 }],
      needs_user_review: false, // LLM says false, but threshold should override
    });
    (runExtraction as ReturnType<typeof vi.fn>).mockResolvedValue(
      analysisWithLowConfidence,
    );
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.needs_user_review).toBe(true);
  });

  it("keeps needs_user_review false when all confidences are high", async () => {
    const analysisHighConfidence = validAnalysis({
      family_members: [{ person_id: "m1", name: "Emma", confidence: 0.95 }],
      needs_user_review: true, // LLM says true, but threshold should override to false
    });
    (runExtraction as ReturnType<typeof vi.fn>).mockResolvedValue(
      analysisHighConfidence,
    );
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.needs_user_review).toBe(false);
  });

  // --- Extraction failure (status=failed) ---

  it("sets status to failed and returns 502 when extraction fails", async () => {
    (runExtraction as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ExtractionError("OpenAI error", "OPENAI_API_ERROR", 500),
    );
    const client = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.code).toBe("OPENAI_API_ERROR");
    // markFailed should have been called.
    expect(client._operations.markFailed).toBeGreaterThanOrEqual(1);
  });

  it("sets status to failed on schema validation failure", async () => {
    (runExtraction as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ExtractionError("Schema validation failed", "OPENAI_SCHEMA_VALIDATION_FAILED"),
    );
    const client = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.code).toBe("OPENAI_SCHEMA_VALIDATION_FAILED");
    expect(client._operations.markFailed).toBeGreaterThanOrEqual(1);
  });

  // --- Analyze stuck-in-analyzing: context failure marks failed ---

  it("marks document failed and returns structured error when family-context fetch fails after transition", async () => {
    const client = mockServerClient({ membersError: true });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    // The document should be marked as failed (not stuck in 'analyzing').
    expect(response.status).toBe(500);
    expect(body.code).toBe("ANALYSIS_FAILED");
    expect(client._operations.markFailed).toBeGreaterThanOrEqual(1);
    // OpenAI extraction should NOT have been called (context fetch failed first).
    expect(runExtraction).not.toHaveBeenCalled();
  });

  // --- Re-analyze (clear prior results) ---

  it("clears prior extracted_entities and tasks on re-analyze from analyzed", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ docStatus: "analyzed" }),
    );

    const response = await POST(new Request("http://localhost"), createParams());

    expect(response.status).toBe(200);
    // The delete operations should have been called.
  });

  it("clears knowledge_edges and document_embeddings on re-analyze from confirmed", async () => {
    const client = mockServerClient({ docStatus: "confirmed" });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const response = await POST(new Request("http://localhost"), createParams());

    expect(response.status).toBe(200);
    expect(client._edgesBuilder.delete).toHaveBeenCalled();
    expect(client._embeddingsBuilder.delete).toHaveBeenCalled();
  });

  it("does NOT clear knowledge_edges when re-analyzing from ocr_done (not confirmed)", async () => {
    const client = mockServerClient({ docStatus: "ocr_done" });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const response = await POST(new Request("http://localhost"), createParams());

    expect(response.status).toBe(200);
    expect(client._edgesBuilder.delete).not.toHaveBeenCalled();
    expect(client._embeddingsBuilder.delete).not.toHaveBeenCalled();
  });

  // --- Re-analyze from confirmed status works ---

  it("accepts re-analyze from confirmed status and transitions to analyzed", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ docStatus: "confirmed" }),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("analyzed");
  });

  // --- Re-analyze from failed status works ---

  it("accepts re-analyze from failed status", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ docStatus: "failed" }),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("analyzed");
  });

  // --- Atomic transition failure (concurrent request) ---

  it("returns 409 when atomic transition fails (concurrent status change)", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ transitionSuccess: false }),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("STATUS_CHANGED");
    expect(runExtraction).not.toHaveBeenCalled();
  });

  // --- Store failure ---

  it("sets status to failed when storing results fails", async () => {
    const client = mockServerClient({ storeError: true });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const response = await POST(new Request("http://localhost"), createParams());

    expect(response.status).toBe(500);
    expect(client._operations.markFailed).toBeGreaterThanOrEqual(1);
  });

  // --- Final update failure ---

  it("sets status to failed when final status update fails", async () => {
    const client = mockServerClient({ finalUpdateError: true });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("DB_UPDATE_FAILED");
  });

  // --- API key not exposed ---

  it("does not include OPENAI_API_KEY in the response body", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const bodyText = await response.text();

    expect(bodyText).not.toContain("OPENAI_API_KEY");
    expect(bodyText).not.toContain("sk-");
  });

  // --- Method not allowed ---

  it("GET returns 405", async () => {
    const { GET } = await import("@/app/api/documents/[id]/analyze/route");
    const response = await GET();
    expect(response.status).toBe(405);
  });

  // --- Entities stored correctly ---

  it("stores extracted entities for persons, organizations, dates, amounts, category, and tags", async () => {
    const client = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const analysisWithAllEntities = validAnalysis({
      family_members: [{ person_id: "m1", name: "Emma", confidence: 0.9 }],
      organizations: [{ name: "Kita Sonne", type: "Kita", confidence: 0.85 }],
      dates: [{ date: "2026-07-15", type: "event", label: "Termin", confidence: 0.8 }],
      amounts: [{ amount: "25.00", currency: "EUR", label: "Gebühr", confidence: 0.9 }],
      suggested_category: "Kita",
      tags: ["Elternabend", "Kita"],
    });
    (runExtraction as ReturnType<typeof vi.fn>).mockResolvedValue(
      analysisWithAllEntities,
    );

    await POST(new Request("http://localhost"), createParams());

    // The insert should have been called with entity rows.
    expect(client._entitiesBuilder.insert).toHaveBeenCalledTimes(1);
    const insertArg = client._entitiesBuilder.insert.mock.calls[0][0];
    // 1 person + 1 org + 1 date + 1 amount + 1 category + 2 tags = 7 entities
    expect(insertArg).toHaveLength(7);
    // Check entity types.
    const types = insertArg.map((e: { entity_type: string }) => e.entity_type);
    expect(types).toContain("person");
    expect(types).toContain("organization");
    expect(types).toContain("date");
    expect(types).toContain("amount");
    expect(types).toContain("category");
    expect(types.filter((t: string) => t === "tag")).toHaveLength(2);
  });

  it("stores tasks with correct fields", async () => {
    const client = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    await POST(new Request("http://localhost"), createParams());

    expect(client._tasksBuilder.insert).toHaveBeenCalledTimes(1);
    const insertArg = client._tasksBuilder.insert.mock.calls[0][0];
    expect(insertArg).toHaveLength(1);
    expect(insertArg[0].title).toBe("Elternabend besuchen");
    expect(insertArg[0].priority).toBe("medium");
    expect(insertArg[0].status).toBe("open");
    expect(insertArg[0].family_id).toBe(FAMILY_ID);
    expect(insertArg[0].document_id).toBe(VALID_DOC_ID);
  });

  it("updates document with title, summary, document_type, and category", async () => {
    const client = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    await POST(new Request("http://localhost"), createParams());

    // Find the final update call (status: "analyzed").
    const updateCalls = client._documentsBuilder.update.mock.calls;
    const finalUpdateCall = updateCalls.find(
      (call: unknown[]) => {
        const payload = call[0] as Record<string, unknown>;
        return payload.status === "analyzed";
      },
    );
    expect(finalUpdateCall).toBeDefined();
    const payload = finalUpdateCall![0] as Record<string, unknown>;
    expect(payload.title).toBe("Einladung zum Elternabend");
    expect(payload.summary).toBe("Elternabend in der Kita Sonnenblume am 15. Juli 2026.");
    expect(payload.document_type).toBe("letter");
    expect(payload.category).toBe("Kita");
  });
});
