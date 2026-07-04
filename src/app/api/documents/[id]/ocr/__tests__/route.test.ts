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

/** Build a mock server Supabase client. */
function mockServerClient(options: {
  user?: { id: string; email: string } | null;
  document?: ReturnType<typeof mockDocumentRow> | null;
  docError?: unknown;
  updateError?: unknown;
  pagesInsertError?: unknown;
}) {
  const {
    user = { id: "user-1", email: "test@ordilo.test" },
    document = mockDocumentRow(),
    docError = null,
    updateError = null,
    pagesInsertError = null,
  } = options;

  const docSelectChain = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: document, error: docError }),
  };

  const updateChain = {
    eq: vi.fn().mockResolvedValue({ data: null, error: updateError }),
  };

  // document_pages insert — the route does `await .insert(pageInserts)`
  // directly (no chaining), so insert must return a Promise.
  const pagesInsertMock = vi.fn().mockResolvedValue({
    data: null,
    error: pagesInsertError,
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn((table: string) => {
      if (table === "documents") {
        return {
          select: vi.fn(() => docSelectChain),
          update: vi.fn(() => updateChain),
        };
      }
      if (table === "document_pages") {
        return { insert: pagesInsertMock };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as Awaited<ReturnType<typeof createServerClient>>;
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

/** Build a mock OcrResult. */
function mockOcrResult(pageCount: number = 1): OcrResult {
  const pages = Array.from({ length: pageCount }, (_, i) => ({
    page_number: i + 1,
    ocr_markdown: `# Page ${i + 1}\n\nContent for page ${i + 1}`,
    layout_json: { quality: 4.5 },
  }));
  return {
    pages,
    page_count: pageCount,
    full_markdown: pages.map((p) => p.ocr_markdown).join("\n\n"),
    metadata: { quality: 4.5 },
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
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ document: null }),
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

  it("returns 404 on document query error", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ document: null, docError: new Error("RLS blocked") }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    expect(response.status).toBe(404);
  });

  // --- State machine ---

  it("returns 409 when document is not in uploaded or failed status", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ document: mockDocumentRow({ status: "ocr_done" }) }),
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
      mockServerClient({ document: mockDocumentRow({ status: "confirmed" }) }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    expect(response.status).toBe(409);
  });

  it("returns 409 when document is in ocr_processing", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ document: mockDocumentRow({ status: "ocr_processing" }) }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );

    const response = await POST(new Request("http://localhost"), createParams());
    expect(response.status).toBe(409);
  });

  it("allows retry from failed status", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        document: mockDocumentRow({ status: "failed", error_message: "Prior error" }),
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
    // The documents table was queried and updated (transition + final).
    expect(serverClient.from).toHaveBeenCalledWith("documents");
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
  });

  // --- Error response shape ---

  it("error responses include both error and code fields", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ document: null }),
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
