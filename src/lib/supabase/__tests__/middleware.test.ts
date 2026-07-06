import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock @supabase/ssr before importing the middleware module.
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));

import { updateSession } from "@/lib/supabase/middleware";
import { createServerClient } from "@supabase/ssr";

/**
 * Create a mock NextRequest for the given pathname and HTTP method.
 * The request is a real NextRequest so that nextUrl, cookies, and
 * cloning work as in production.
 */
function createMockRequest(pathname: string, method = "GET"): NextRequest {
  const url = new URL(`http://localhost:3100${pathname}`);
  return new NextRequest(url, { method });
}

/**
 * Build a mock Supabase client that the mocked createServerClient returns.
 * Configurable via options: auth user, whether family_members returns a row,
 * and an optional error on the family_members query.
 */
function mockSupabaseClient(options: {
  user?: { id: string; email: string } | null;
  hasMember?: boolean;
  memberError?: unknown;
}) {
  const {
    user = { id: "user-1", email: "test@ordilo.test" },
    hasMember = false,
    memberError = null,
  } = options;

  const memberChain = {
    select: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: hasMember ? { id: "mem-1" } : null,
      error: memberError,
    }),
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn((table: string) => {
      if (table === "family_members") return memberChain;
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as Record<string, unknown>;
}

describe("updateSession — onboarding guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // BLOCKING fix: /familie must NOT be exempted from the onboarding redirect.
  // A user with a family but zero members must be redirected to /onboarding
  // even when navigating to /familie.
  // -------------------------------------------------------------------------

  it("redirects zero-member user from /familie to /onboarding (no bypass)", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient({ hasMember: false }),
    );

    const request = createMockRequest("/familie");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/onboarding");
  });

  it("allows onboarded user (>=1 member) to access /familie normally", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient({ hasMember: true }),
    );

    const request = createMockRequest("/familie");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // Existing guard behavior must remain intact.
  // -------------------------------------------------------------------------

  it("redirects zero-member user from /home to /onboarding", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient({ hasMember: false }),
    );

    const request = createMockRequest("/home");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/onboarding");
  });

  it("redirects zero-member user from /scan to /onboarding", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient({ hasMember: false }),
    );

    const request = createMockRequest("/scan");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/onboarding");
  });

  it("redirects zero-member user from /suche to /onboarding", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient({ hasMember: false }),
    );

    const request = createMockRequest("/suche");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/onboarding");
  });

  it("redirects zero-member user from /aufgaben to /onboarding", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient({ hasMember: false }),
    );

    const request = createMockRequest("/aufgaben");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/onboarding");
  });

  it("redirects onboarded user from /onboarding to /home", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient({ hasMember: true }),
    );

    const request = createMockRequest("/onboarding");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/home");
  });

  it("allows zero-member user to stay on /onboarding (not redirected away)", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient({ hasMember: false }),
    );

    const request = createMockRequest("/onboarding");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // Auth guard (unauthenticated → /login) must remain intact.
  // -------------------------------------------------------------------------

  it("redirects unauthenticated user from /familie to /login", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient({ user: null }),
    );

    const request = createMockRequest("/familie");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });

  it("redirects unauthenticated user from /home to /login", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient({ user: null }),
    );

    const request = createMockRequest("/home");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });

  // -------------------------------------------------------------------------
  // POST requests (server actions) must NOT be redirected.
  // -------------------------------------------------------------------------

  it("does not redirect zero-member user on POST to /familie (server action)", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient({ hasMember: false }),
    );

    const request = createMockRequest("/familie", "POST");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // Nested routes under /familie must also be guarded.
  // -------------------------------------------------------------------------

  it("redirects zero-member user from /familie/member-id to /onboarding", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient({ hasMember: false }),
    );

    const request = createMockRequest("/familie/123e4567-e89b-12d3-a456-426614174000");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/onboarding");
  });
});
