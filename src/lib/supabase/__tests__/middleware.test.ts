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
 * Configurable via options: auth user, the family row (with
 * onboarding_completed_at), and an optional error on the families query.
 */
function mockSupabaseClient(options: {
  user?: { id: string; email: string } | null;
  familyData?: { id: string; onboarding_completed_at: string | null } | null;
  familyError?: unknown;
}) {
  const {
    user = { id: "user-1", email: "test@ordilo.test" },
    familyData = null,
    familyError = null,
  } = options;

  const familyChain = {
    select: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: familyData,
      error: familyError,
    }),
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn((table: string) => {
      if (table === "families") return familyChain;
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as Record<string, unknown>;
}

/**
 * Set up the createServerClient mock to return a client with the given
 * options. Uses mockReturnValue for simple cases.
 */
function setupMock(options: Parameters<typeof mockSupabaseClient>[0]) {
  (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue(
    mockSupabaseClient(options),
  );
}

/**
 * Set up the createServerClient mock with cookie-refresh simulation.
 * The mock captures the cookies config and calls setAll with the provided
 * refresh cookies, simulating a session refresh that sets cookies on the
 * supabaseResponse. This allows testing that redirectWithCookies preserves
 * full cookie attributes.
 */
function setupMockWithCookies(
  options: Parameters<typeof mockSupabaseClient>[0] & {
    refreshCookies: Array<{
      name: string;
      value: string;
      options: Record<string, unknown>;
    }>;
  },
) {
  const client = mockSupabaseClient(options);
  const { refreshCookies } = options;

  (createServerClient as ReturnType<typeof vi.fn>).mockImplementation(
    (
      _url: string,
      _key: string,
      config: {
        cookies: {
          getAll: () => unknown[];
          setAll: (cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => void;
        };
      },
    ) => {
      // Simulate session refresh: call setAll so cookies are set on the
      // supabaseResponse via the middleware's setAll callback.
      if (config?.cookies?.setAll) {
        config.cookies.setAll(refreshCookies);
      }
      return client;
    },
  );
}

// ---------------------------------------------------------------------------
// Convenience constants for family states
// ---------------------------------------------------------------------------

/** A family with onboarding_completed_at set (onboarding completed). */
const COMPLETED_FAMILY = {
  id: "fam-1",
  onboarding_completed_at: "2026-07-04T10:00:00Z",
};

/** A family with onboarding_completed_at NULL (mid-onboarding). */
const MID_ONBOARDING_FAMILY = {
  id: "fam-1",
  onboarding_completed_at: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("updateSession — onboarding guard (onboarding_completed_at marker)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // BLOCKING fix: a completed user with ZERO members must reach /familie.
  // The old code used member count; the new code uses onboarding_completed_at.
  // -------------------------------------------------------------------------

  it("allows completed user (onboarding_completed_at set) to access /familie even with zero members", async () => {
    setupMock({ familyData: COMPLETED_FAMILY });

    const request = createMockRequest("/familie");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
  });

  it("allows completed user with zero members to access /home", async () => {
    setupMock({ familyData: COMPLETED_FAMILY });

    const request = createMockRequest("/home");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
  });

  it("allows completed user with zero members to access /scan", async () => {
    setupMock({ familyData: COMPLETED_FAMILY });

    const request = createMockRequest("/scan");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
  });

  it("allows completed user with zero members to access /suche", async () => {
    setupMock({ familyData: COMPLETED_FAMILY });

    const request = createMockRequest("/suche");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
  });

  it("allows completed user with zero members to access /aufgaben", async () => {
    setupMock({ familyData: COMPLETED_FAMILY });

    const request = createMockRequest("/aufgaben");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // Mid-onboarding bypass stays closed: completed_at NULL → /onboarding
  // -------------------------------------------------------------------------

  it("redirects mid-onboarding user (completed_at NULL) from /familie to /onboarding", async () => {
    setupMock({ familyData: MID_ONBOARDING_FAMILY });

    const request = createMockRequest("/familie");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/onboarding");
  });

  it("redirects mid-onboarding user (completed_at NULL) from /home to /onboarding", async () => {
    setupMock({ familyData: MID_ONBOARDING_FAMILY });

    const request = createMockRequest("/home");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/onboarding");
  });

  it("redirects mid-onboarding user (completed_at NULL) from /scan to /onboarding", async () => {
    setupMock({ familyData: MID_ONBOARDING_FAMILY });

    const request = createMockRequest("/scan");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/onboarding");
  });

  it("redirects mid-onboarding user (completed_at NULL) from /suche to /onboarding", async () => {
    setupMock({ familyData: MID_ONBOARDING_FAMILY });

    const request = createMockRequest("/suche");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/onboarding");
  });

  it("redirects mid-onboarding user (completed_at NULL) from /aufgaben to /onboarding", async () => {
    setupMock({ familyData: MID_ONBOARDING_FAMILY });

    const request = createMockRequest("/aufgaben");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/onboarding");
  });

  it("allows mid-onboarding user (completed_at NULL) to stay on /onboarding", async () => {
    setupMock({ familyData: MID_ONBOARDING_FAMILY });

    const request = createMockRequest("/onboarding");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // No family at all → redirect to /onboarding (user hasn't started)
  // -------------------------------------------------------------------------

  it("redirects user with no family from /familie to /onboarding", async () => {
    setupMock({ familyData: null });

    const request = createMockRequest("/familie");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/onboarding");
  });

  it("redirects user with no family from /home to /onboarding", async () => {
    setupMock({ familyData: null });

    const request = createMockRequest("/home");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/onboarding");
  });

  it("allows user with no family to stay on /onboarding", async () => {
    setupMock({ familyData: null });

    const request = createMockRequest("/onboarding");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // Completed user on /onboarding → redirect to /home
  // -------------------------------------------------------------------------

  it("redirects completed user from /onboarding to /home", async () => {
    setupMock({ familyData: COMPLETED_FAMILY });

    const request = createMockRequest("/onboarding");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/home");
  });

  // -------------------------------------------------------------------------
  // Auth guard (unauthenticated → /login) must remain intact.
  // -------------------------------------------------------------------------

  it("redirects unauthenticated user from /familie to /login", async () => {
    setupMock({ user: null });

    const request = createMockRequest("/familie");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });

  it("redirects unauthenticated user from /home to /login", async () => {
    setupMock({ user: null });

    const request = createMockRequest("/home");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });

  // -------------------------------------------------------------------------
  // POST requests (server actions) must NOT be redirected.
  // -------------------------------------------------------------------------

  it("does not redirect mid-onboarding user on POST to /familie (server action)", async () => {
    setupMock({ familyData: MID_ONBOARDING_FAMILY });

    const request = createMockRequest("/familie", "POST");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // Nested routes under /familie must also be guarded.
  // -------------------------------------------------------------------------

  it("redirects mid-onboarding user from /familie/member-id to /onboarding", async () => {
    setupMock({ familyData: MID_ONBOARDING_FAMILY });

    const request = createMockRequest("/familie/123e4567-e89b-12d3-a456-426614174000");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/onboarding");
  });

  it("allows completed user to access nested /familie/member-id", async () => {
    setupMock({ familyData: COMPLETED_FAMILY });

    const request = createMockRequest("/familie/123e4567-e89b-12d3-a456-426614174000");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // BLOCKING fix: redirectWithCookies must preserve FULL cookie attributes.
  // -------------------------------------------------------------------------

  it("preserves full cookie attributes (httpOnly, secure, sameSite, path, maxAge) on redirect", async () => {
    setupMockWithCookies({
      familyData: MID_ONBOARDING_FAMILY,
      refreshCookies: [
        {
          name: "sb-test-auth-token",
          value: "new-token-value",
          options: {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/",
            maxAge: 3600,
          },
        },
      ],
    });

    const request = createMockRequest("/home");
    const response = await updateSession(request);

    // Should redirect to /onboarding (mid-onboarding)
    expect(response.status).toBe(307);

    // The cookie must be present on the redirect response with ALL attributes
    const cookies = response.cookies.getAll();
    const authCookie = cookies.find((c) => c.name === "sb-test-auth-token");
    expect(authCookie).toBeDefined();
    expect(authCookie?.value).toBe("new-token-value");
    expect(authCookie?.httpOnly).toBe(true);
    expect(authCookie?.secure).toBe(true);
    expect(authCookie?.sameSite).toBe("lax");
    expect(authCookie?.path).toBe("/");
    expect(authCookie?.maxAge).toBe(3600);
  });

  it("preserves multiple cookies with different attributes on redirect", async () => {
    setupMockWithCookies({
      familyData: MID_ONBOARDING_FAMILY,
      refreshCookies: [
        {
          name: "sb-test-auth-token",
          value: "token-abc",
          options: {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/",
            maxAge: 1800,
          },
        },
        {
          name: "sb-test-refresh-token",
          value: "refresh-xyz",
          options: {
            httpOnly: true,
            secure: true,
            sameSite: "strict",
            path: "/auth",
            maxAge: 86400,
          },
        },
      ],
    });

    const request = createMockRequest("/home");
    const response = await updateSession(request);

    expect(response.status).toBe(307);

    const cookies = response.cookies.getAll();
    const authToken = cookies.find((c) => c.name === "sb-test-auth-token");
    const refreshToken = cookies.find((c) => c.name === "sb-test-refresh-token");

    expect(authToken).toBeDefined();
    expect(authToken?.sameSite).toBe("lax");
    expect(authToken?.path).toBe("/");

    expect(refreshToken).toBeDefined();
    expect(refreshToken?.sameSite).toBe("strict");
    expect(refreshToken?.path).toBe("/auth");
    expect(refreshToken?.maxAge).toBe(86400);
  });

  // -------------------------------------------------------------------------
  // NON-BLOCKING fix: read errors must NOT silently misroute the user.
  // A transient families query error should fail safe (let the request
  // pass through so the page can surface a German error state), not
  // redirect to /onboarding.
  // -------------------------------------------------------------------------

  it("does NOT redirect on families query error — fails safe (200) for /home", async () => {
    setupMock({
      familyData: null,
      familyError: new Error("Connection refused"),
    });

    const request = createMockRequest("/home");
    const response = await updateSession(request);

    // Should NOT redirect to /onboarding (that would misroute the user).
    // Instead, let the request pass through so the page can show an error.
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("does NOT redirect on families query error — fails safe (200) for /familie", async () => {
    setupMock({
      familyData: null,
      familyError: new Error("Connection refused"),
    });

    const request = createMockRequest("/familie");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("does NOT redirect on families query error — fails safe (200) for /onboarding", async () => {
    setupMock({
      familyData: null,
      familyError: new Error("Connection refused"),
    });

    const request = createMockRequest("/onboarding");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
