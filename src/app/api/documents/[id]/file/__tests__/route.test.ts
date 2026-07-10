import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase clients before importing the route.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createClient: vi.fn(),
}));

import { GET } from "@/app/api/documents/[id]/file/route";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const VALID_DOC_ID = "550e8400-e29b-41d4-a716-446655440000";
const FAMILY_ID = "660e8400-e29b-41d4-a716-446655440001";

function createParams(id: string = VALID_DOC_ID) {
  return { params: Promise.resolve({ id }) };
}

/**
 * Mock the RLS-scoped server client used by `requireUser` (auth) and by
 * the route's own `resolveDocumentWithOwnership` read.
 */
function mockServerClient({
  user = { id: "user-1" },
  document = null,
}: {
  user?: { id: string } | null;
  document?: { file_url: string } | null;
} = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn((table: string) => {
      if (table === "documents") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi
                .fn()
                .mockResolvedValue({ data: document, error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as Awaited<ReturnType<typeof createServerClient>>;
}

/**
 * Mock the admin (service-role) client — used for the ownership-vs-existence
 * distinction and for creating the signed URL.
 */
function mockAdminClient({
  docExists = false,
  signedUrl = "https://storage.example.com/signed-url",
  signError = null,
}: {
  docExists?: boolean;
  signedUrl?: string | null;
  signError?: unknown;
} = {}) {
  return {
    from: vi.fn((table: string) => {
      if (table === "documents") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: docExists ? { id: VALID_DOC_ID } : null,
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn().mockResolvedValue(
          signError
            ? { data: null, error: signError }
            : { data: { signedUrl }, error: null },
        ),
      })),
    },
  } as unknown as ReturnType<typeof createAdminClient>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/documents/[id]/file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ user: null }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient(),
    );

    const response = await GET(new Request("http://localhost"), createParams());

    expect(response.status).toBe(401);
  });

  it("returns 400 for an invalid document ID", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient(),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient(),
    );

    const response = await GET(
      new Request("http://localhost"),
      createParams("not-a-uuid"),
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 when the document truly does not exist", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ document: null }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({ docExists: false }),
    );

    const response = await GET(new Request("http://localhost"), createParams());

    expect(response.status).toBe(404);
  });

  it("returns 403 when the document exists but belongs to another family", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ document: null }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({ docExists: true }),
    );

    const response = await GET(new Request("http://localhost"), createParams());

    expect(response.status).toBe(403);
  });

  it("returns a signed URL when the document is owned by the user's family", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        document: { file_url: `${FAMILY_ID}/${VALID_DOC_ID}/file.pdf` },
      }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({ signedUrl: "https://storage.example.com/signed-url" }),
    );

    const response = await GET(new Request("http://localhost"), createParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toBe("https://storage.example.com/signed-url");
  });

  it("returns 500 when creating the signed URL fails", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        document: { file_url: `${FAMILY_ID}/${VALID_DOC_ID}/file.pdf` },
      }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({ signError: new Error("boom") }),
    );

    const response = await GET(new Request("http://localhost"), createParams());

    expect(response.status).toBe(500);
  });
});
