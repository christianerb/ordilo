import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase clients and OCR client before importing the route.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/ai/ocr", () => ({
  runOcr: vi.fn(),
  DatalabOcrError: class DatalabOcrError extends Error {
    code: string;
    statusCode?: number;
    constructor(message: string, code: string, statusCode?: number) {
      super(message);
      this.name = "DatalabOcrError";
      this.code = code;
      this.statusCode = statusCode;
    }
  },
}));

import { POST } from "@/app/api/documents/[id]/ocr/route";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { runOcr, DatalabOcrError } from "@/lib/ai/ocr";
import type { OcrResult } from "@/lib/ai/ocr";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const VALID_DOC_ID = "550e8400-e29b-41d4-a716-446655440000";
const FAMILY_ID = "660e8400-e29b-41d4-a716-446655440001";

/** Create route params promise for the document ID. */
function createParams(id: string = VALID_DOC_ID) {
  return { params: Promise.resolve({ id }) };
}

/** Build a mock document row. */
function mockDocumentRow(overrides: Partial<{
  id: string;
  family_id: string;
  status: string;
  file_url: string;
  original_filename: string | null;
  mime_type: string | null;
  error_message: string | null;
}> = {}) {
  return {
    id: VALID_DOC_ID,
    family_id: FAMILY_ID,
    uploaded_by: "user-1",
    title: null,
    document_type: null,
    category: null,
    status: "uploaded",
    file_url: `${FAMILY_ID}/${VALID_DOC_ID}/test.pdf`,
    original_filename: "test.pdf",
    mime_type: "application/pdf",
    page_count: null,
    ocr_text: null,
    summary: null,
    error_message: null,
    created_at: "2026-07-04T12:00:00Z",
    confirmed_at: null,
    ...overrides,
  };
}

/**
 * Build a mock server Supabase client that supports the atomic conditional
 * update pattern used by the OCR route.
 *
 * The route performs these DB operations on the `documents` table:
 *   1. Atomic transition: .update({status:"ocr_processing"}).eq("id",...).in("status",[...]).select().maybeSingle()
 *      → returns the updated doc (or null if 0 rows matched)
 *   2. Follow-up read (if transition returned null): .select("id, status").eq("id",...).maybeSingle()
 *      → returns {id, status} or null (to distinguish 404 vs 409)
 *   3. Final update: .update({status:"ocr_done",...}).eq("id",...)
 *      → awaited directly (thenable), returns {data, error}
 *   4. markFailed: .update({status:"failed",...}).eq("id",...)
 *      → awaited directly (thenable), returns {data, error}
 *
 * The mock distinguishes these by inspecting the update payload's `status` field.
 */
function mockServerClient(options: {
  user?: { id: string; email: string } | null;
  /** Document returned by the atomic transition (null = 0 rows updated). */
  transitionDoc?: ReturnType<typeof mockDocumentRow> | null;
  transitionError?: unknown;
  /** Document found in the follow-up read (null = not found / RLS blocked). */
  followUpDoc?: { id: string; status: string } | null;
  followUpError?: unknown;
  /** Error for the final ocr_done update. */
  finalUpdateError?: unknown;
  /** Error for document_pages insert. */
  pagesInsertError?: unknown;
  /** Error for document_pages delete. */
  pagesDeleteError?: unknown;
} = {}) {
  const {
    user = { id: "user-1", email: "test@ordilo.test" },
    transitionDoc = mockDocumentRow(),
    transitionError = null,
    followUpDoc = null,
    followUpError = null,
    finalUpdateError = null,
    pagesInsertError = null,
    pagesDeleteError = null,
  } = options;

  // document_pages insert — the route does `await .insert(pageInserts)`
  // directly (no chaining), so insert must return a Promise.
  const pagesInsertMock = vi.fn().mockResolvedValue({
    data: null,
    error: pagesInsertError,
  });

  // document_pages delete — the route does
  // `await .delete().eq("document_id", documentId)` so delete returns
  // a chain with .eq() that resolves to { data, error }.
  const pagesDeleteEqMock = vi.fn().mockResolvedValue({
    data: null,
    error: pagesDeleteError,
  });
  const pagesDeleteMock = vi.fn().mockReturnValue({
    eq: pagesDeleteEqMock,
  });

  // Build the documents table builder.
  const documentsBuilder = {
    // Select chain (for the follow-up read).
    select: vi.fn(() => ({
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: followUpDoc ?? null,
        error: followUpError ?? null,
      }),
    })),
    // Update chain (for atomic transition, final update, markFailed).
    // Distinguished by the payload's status field.
    update: vi.fn((payload: Record<string, unknown>) => {
      const isTransition = payload.status === "ocr_processing";
      const isFinalUpdate = payload.status === "ocr_done";

      // Build a thenable chain that supports .eq().in().select().maybeSingle()
      // and also direct await (for final update and markFailed).
      const chain: Record<string, unknown> = {
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue(
          isTransition
            ? { data: transitionDoc, error: transitionError }
            : { data: null, error: null },
        ),
      };

      // Make the chain thenable for direct await (final update, markFailed).
      // When `await chain` is called, JS calls chain.then(resolve, reject).
      chain.then = vi.fn(
        (resolve: (value: unknown) => void, reject?: (reason?: unknown) => void) => {
          const error = isFinalUpdate ? finalUpdateError ?? null : null;
          return Promise.resolve({ data: null, error }).then(resolve, reject);
        },
      );

      return chain;
    }),
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn((table: string) => {
      if (table === "documents") return documentsBuilder;
      if (table === "document_pages") return { insert: pagesInsertMock, delete: pagesDeleteMock };
      throw new Error(`Unexpected table: ${table}`);
    }),
    // Expose the pages insert/delete mocks for test assertions.
    _pagesInsertMock: pagesInsertMock,
    _pagesDeleteMock: pagesDeleteMock,
    _pagesDeleteEqMock: pagesDeleteEqMock,
    _documentsBuilder: documentsBuilder,
  } as unknown as Awaited<ReturnType<typeof createServerClient>> & {
    _pagesInsertMock: typeof pagesInsertMock;
    _pagesDeleteMock: typeof pagesDeleteMock;
    _pagesDeleteEqMock: typeof pagesDeleteEqMock;
    _documentsBuilder: typeof documentsBuilder;
  };
}

/** Build a mock admin Supabase client. */
function mockAdminClient(options: {
  downloadError?: unknown;
  downloadData?: Blob | null;
}) {
  const downloadMock = vi.fn().mockResolvedValue({
    data: options.downloadData ?? new Blob(["fake pdf"]),
    error: options.downloadError ?? null,
  });

  return {
    storage: {
      from: vi.fn(() => ({ download: downloadMock })),
    },
  } as unknown as Awaited<ReturnType<typeof createAdminClient>>;
}

/** Build a mock OcrResult with per-page layout data. */
function mockOcrResult(pageCount: number = 1): OcrResult {
  const pages = Array.from({ length: pageCount }, (_, i) => ({
    page_number: i + 1,
    ocr_markdown: `# Page ${i + 1}\n\nContent for page ${i + 1}`,
    // Per-page layout_json (page-specific, NOT document-level metadata)
    layout_json: {
      block_type: "Page",
      page_id: i,
      children: [
        {
          block_type: "Text",
          html: `<p>Content for page ${i + 1}</p>`,
          bbox: [0, i * 100, 500, i * 100 + 100],
        },
      ],
    } as Record<string, unknown>,
  }));
  return {
    pages,
    page_count: pageCount,
    full_markdown: pages.map((p) => p.ocr_markdown).join("\n\n"),
    // Document-level metadata (separate from per-page layout)
    metadata: { quality: 4.5, cost: 10 },
  };
}

// ---------------------------------------------------------------------------
// POST /api/documents/[id]/ocr
// ---------------------------------------------------------------------------

describe("POST /api/documents/[id]/ocr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Authentication ---

  it("returns 401 when unauthenticated", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ user: null }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe("UNAUTHENTICATED");
  });

  // --- Document ID validation ---

  it("returns 400 for invalid document ID (not a UUID)", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );

    const response = await POST(
      new Request("http://localhost"),
      createParams("not-a-uuid"),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_DOCUMENT_ID");
  });

  // --- Document not found (RLS) ---

  it("returns 404 when document is not found (RLS blocks non-owner)", async () => {
    // Atomic transition returns null (0 rows updated), follow-up returns null
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        transitionDoc: null,
        followUpDoc: null,
      }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe("DOCUMENT_NOT_FOUND");
    expect(runOcr).not.toHaveBeenCalled();
  });

  // --- State machine: invalid source states ---

  it("returns 409 when document is not in uploaded or failed status", async () => {
    // Atomic transition returns null (wrong status), follow-up shows the doc
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        transitionDoc: null,
        followUpDoc: { id: VALID_DOC_ID, status: "ocr_done" },
      }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("INVALID_STATUS_TRANSITION");
    expect(runOcr).not.toHaveBeenCalled();
  });

  it("returns 409 when document is already confirmed", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        transitionDoc: null,
        followUpDoc: { id: VALID_DOC_ID, status: "confirmed" },
      }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    expect(response.status).toBe(409);
  });

  // --- Concurrent double-start rejection (atomic transition) ---

  it("returns 409 when another concurrent request already moved to ocr_processing", async () => {
    // Simulates a race: the atomic transition finds the document already
    // in ocr_processing (not in ['uploaded', 'failed']), so 0 rows are updated.
    // The follow-up read confirms the document exists but is in ocr_processing.
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        transitionDoc: null, // 0 rows updated (already ocr_processing)
        followUpDoc: { id: VALID_DOC_ID, status: "ocr_processing" },
      }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("INVALID_STATUS_TRANSITION");
    // Crucially, runOcr is NOT called — the second request is rejected
    expect(runOcr).not.toHaveBeenCalled();
  });

  it("atomic transition prevents two concurrent OCR starts from both proceeding", async () => {
    // This test verifies the atomic conditional update pattern: if the
    // transition returns null (because another request got there first),
    // the route does NOT proceed to download or call Datalab.
    const serverClient = mockServerClient({
      transitionDoc: null,
      followUpDoc: { id: VALID_DOC_ID, status: "ocr_processing" },
    });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(serverClient);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );

    await POST(new Request("http://localhost"), createParams());

    // The update was called (the atomic transition attempt)
    expect(serverClient._documentsBuilder.update).toHaveBeenCalled();
    // But runOcr was NOT called (the transition failed)
    expect(runOcr).not.toHaveBeenCalled();
  });

  // --- Retry from failed status ---

  it("allows retry from failed status", async () => {
    // The atomic transition succeeds: the document is in 'failed' state,
    // which is in the allowed set, so the update matches and returns the doc.
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        transitionDoc: mockDocumentRow({ status: "ocr_processing", error_message: null }),
      }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );
    (runOcr as ReturnType<typeof vi.fn>).mockResolvedValue(mockOcrResult(1));

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ocr_done");
  });

  // --- Status transition to ocr_processing before Datalab call ---

  it("transitions document to ocr_processing before Datalab call", async () => {
    const serverClient = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(serverClient);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );

    let runOcrCalled = false;
    (runOcr as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      runOcrCalled = true;
      return mockOcrResult(1);
    });

    await POST(new Request("http://localhost"), createParams());

    // runOcr was called (meaning the route proceeded past the transition).
    expect(runOcrCalled).toBe(true);
    // The documents table update was called for the atomic transition
    expect(serverClient._documentsBuilder.update).toHaveBeenCalled();
    // Verify the transition update payload sets ocr_processing
    const updateCalls = serverClient._documentsBuilder.update.mock.calls;
    const transitionCall = updateCalls.find(
      ([payload]: [Record<string, unknown>]) => payload.status === "ocr_processing",
    );
    expect(transitionCall).toBeDefined();
  });

  // --- Storage download failure ---

  it("marks document as failed and returns 500 when Storage download fails", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({ downloadError: new Error("Storage error"), downloadData: null }),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("STORAGE_DOWNLOAD_FAILED");
    expect(runOcr).not.toHaveBeenCalled();
  });

  // --- Datalab OCR failure ---

  it("marks document as failed and returns 502 when Datalab OCR fails", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );
    (runOcr as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DatalabOcrError("Conversion failed", "DATALAB_CONVERSION_FAILED"),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.code).toBe("DATALAB_CONVERSION_FAILED");
  });

  it("marks document as failed on Datalab timeout", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );
    (runOcr as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DatalabOcrError("Timeout", "DATALAB_TIMEOUT"),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.code).toBe("DATALAB_TIMEOUT");
  });

  it("returns 429 for Datalab rate limit (passes through 4xx)", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );
    (runOcr as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DatalabOcrError("Rate limited", "DATALAB_RATE_LIMITED", 429),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    expect(response.status).toBe(429);
  });

  it("marks document as failed on PAGE_COUNT_MISMATCH", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );
    (runOcr as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DatalabOcrError(
        "OCR-Ergebnisse konnten nicht sicher auf alle gemeldeten Seiten abgebildet werden.",
        "PAGE_COUNT_MISMATCH",
      ),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.code).toBe("PAGE_COUNT_MISMATCH");
  });

  // --- DB insert failure for document_pages ---

  it("marks document as failed when document_pages insert fails", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ pagesInsertError: new Error("DB error") }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );
    (runOcr as ReturnType<typeof vi.fn>).mockResolvedValue(mockOcrResult(2));

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.code).toBe("DB_INSERT_FAILED");
  });

  // --- Persistence hardening: delete-before-insert + cleanup ---

  it("deletes existing document_pages before inserting new ones (retry idempotency)", async () => {
    const serverClient = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(serverClient);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );
    (runOcr as ReturnType<typeof vi.fn>).mockResolvedValue(mockOcrResult(3));

    await POST(new Request("http://localhost"), createParams());

    // The delete mock should have been called (to clear prior pages)
    expect(serverClient._pagesDeleteMock).toHaveBeenCalled();
    // The delete should filter by document_id
    expect(serverClient._pagesDeleteEqMock).toHaveBeenCalledWith(
      "document_id",
      VALID_DOC_ID,
    );
    // The insert should also have been called
    expect(serverClient._pagesInsertMock).toHaveBeenCalled();
  });

  it("deletes document_pages even when OCR result has zero pages", async () => {
    const serverClient = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(serverClient);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );
    // Empty OCR result (e.g. blank document)
    (runOcr as ReturnType<typeof vi.fn>).mockResolvedValue({
      pages: [],
      page_count: 0,
      full_markdown: "",
      metadata: null,
    });

    await POST(new Request("http://localhost"), createParams());

    // Delete should still be called to clear any prior pages from a
    // previous OCR attempt (retry scenario).
    expect(serverClient._pagesDeleteMock).toHaveBeenCalled();
    // Insert should NOT be called (no pages to insert)
    expect(serverClient._pagesInsertMock).not.toHaveBeenCalled();
  });

  it("cleans up document_pages when document status update fails (no orphaned rows)", async () => {
    const serverClient = mockServerClient({
      finalUpdateError: new Error("DB update error"),
    });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(serverClient);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );
    (runOcr as ReturnType<typeof vi.fn>).mockResolvedValue(mockOcrResult(2));

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.code).toBe("DB_UPDATE_FAILED");

    // The delete should have been called TWICE:
    // 1. Before insert (clear prior pages)
    // 2. After update failure (cleanup orphaned pages)
    expect(serverClient._pagesDeleteMock).toHaveBeenCalledTimes(2);
    // Both deletes should filter by document_id
    expect(serverClient._pagesDeleteEqMock).toHaveBeenCalledTimes(2);
    expect(serverClient._pagesDeleteEqMock).toHaveBeenNthCalledWith(
      1,
      "document_id",
      VALID_DOC_ID,
    );
    expect(serverClient._pagesDeleteEqMock).toHaveBeenNthCalledWith(
      2,
      "document_id",
      VALID_DOC_ID,
    );
  });

  it("does not leave duplicate document_pages on retry (delete runs before insert)", async () => {
    const serverClient = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(serverClient);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );
    (runOcr as ReturnType<typeof vi.fn>).mockResolvedValue(mockOcrResult(2));

    await POST(new Request("http://localhost"), createParams());

    // Verify the order: delete was called before insert
    // The route calls .delete() first (to clear prior pages), then .insert()
    expect(serverClient._pagesDeleteMock).toHaveBeenCalledBefore(
      serverClient._pagesInsertMock,
    );
  });

  // --- Success ---

  it("returns 200 with { status: ocr_done, page_count } on success (single page)", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );
    (runOcr as ReturnType<typeof vi.fn>).mockResolvedValue(mockOcrResult(1));

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ocr_done");
    expect(body.page_count).toBe(1);
  });

  it("returns 200 with page_count for multi-page PDF", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );
    (runOcr as ReturnType<typeof vi.fn>).mockResolvedValue(mockOcrResult(5));

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ocr_done");
    expect(body.page_count).toBe(5);
  });

  it("stores results immediately (calls document_pages insert before returning)", async () => {
    const serverClient = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(serverClient);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );
    (runOcr as ReturnType<typeof vi.fn>).mockResolvedValue(mockOcrResult(3));

    await POST(new Request("http://localhost"), createParams());

    expect(serverClient.from).toHaveBeenCalledWith("document_pages");
    expect(serverClient._pagesInsertMock).toHaveBeenCalled();
  });

  // --- Per-page layout persistence ---

  it("persists per-page layout_json (page-specific, not document-level metadata)", async () => {
    const serverClient = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(serverClient);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );
    const ocrResult = mockOcrResult(3);
    (runOcr as ReturnType<typeof vi.fn>).mockResolvedValue(ocrResult);

    await POST(new Request("http://localhost"), createParams());

    // Verify the insert was called with per-page layout data
    const insertCall = serverClient._pagesInsertMock.mock.calls[0];
    const insertedPages = insertCall[0] as Array<{
      document_id: string;
      page_number: number;
      ocr_markdown: string;
      layout_json: Record<string, unknown> | null;
    }>;

    expect(insertedPages).toHaveLength(3);

    // Each page should have page-specific layout_json (not the shared metadata)
    expect(insertedPages[0].layout_json).not.toBeNull();
    expect(insertedPages[1].layout_json).not.toBeNull();
    expect(insertedPages[2].layout_json).not.toBeNull();

    // Each page's layout_json should be page-specific (different page_id)
    expect(insertedPages[0].layout_json!.page_id).toBe(0);
    expect(insertedPages[1].layout_json!.page_id).toBe(1);
    expect(insertedPages[2].layout_json!.page_id).toBe(2);

    // layout_json should NOT be the document-level metadata object
    expect(insertedPages[0].layout_json).not.toEqual(ocrResult.metadata);
    expect(insertedPages[1].layout_json).not.toEqual(ocrResult.metadata);
    expect(insertedPages[2].layout_json).not.toEqual(ocrResult.metadata);

    // Page numbers should be contiguous 1, 2, 3
    expect(insertedPages[0].page_number).toBe(1);
    expect(insertedPages[1].page_number).toBe(2);
    expect(insertedPages[2].page_number).toBe(3);
  });

  it("multi-page document gets one document_pages row per reported page", async () => {
    const serverClient = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(serverClient);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );
    (runOcr as ReturnType<typeof vi.fn>).mockResolvedValue(mockOcrResult(7));

    await POST(new Request("http://localhost"), createParams());

    const insertCall = serverClient._pagesInsertMock.mock.calls[0];
    const insertedPages = insertCall[0] as Array<{ page_number: number }>;

    // Exactly 7 rows, one per page, with contiguous page numbers 1..7
    expect(insertedPages).toHaveLength(7);
    for (let i = 0; i < 7; i++) {
      expect(insertedPages[i].page_number).toBe(i + 1);
    }
  });

  // --- Error response shape ---

  it("error responses include both error and code fields", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        transitionDoc: null,
        followUpDoc: null,
      }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(body).toHaveProperty("error");
    expect(body).toHaveProperty("code");
    expect(typeof body.error).toBe("string");
    expect(typeof body.code).toBe("string");
  });

  // --- GET method ---

  it("GET returns 405 method not allowed", async () => {
    const { GET } = await import("@/app/api/documents/[id]/ocr/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(405);
    expect(body.code).toBe("METHOD_NOT_ALLOWED");
  });
});
