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
  familyData?: {
    id: string;
    name?: string;
    onboarding_completed_at: string | null;
  } | null;
  familyError?: unknown;
  /** Membership row for invite-only accounts (owned family misses). */
  membershipData?: {
    family_id: string;
    /** NULL = the welcome intro is still pending for this member. */
    intro_seen_at?: string | null;
    families: {
      id: string;
      name?: string;
      onboarding_completed_at: string | null;
    };
  } | null;
}) {
  const {
    user = { id: "user-1", email: "test@ordilo.test" },
    familyData = null,
    familyError = null,
    membershipData = null,
  } = options;

  // resolveUserFamily's owned lookup:
  // families.select().eq("created_by", uid).order().limit(1).maybeSingle()
  const familyChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: familyData,
      error: familyError,
    }),
  };

  // resolveUserFamily's invite-only fallback:
  // family_memberships.select("families(...)").eq("user_id", uid).order()...
  const membershipChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: membershipData,
      error: null,
    }),
  };

  return {
    auth: {
      // The middleware verifies the JWT locally via getClaims() — a
      // verified session surfaces as claims, anything else as null data.
      getClaims: vi.fn().mockResolvedValue({
        data: user ? { claims: { sub: user.id, email: user.email } } : null,
        error: null,
      }),
      // Kept as a spy: the middleware must NOT fall back to a server
      // round-trip per request.
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn((table: string) => {
      if (table === "families") return familyChain;
      if (table === "family_memberships") return membershipChain;
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

  it("resolves invite-only users via their membership and forwards that family", async () => {
    // No owned family — the deterministic fallback is the oldest
    // membership. The forwarded header must carry THAT family so the UI
    // displays the same family the server actions write to.
    setupMock({
      familyData: null,
      membershipData: {
        family_id: "fam-invited",
        intro_seen_at: "2026-07-05T10:00:00Z",
        families: {
          id: "fam-invited",
          name: "Partnerfamilie",
          onboarding_completed_at: "2026-07-04T10:00:00Z",
        },
      },
    });

    const request = createMockRequest("/home");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
    expect(
      response.headers.get("x-middleware-request-x-ordilo-family-id"),
    ).toBe("fam-invited");
  });

  // Regression: onboarding_completed_at lives on the FAMILY, but the gate
  // read it as the USER's own progress. An invitee whose family creator was
  // still mid-setup got bounced from /home into HER onboarding — asked to
  // name a family they had just joined. Joining leaves nothing to onboard.
  it("lets an invited member into /home although the creator never finished onboarding", async () => {
    setupMock({
      familyData: null,
      membershipData: {
        family_id: "fam-erb",
        intro_seen_at: "2026-08-15T06:00:00Z",
        families: {
          id: "fam-erb",
          name: "Familie Erb",
          onboarding_completed_at: null,
        },
      },
    });

    const request = createMockRequest("/home");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
    expect(
      response.headers.get("x-middleware-request-x-ordilo-family-id"),
    ).toBe("fam-erb");
  });

  it("sends an invited member off /onboarding to /home", async () => {
    setupMock({
      familyData: null,
      membershipData: {
        family_id: "fam-erb",
        intro_seen_at: "2026-08-15T06:00:00Z",
        families: {
          id: "fam-erb",
          name: "Familie Erb",
          onboarding_completed_at: null,
        },
      },
    });

    const response = await updateSession(createMockRequest("/onboarding"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/home");
  });

  // Welcome intro: shown once to invited members, never to creators.
  it("sends a fresh invitee to the welcome intro before the app", async () => {
    setupMock({
      familyData: null,
      membershipData: {
        family_id: "fam-erb",
        intro_seen_at: null,
        families: {
          id: "fam-erb",
          name: "Familie Erb",
          onboarding_completed_at: "2026-08-14T10:00:00Z",
        },
      },
    });

    const response = await updateSession(createMockRequest("/home"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/willkommen");
  });

  it("routes an invitee off /onboarding straight to the intro, not via /home", async () => {
    setupMock({
      familyData: null,
      membershipData: {
        family_id: "fam-erb",
        intro_seen_at: null,
        families: {
          id: "fam-erb",
          name: "Familie Erb",
          onboarding_completed_at: null,
        },
      },
    });

    const response = await updateSession(createMockRequest("/onboarding"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/willkommen");
  });

  it("keeps a member who acknowledged the intro out of /willkommen", async () => {
    setupMock({
      familyData: null,
      membershipData: {
        family_id: "fam-erb",
        intro_seen_at: "2026-08-15T06:00:00Z",
        families: {
          id: "fam-erb",
          name: "Familie Erb",
          onboarding_completed_at: "2026-08-14T10:00:00Z",
        },
      },
    });

    const response = await updateSession(createMockRequest("/willkommen"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/home");
  });

  it("never shows the intro to the family creator", async () => {
    setupMock({ familyData: COMPLETED_FAMILY });

    const response = await updateSession(createMockRequest("/willkommen"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/home");
  });

  it("requires a session for /willkommen", async () => {
    setupMock({ user: null });

    const response = await updateSession(createMockRequest("/willkommen"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });

  // The owner's own gate is unchanged: a half-finished setup still holds.
  it("keeps the creator in onboarding while their own marker is NULL", async () => {
    setupMock({
      familyData: {
        id: "fam-own",
        name: "Familie Schmidt",
        onboarding_completed_at: null,
      },
    });

    const response = await updateSession(createMockRequest("/home"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/onboarding");
  });

  it("allows completed user with zero members to access /home", async () => {
    setupMock({ familyData: COMPLETED_FAMILY });

    const request = createMockRequest("/home");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
  });

  it("allows completed user with zero members to access /dokumente", async () => {
    setupMock({ familyData: COMPLETED_FAMILY });

    const request = createMockRequest("/dokumente");
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

  it("redirects mid-onboarding user (completed_at NULL) from /dokumente to /onboarding", async () => {
    setupMock({ familyData: MID_ONBOARDING_FAMILY });

    const request = createMockRequest("/dokumente");
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
  // Local JWT verification: the middleware must verify via getClaims()
  // (WebCrypto + cached JWKS) and never round-trip to the Auth server per
  // request.
  // -------------------------------------------------------------------------

  it("verifies the session locally via getClaims without calling getUser", async () => {
    setupMock({ familyData: COMPLETED_FAMILY });

    const request = createMockRequest("/home");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
    const client = (createServerClient as ReturnType<typeof vi.fn>).mock
      .results[0].value as {
      auth: { getClaims: ReturnType<typeof vi.fn>; getUser: ReturnType<typeof vi.fn> };
    };
    expect(client.auth.getClaims).toHaveBeenCalledTimes(1);
    expect(client.auth.getUser).not.toHaveBeenCalled();
  });

  it("redirects to /login when the JWT is invalid or expired (claims null)", async () => {
    setupMock({ user: null });

    const request = createMockRequest("/dokumente");
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

// ---------------------------------------------------------------------------
// Family context headers: the middleware forwards its verified family to
// page renders so they can skip re-running the identical families query.
// NextResponse.next() exposes forwarded request headers on the response as
// `x-middleware-request-<name>`.
// ---------------------------------------------------------------------------

describe("updateSession — family context headers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const NAMED_FAMILY = {
    id: "fam-1",
    name: "Familie Müller",
    onboarding_completed_at: "2026-07-04T10:00:00Z",
  };

  it("forwards the verified family via request headers on app page loads", async () => {
    setupMock({ familyData: NAMED_FAMILY });

    const request = createMockRequest("/home");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
    expect(
      response.headers.get("x-middleware-request-x-ordilo-family-id"),
    ).toBe("fam-1");
    const forwardedName =
      response.headers.get("x-middleware-request-x-ordilo-family-name") ?? "";
    expect(decodeURIComponent(forwardedName)).toBe("Familie Müller");
  });

  it("forwards the authenticated user's email alongside the family headers", async () => {
    setupMock({ familyData: NAMED_FAMILY });

    const request = createMockRequest("/home");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
    const forwardedEmail =
      response.headers.get("x-middleware-request-x-ordilo-user-email") ?? "";
    expect(decodeURIComponent(forwardedEmail)).toBe("test@ordilo.test");
  });

  it("overwrites spoofed family headers with the verified values", async () => {
    setupMock({ familyData: NAMED_FAMILY });

    const request = createMockRequest("/home");
    request.headers.set("x-ordilo-family-id", "spoofed-family");
    request.headers.set("x-ordilo-family-name", "spoofed");
    request.headers.set("x-ordilo-user-email", "attacker@example.com");

    const response = await updateSession(request);

    expect(response.status).toBe(200);
    expect(
      response.headers.get("x-middleware-request-x-ordilo-family-id"),
    ).toBe("fam-1");
    const forwardedEmail =
      response.headers.get("x-middleware-request-x-ordilo-user-email") ?? "";
    expect(decodeURIComponent(forwardedEmail)).toBe("test@ordilo.test");
  });

  it("strips spoofed family headers without re-setting them on RSC navigations", async () => {
    setupMock({ familyData: NAMED_FAMILY });

    const request = createMockRequest("/home");
    request.headers.set("x-ordilo-family-id", "spoofed-family");
    request.headers.set("x-ordilo-user-email", "attacker@example.com");
    // SPA navigations skip the onboarding check, so no verified family is
    // forwarded — and the spoofed value must be gone.
    request.headers.set("RSC", "1");

    const response = await updateSession(request);

    expect(response.status).toBe(200);
    expect(
      response.headers.get("x-middleware-request-x-ordilo-family-id"),
    ).toBeNull();
    expect(
      response.headers.get("x-middleware-request-x-ordilo-user-email"),
    ).toBeNull();
  });

  it("does not forward family headers when there is no family", async () => {
    setupMock({ familyData: null });

    const request = createMockRequest("/onboarding");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
    expect(
      response.headers.get("x-middleware-request-x-ordilo-family-id"),
    ).toBeNull();
    expect(
      response.headers.get("x-middleware-request-x-ordilo-user-email"),
    ).toBeNull();
  });

  it("preserves refreshed auth cookies when forwarding family headers", async () => {
    setupMockWithCookies({
      familyData: NAMED_FAMILY,
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

    expect(response.status).toBe(200);
    expect(
      response.headers.get("x-middleware-request-x-ordilo-family-id"),
    ).toBe("fam-1");

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
});
