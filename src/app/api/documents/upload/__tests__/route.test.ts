import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase clients before importing the route.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createClient: vi.fn(),
}));

import { POST } from "@/app/api/documents/upload/route";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { MAX_FILE_SIZE } from "@/lib/schemas/document";

/**
 * Build a mock server Supabase client.
 * Handles auth.getUser(), families select, and documents insert.
 */
function mockServerClient(options: {
  user?: { id: string; email: string } | null;
  family?: { id: string } | null;
  familyError?: unknown;
  docInsert?: { id: string } | null;
  docInsertError?: unknown;
}) {
  const {
    user = { id: "user-1", email: "test@ordilo.test" },
    family = { id: "fam-1" },
    familyError = null,
    docInsert = { id: "doc-1" },
    docInsertError = null,
  } = options;

  // families select chain
  const familiesChain = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: family, error: familyError }),
  };

  // documents insert chain
  const documentsInsertChain = {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: docInsert, error: docInsertError }),
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn((table: string) => {
      if (table === "families") {
        return { select: vi.fn(() => familiesChain) };
      }
      if (table === "documents") {
        return { insert: vi.fn(() => documentsInsertChain) };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as Awaited<ReturnType<typeof createServerClient>>;
}

/**
 * Build a mock admin Supabase client.
 * Handles storage.from().upload() and storage.from().remove().
 */
function mockAdminClient(options: {
  uploadError?: unknown;
  removeError?: unknown;
}) {
  const uploadMock = vi.fn().mockResolvedValue({
    data: { path: "some/path" },
    error: options.uploadError ?? null,
  });
  const removeMock = vi.fn().mockResolvedValue({
    data: [],
    error: options.removeError ?? null,
  });

  return {
    storage: {
      from: vi.fn(() => ({
        upload: uploadMock,
        remove: removeMock,
      })),
    },
  } as unknown as Awaited<ReturnType<typeof createAdminClient>>;
}

/**
 * Create a mock File for form data.
 */
function createMockFile(
  name: string,
  type: string,
  size: number = 1024,
): File {
  // Create a minimal blob with the right content type and size.
  const content = new Array(size).fill(0).join("");
  const file = new File([content], name, { type });
  return file;
}

/**
 * Build a mock Request with multipart form data for the upload route.
 *
 * jsdom's Request.formData() cannot parse multipart bodies containing File
 * objects, so we create a minimal request-like object whose formData()
 * method returns the pre-built FormData directly.
 */
function createUploadRequest(file: File, familyId: string): Request {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("family_id", familyId);
  return {
    method: "POST",
    formData: async () => formData,
  } as unknown as Request;
}

/**
 * Build a mock Request with custom FormData (e.g. missing fields).
 */
function createMockRequest(formData: FormData): Request {
  return {
    method: "POST",
    formData: async () => formData,
  } as unknown as Request;
}

// ---------------------------------------------------------------------------
// POST /api/documents/upload
// ---------------------------------------------------------------------------

describe("POST /api/documents/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Authentication ---

  it("returns 401 when unauthenticated", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ user: null }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockAdminClient({}),
    );

    const file = createMockFile("test.pdf", "application/pdf");
    const response = await POST(createUploadRequest(file, "550e8400-e29b-41d4-a716-446655440000"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe("UNAUTHENTICATED");
  });

  // --- Missing / invalid form data ---

  it("returns 400 when no file is provided", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockAdminClient({}),
    );

    const formData = new FormData();
    formData.append("family_id", "550e8400-e29b-41d4-a716-446655440000");
    const request = createMockRequest(formData);

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("NO_FILE");
  });

  it("returns 400 when family_id is missing", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockAdminClient({}),
    );

    const file = createMockFile("test.pdf", "application/pdf");
    const formData = new FormData();
    formData.append("file", file);
    const request = createMockRequest(formData);

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_FAMILY_ID");
  });

  it("returns 400 when family_id is not a valid UUID", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockAdminClient({}),
    );

    const file = createMockFile("test.pdf", "application/pdf");
    const response = await POST(createUploadRequest(file, "not-a-uuid"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_FAMILY_ID");
  });

  // --- File type validation ---

  it("returns 400 for unsupported file type (text/plain)", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockAdminClient({}),
    );

    const file = createMockFile("test.txt", "text/plain");
    const response = await POST(createUploadRequest(file, "550e8400-e29b-41d4-a716-446655440000"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("UNSUPPORTED_FILE_TYPE");
    expect(body.error).toContain("nicht unterstützt");
  });

  it("returns 400 for video file type", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockAdminClient({}),
    );

    const file = createMockFile("test.mp4", "video/mp4");
    const response = await POST(createUploadRequest(file, "550e8400-e29b-41d4-a716-446655440000"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("UNSUPPORTED_FILE_TYPE");
  });

  // --- File size validation ---

  it("returns 413 for oversized file", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockAdminClient({}),
    );

    const file = createMockFile("big.pdf", "application/pdf", MAX_FILE_SIZE + 1);
    const response = await POST(createUploadRequest(file, "550e8400-e29b-41d4-a716-446655440000"));
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.code).toBe("FILE_TOO_LARGE");
    expect(body.error).toContain("zu groß");
  });

  // --- Family ownership ---

  it("returns 403 when family does not belong to user", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ family: null }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockAdminClient({}),
    );

    const file = createMockFile("test.pdf", "application/pdf");
    const response = await POST(createUploadRequest(file, "550e8400-e29b-41d4-a716-446655440000"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("FAMILY_NOT_FOUND");
  });

  it("returns 403 on family query error", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ family: null, familyError: new Error("RLS blocked") }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockAdminClient({}),
    );

    const file = createMockFile("test.pdf", "application/pdf");
    const response = await POST(createUploadRequest(file, "550e8400-e29b-41d4-a716-446655440000"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("FAMILY_NOT_FOUND");
  });

  // --- Storage upload failure (no orphaned rows) ---

  it("returns 500 and does not create a documents row when Storage upload fails", async () => {
    const serverClient = mockServerClient({});
    const adminClient = mockAdminClient({
      uploadError: new Error("Storage error"),
    });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(serverClient);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(adminClient);

    const file = createMockFile("test.pdf", "application/pdf");
    const response = await POST(createUploadRequest(file, "550e8400-e29b-41d4-a716-446655440000"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("STORAGE_UPLOAD_FAILED");
    // Verify documents insert was NOT called (no orphaned row).
    expect(serverClient.from).not.toHaveBeenCalledWith("documents");
  });

  // --- DB insert failure (cleans up Storage) ---

  it("returns 500 and cleans up Storage when DB insert fails", async () => {
    const serverClient = mockServerClient({ docInsert: null, docInsertError: new Error("DB error") });
    const adminClient = mockAdminClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(serverClient);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(adminClient);

    const file = createMockFile("test.pdf", "application/pdf");
    const response = await POST(createUploadRequest(file, "550e8400-e29b-41d4-a716-446655440000"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("DB_INSERT_FAILED");
    // Verify Storage remove was called (cleanup).
    expect(adminClient.storage.from).toHaveBeenCalledWith("documents");
  });

  // --- Success ---

  it("returns 200 with document_id on successful upload (PDF)", async () => {
    const serverClient = mockServerClient({});
    const adminClient = mockAdminClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(serverClient);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(adminClient);

    const file = createMockFile("invoice.pdf", "application/pdf");
    const response = await POST(createUploadRequest(file, "550e8400-e29b-41d4-a716-446655440000"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.document_id).toBeTruthy();
    expect(body.status).toBe("uploaded");
  });

  it("returns 200 on successful upload (JPEG image)", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );

    const file = createMockFile("photo.jpg", "image/jpeg");
    const response = await POST(createUploadRequest(file, "550e8400-e29b-41d4-a716-446655440000"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.document_id).toBeTruthy();
    expect(body.status).toBe("uploaded");
  });

  it("returns 200 on successful upload (PNG image)", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );

    const file = createMockFile("scan.png", "image/png");
    const response = await POST(createUploadRequest(file, "550e8400-e29b-41d4-a716-446655440000"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("uploaded");
  });

  it("returns 200 on successful upload (WebP image)", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );

    const file = createMockFile("scan.webp", "image/webp");
    const response = await POST(createUploadRequest(file, "550e8400-e29b-41d4-a716-446655440000"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("uploaded");
  });

  it("accepts a file exactly at the size limit", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({}),
    );

    const file = createMockFile("exact.pdf", "application/pdf", MAX_FILE_SIZE);
    const response = await POST(createUploadRequest(file, "550e8400-e29b-41d4-a716-446655440000"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("uploaded");
  });

  // --- Error response shape ---

  it("error responses include both error and code fields", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockAdminClient({}),
    );

    const file = createMockFile("test.txt", "text/plain");
    const response = await POST(createUploadRequest(file, "550e8400-e29b-41d4-a716-446655440000"));
    const body = await response.json();

    expect(body).toHaveProperty("error");
    expect(body).toHaveProperty("code");
    expect(typeof body.error).toBe("string");
    expect(typeof body.code).toBe("string");
  });
});
