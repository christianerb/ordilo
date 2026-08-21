import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/headers and both Supabase factories before importing the
// module under test. The bearer branch must stay additive: no header
// means the cookie client is built exactly as before.
vi.mock("next/headers", () => ({
  headers: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ kind: "cookie-client" })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ kind: "bearer-client" })),
}));

import { headers, cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient, getBearerToken } from "@/lib/supabase/server";

const mockHeaders = headers as unknown as ReturnType<typeof vi.fn>;
const mockCookies = cookies as unknown as ReturnType<typeof vi.fn>;
const mockCreateServerClient = createServerClient as unknown as ReturnType<
  typeof vi.fn
>;
const mockCreateSupabaseClient = createSupabaseClient as unknown as ReturnType<
  typeof vi.fn
>;

function mockRequestHeaders(values: Record<string, string | null>) {
  mockHeaders.mockResolvedValue({
    get: (name: string) => values[name.toLowerCase()] ?? null,
  });
}

describe("getBearerToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no Authorization header is present", async () => {
    mockRequestHeaders({});
    await expect(getBearerToken()).resolves.toBeNull();
  });

  it("extracts the token from a Bearer header", async () => {
    mockRequestHeaders({ authorization: "Bearer token-123" });
    await expect(getBearerToken()).resolves.toBe("token-123");
  });

  it("accepts the scheme case-insensitively and trims whitespace", async () => {
    mockRequestHeaders({ authorization: "  bearer   token-abc " });
    await expect(getBearerToken()).resolves.toBe("token-abc");
  });

  it("ignores non-bearer schemes and empty tokens", async () => {
    mockRequestHeaders({ authorization: "Basic dXNlcjpwYXNz" });
    await expect(getBearerToken()).resolves.toBeNull();

    mockRequestHeaders({ authorization: "Bearer" });
    await expect(getBearerToken()).resolves.toBeNull();
  });
});

describe("createClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies.mockResolvedValue({ getAll: () => [] });
  });

  it("builds the cookie client when no Authorization header is sent", async () => {
    mockRequestHeaders({});

    const client = await createClient();

    expect(client).toEqual({ kind: "cookie-client" });
    expect(mockCreateServerClient).toHaveBeenCalledOnce();
    expect(mockCreateSupabaseClient).not.toHaveBeenCalled();
  });

  it("builds a token-scoped client for bearer requests", async () => {
    mockRequestHeaders({ authorization: "Bearer mobile-token" });

    const client = await createClient();

    expect(client).toEqual({ kind: "bearer-client" });
    expect(mockCreateServerClient).not.toHaveBeenCalled();
    expect(mockCreateSupabaseClient).toHaveBeenCalledWith(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      expect.objectContaining({
        global: {
          headers: { Authorization: "Bearer mobile-token" },
        },
      }),
    );
  });

  it("falls back to the cookie client for malformed bearer headers", async () => {
    mockRequestHeaders({ authorization: "Token abc" });

    const client = await createClient();

    expect(client).toEqual({ kind: "cookie-client" });
    expect(mockCreateServerClient).toHaveBeenCalledOnce();
  });
});
