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
 * Magic bytes for each accepted file type, used to create mock files with
 * valid file signatures for the upload route's magic-byte validation.
 */
const MAGIC_BYTES: Record<string, number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46], // %PDF
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/webp": [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x10, 0x00, 0x57, 0x45, 0x42, 0x50],
  "image/gif": [0x47, 0x49, 0x46, 0x38],
};

/**
 * Create a mock File for form data with valid magic bytes for the given type.
 */
function createMockFile(
  name: string,
  type: string,
  size: number = 1024,
): File {
  const magic = MAGIC_BYTES[type] ?? [];
  const content = new Uint8Array(Math.max(size, magic.length));
  content.set(magic);
  return new File([content], name, { type });
}

/**
 * Create a mock File with arbitrary content (for testing signature mismatch).
 * The file's MIME type is set to `type` but the content does not match.
 */
function createMockFileWithContent(
  name: string,
  type: string,
  content: string,
): File {
  return new File([content], name, { type });
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

  // --- Magic-byte / file-signature validation ---

  it("returns 400 for file with PDF MIME type but text content (signature mismatch)", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockAdminClient({}),
    );

    // File claims to be PDF but content is plain text
    const file = createMockFileWithContent("fake.pdf", "application/pdf", "This is not a PDF file");
    const response = await POST(createUploadRequest(file, "550e8400-e29b-41d4-a716-446655440000"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("FILE_SIGNATURE_MISMATCH");
    expect(body.error).toContain("Dateiinhalt");
  });

  it("returns 400 for file with JPEG MIME type but PDF content", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockAdminClient({}),
    );

    // File claims to be JPEG but content has PDF magic bytes
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const file = new File([pdfBytes], "fake.jpg", { type: "image/jpeg" });
    const response = await POST(createUploadRequest(file, "550e8400-e29b-41d4-a716-446655440000"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("FILE_SIGNATURE_MISMATCH");
  });

  it("returns 400 for file with PNG MIME type but text content", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({}),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockAdminClient({}),
    );

    const file = createMockFileWithContent("fake.png", "image/png", "not an image");
    const response = await POST(createUploadRequest(file, "550e8400-e29b-41d4-a716-446655440000"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("FILE_SIGNATURE_MISMATCH");
  });

  it("rejects signature mismatch before creating any Storage object or DB row", async () => {
    const serverClient = mockServerClient({});
    const adminClient = mockAdminClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(serverClient);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(adminClient);

    const file = createMockFileWithContent("fake.pdf", "application/pdf", "text content");
    const response = await POST(createUploadRequest(file, "550e8400-e29b-41d4-a716-446655440000"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("FILE_SIGNATURE_MISMATCH");
    // No Storage upload should have been attempted
    expect(adminClient.storage.from).not.toHaveBeenCalled();
    // No documents insert should have been attempted
    expect(serverClient.from).not.toHaveBeenCalledWith("documents");
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
