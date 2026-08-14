import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { decryptSecret } from "@/lib/secrets";

// Mock the supabase clients before importing the route.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createClient: vi.fn(),
}));

import { POST } from "@/app/api/documents/notes/route";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";

const FAMILY_ID = "660e8400-e29b-41d4-a716-446655440001";

/**
 * Build a mock server Supabase client.
 * Handles auth.getUser(), families select, documents insert, and
 * document_pages insert.
 */
function mockServerClient(options: {
  user?: { id: string; email: string } | null;
  family?: { id: string } | null;
  docInsert?: { id: string } | null;
  docInsertError?: unknown;
} = {}) {
  const {
    user = { id: "user-1", email: "test@ordilo.test" },
    family = { id: FAMILY_ID },
    docInsert = { id: "doc-1" },
    docInsertError = null,
  } = options;

  // families select chain: .select("id").eq().maybeSingle()
  const familiesChain = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: family, error: null }),
  };

  // documents insert chain: .insert(payload).select("id").single()
  const documentsInsertChain = {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: docInsert, error: docInsertError }),
  };
  const documentsInsertMock = vi.fn(() => documentsInsertChain);

  // document_pages insert: awaited directly (no .select().single())
  const pagesInsertMock = vi.fn().mockResolvedValue({ data: null, error: null });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn((table: string) => {
      if (table === "families") {
        return { select: vi.fn(() => familiesChain) };
      }
      if (table === "documents") {
        return { insert: documentsInsertMock };
      }
      if (table === "document_pages") {
        return { insert: pagesInsertMock };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
    // Exposed for test assertions (not part of the real client)
    _documentsInsertMock: documentsInsertMock,
  } as unknown as Awaited<ReturnType<typeof createServerClient>> & {
    _documentsInsertMock: ReturnType<typeof vi.fn>;
  };
}

/** Build a mock admin client (storage unused when no file is attached). */
function mockAdminClient() {
  return {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: { path: "p" }, error: null }),
        remove: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    },
  } as unknown as Awaited<ReturnType<typeof createAdminClient>>;
}

/**
 * Build a mock Request with multipart form data. jsdom's Request.formData()
 * cannot parse multipart bodies, so we return the pre-built FormData directly
 * (same pattern as the upload route test).
 */
function createNoteRequest(fields: Record<string, string>): Request {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  return {
    method: "POST",
    formData: async () => formData,
  } as unknown as Request;
}

const VALID_FIELDS = {
  title: "Arzt Dr. Müller",
  content: "Musterstraße 1, 12345 Berlin\nTel: 030/123456",
  document_type: "medical",
  family_id: FAMILY_ID,
};

describe("POST /api/documents/notes", () => {
  const originalKey = process.env.SECRETS_ENCRYPTION_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    // Provide a valid 32-byte key so encryptSecret works when a secret is sent.
    process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 0x42).toString("base64");
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.SECRETS_ENCRYPTION_KEY;
    } else {
      process.env.SECRETS_ENCRYPTION_KEY = originalKey;
    }
  });

  it("stores the collection category on the document when provided", async () => {
    const serverClient = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(serverClient);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockAdminClient());

    const response = await POST(
      createNoteRequest({ ...VALID_FIELDS, category: "Unterlagen" }),
    );

    expect(response.status).toBe(200);
    const insertPayload = serverClient._documentsInsertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(insertPayload.category).toBe("Unterlagen");
    expect(insertPayload.source).toBe("manual");
    expect(insertPayload.status).toBe("confirmed");
  });

  it("stores a null category when no collection is given", async () => {
    const serverClient = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(serverClient);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockAdminClient());

    const response = await POST(createNoteRequest(VALID_FIELDS));

    expect(response.status).toBe(200);
    const insertPayload = serverClient._documentsInsertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(insertPayload.category).toBeNull();
  });

  it("trims whitespace around the category", async () => {
    const serverClient = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(serverClient);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockAdminClient());

    const response = await POST(
      createNoteRequest({ ...VALID_FIELDS, category: "  Unterlagen  " }),
    );

    expect(response.status).toBe(200);
    const insertPayload = serverClient._documentsInsertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(insertPayload.category).toBe("Unterlagen");
  });

  it("rejects an invalid document_type", async () => {
    const serverClient = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(serverClient);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockAdminClient());

    const response = await POST(
      createNoteRequest({ ...VALID_FIELDS, document_type: "not-a-type" }),
    );

    expect(response.status).toBe(400);
  });

  it("encrypts a secret and never stores the plaintext", async () => {
    const serverClient = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(serverClient);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockAdminClient());

    const response = await POST(
      createNoteRequest({ ...VALID_FIELDS, secret: "super-secret-123" }),
    );

    expect(response.status).toBe(200);
    const insertPayload = serverClient._documentsInsertMock.mock.calls[0][0] as Record<string, unknown>;
    // The secret column is set, but it is NOT the plaintext.
    expect(insertPayload.secret).toBeDefined();
    expect(insertPayload.secret).not.toBe("super-secret-123");
    expect(String(insertPayload.secret)).not.toContain("super-secret-123");
    // The ocr_text must not contain the plaintext either.
    expect(String(insertPayload.ocr_text)).not.toContain("super-secret-123");
    // The stored envelope round-trips back to the plaintext.
    expect(decryptSecret(insertPayload.secret as string)).toBe("super-secret-123");
  });

  it("preserves meaningful whitespace in a secret", async () => {
    const serverClient = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(serverClient);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockAdminClient());
    const secret = "  0420 Zugangscode  ";

    const response = await POST(
      createNoteRequest({ ...VALID_FIELDS, secret }),
    );

    expect(response.status).toBe(200);
    const insertPayload = serverClient._documentsInsertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(decryptSecret(insertPayload.secret as string)).toBe(secret);
  });

  it("omits the secret column when no secret is provided", async () => {
    const serverClient = mockServerClient({});
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(serverClient);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockAdminClient());

    const response = await POST(createNoteRequest(VALID_FIELDS));

    expect(response.status).toBe(200);
    const insertPayload = serverClient._documentsInsertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(insertPayload.secret).toBeUndefined();
  });
});
