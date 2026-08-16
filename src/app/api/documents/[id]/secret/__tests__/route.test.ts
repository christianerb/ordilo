import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/secrets";

// Mock the supabase server client before importing the route.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { POST, PUT, GET } from "@/app/api/documents/[id]/secret/route";
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

// ---------------------------------------------------------------------------
// PUT — set / change / remove
// ---------------------------------------------------------------------------

/** Mock client capturing what the update wrote. */
function mockUpdateClient({ notFound = false, error = null as unknown } = {}) {
  const update = vi.fn().mockReturnThis();
  const chain = {
    update,
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue(
        notFound ? { data: null, error } : { data: { id: "doc-1" }, error },
      ),
  };
  return {
    client: { from: vi.fn(() => chain) } as unknown as Awaited<
      ReturnType<typeof createServerClient>
    >,
    update,
  };
}

function putRequest(body: unknown) {
  return new Request("https://test", {
    method: "PUT",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("PUT /api/documents/[id]/secret", () => {
  const originalKey = process.env.SECRETS_ENCRYPTION_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SECRETS_ENCRYPTION_KEY = TEST_KEY;
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "user-1" },
      status: null,
      json: null,
    });
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

    const response = await PUT(putRequest({ secret: "x" }), makeContext("doc-1"));

    expect(response.status).toBe(401);
  });

  it("stores only the ciphertext, never the plaintext", async () => {
    const { client, update } = mockUpdateClient();
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const response = await PUT(
      putRequest({ secret: "mein-passwort" }),
      makeContext("doc-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.has_secret).toBe(true);

    const written = update.mock.calls[0][0].secret as string;
    expect(written).not.toContain("mein-passwort");
    // Round-trips through the same envelope format the note route writes.
    expect(decryptSecret(written)).toBe("mein-passwort");
  });

  it("keeps leading and trailing whitespace inside a password", async () => {
    const { client, update } = mockUpdateClient();
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    await PUT(putRequest({ secret: " pass wort " }), makeContext("doc-1"));

    expect(decryptSecret(update.mock.calls[0][0].secret as string)).toBe(
      " pass wort ",
    );
  });

  it("removes the secret when given an empty string", async () => {
    const { client, update } = mockUpdateClient();
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const response = await PUT(putRequest({ secret: "   " }), makeContext("doc-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.has_secret).toBe(false);
    expect(update.mock.calls[0][0].secret).toBeNull();
  });

  it("rejects a body without a secret string", async () => {
    const { client } = mockUpdateClient();
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const response = await PUT(putRequest({ secret: 42 }), makeContext("doc-1"));

    expect(response.status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const { client } = mockUpdateClient();
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const response = await PUT(putRequest("{nope"), makeContext("doc-1"));

    expect(response.status).toBe(400);
  });

  it("rejects an overlong password", async () => {
    const { client } = mockUpdateClient();
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const response = await PUT(
      putRequest({ secret: "x".repeat(10_001) }),
      makeContext("doc-1"),
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 when the document is not visible through RLS", async () => {
    const { client } = mockUpdateClient({ notFound: true });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const response = await PUT(putRequest({ secret: "x" }), makeContext("doc-1"));

    expect(response.status).toBe(404);
  });

  it("returns 500 when the write fails", async () => {
    const { client } = mockUpdateClient({ error: { message: "boom" } });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const response = await PUT(putRequest({ secret: "x" }), makeContext("doc-1"));

    expect(response.status).toBe(500);
  });
});
