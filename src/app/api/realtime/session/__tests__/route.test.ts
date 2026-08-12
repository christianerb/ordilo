import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  checkRateLimit: vi.fn(),
  recordUsage: vi.fn(),
  membershipMaybeSingle: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: () => mocks.requireUser(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: vi.fn((table: string) => {
      if (table === "family_memberships") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: mocks.membershipMaybeSingle,
              })),
            })),
          })),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  }),
}));

vi.mock("@/lib/ai/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mocks.checkRateLimit(...args),
  recordUsage: (...args: unknown[]) => mocks.recordUsage(...args),
}));

import { POST } from "@/app/api/realtime/session/route";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mockFetch);
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  mocks.requireUser.mockResolvedValue({
    user: { id: "user-1" },
    status: null,
    json: null,
  });
  mocks.membershipMaybeSingle.mockResolvedValue({
    data: { family_id: "fam-1" },
    error: null,
  });
  mocks.checkRateLimit.mockResolvedValue({
    allowed: true,
    used: 1,
    remaining: 49,
  });
  mocks.recordUsage.mockResolvedValue(undefined);
  mockFetch.mockResolvedValue(
    new Response(
      JSON.stringify({
        value: "secret-1",
        expires_at: 123,
      }),
      { status: 200 },
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/realtime/session", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.requireUser.mockResolvedValue({
      user: null,
      status: 401,
      json: { error: "Nicht authentifiziert.", code: "UNAUTHENTICATED" },
    });

    const response = await POST();

    expect(response.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 403 when the user has no family", async () => {
    mocks.membershipMaybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await POST();

    expect(response.status).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 429 and never calls OpenAI when the daily budget is used up", async () => {
    mocks.checkRateLimit.mockResolvedValue({
      allowed: false,
      used: 50,
      remaining: 0,
    });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mocks.recordUsage).not.toHaveBeenCalled();
  });

  it("mints a client secret and counts it against the daily budget", async () => {
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.client_secret).toBe("secret-1");
    expect(body.expires_at).toBe(123);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/client_secrets",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mocks.recordUsage).toHaveBeenCalledWith(
      expect.anything(),
      "fam-1",
      0,
    );
  });

  it("requests a text-only session with the GA parameter name", async () => {
    await POST();

    const sent = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    // `modalities` is the beta-era name and is rejected outright, which
    // left the PWA (the only voice path without a native fallback) dead.
    expect(sent.session.output_modalities).toEqual(["text"]);
    expect(sent.session.modalities).toBeUndefined();
  });

  it("returns 503 when no OpenAI key is configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const response = await POST();

    expect(response.status).toBe(503);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 502 when the OpenAI session fails and records no usage", async () => {
    mockFetch.mockResolvedValue(new Response("nope", { status: 500 }));

    const response = await POST();

    expect(response.status).toBe(502);
    expect(mocks.recordUsage).not.toHaveBeenCalled();
  });
});
