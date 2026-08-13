import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { encryptSecret } from "@/lib/secrets";

// Mock the supabase server client before importing the route.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { POST, GET } from "@/app/api/documents/[id]/secret/route";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";

// Mock requireUser so we can control authentication per test.
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn(),
}));

const TEST_KEY = Buffer.alloc(32, 0x42).toString("base64");

/** Build a mock server client whose documents.select returns a configured row. */
function mockServerClient(options: {
  secret?: string | null;
  notFound?: boolean;
  error?: unknown;
} = {}) {
  const { secret = null, notFound = false, error = null } = options;
  const maybeSingle = vi.fn().mockResolvedValue(
    notFound
      ? { data: null, error: null }
      : { data: { secret }, error },
  );
  const selectChain = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle,
  };
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => selectChain),
    })),
  } as unknown as Awaited<ReturnType<typeof createServerClient>>;
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/documents/[id]/secret", () => {
  const originalKey = process.env.SECRETS_ENCRYPTION_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SECRETS_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.SECRETS_ENCRYPTION_KEY;
    } else {
      process.env.SECRETS_ENCRYPTION_KEY = originalKey;
    }
  });

  it("returns 401 when unauthenticated", async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: null,
      status: 401,
      json: { error: "Nicht authentifiziert.", code: "UNAUTHENTICATED" },
    });

    const response = await POST(new Request("https://test"), makeContext("doc-1"));

    expect(response.status).toBe(401);
  });

  it("decrypts and returns the plaintext secret", async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "user-1" },
      status: null,
      json: null,
    });
    const envelope = encryptSecret("mein-passwort")!;
    const serverClient = mockServerClient({ secret: envelope });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(serverClient);

    const response = await POST(new Request("https://test"), makeContext("doc-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.secret).toBe("mein-passwort");
  });

  it("returns 404 when the document has no secret", async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "user-1" },
      status: null,
      json: null,
    });
    const serverClient = mockServerClient({ secret: null });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(serverClient);

    const response = await POST(new Request("https://test"), makeContext("doc-1"));

    expect(response.status).toBe(404);
  });

  it("returns 404 when the document is not found (RLS)", async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "user-1" },
      status: null,
      json: null,
    });
    const serverClient = mockServerClient({ notFound: true });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(serverClient);

    const response = await POST(new Request("https://test"), makeContext("doc-1"));

    expect(response.status).toBe(404);
  });

  it("returns 500 when decryption fails (tampered envelope)", async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "user-1" },
      status: null,
      json: null,
    });
    const serverClient = mockServerClient({ secret: "garbage:envelope" });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(serverClient);

    const response = await POST(new Request("https://test"), makeContext("doc-1"));

    expect(response.status).toBe(500);
  });
});

describe("GET /api/documents/[id]/secret", () => {
  it("is not allowed (reveal is POST-only)", async () => {
    const response = await GET();
    expect(response.status).toBe(405);
  });
});
