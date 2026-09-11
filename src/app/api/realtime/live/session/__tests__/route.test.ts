import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  membershipMaybeSingle: vi.fn(),
  hasAccess: vi.fn(),
  reserve: vi.fn(),
  release: vi.fn(),
  sentryMessage: vi.fn(),
  sentryException: vi.fn(),
  recordLiveStarted: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: () => mocks.requireUser(),
}));

vi.mock("@/lib/analytics/api-usage", () => ({
  attributeUsageUser: vi.fn(),
  recordLiveConversationStarted: (...args: unknown[]) =>
    mocks.recordLiveStarted(...args),
}));

vi.mock("@/lib/billing/live-conversation", () => ({
  hasLiveConversationAccess: (...args: unknown[]) => mocks.hasAccess(...args),
  LIVE_CONVERSATION_MAX_DURATION_MS: 300_000,
}));

vi.mock("@/lib/billing/quota", () => ({
  reserveMonthlyUsage: (...args: unknown[]) => mocks.reserve(...args),
  releaseMonthlyUsage: (...args: unknown[]) => mocks.release(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: mocks.membershipMaybeSingle,
          })),
        })),
      })),
    })),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createClient: () => ({
    from: () => ({ insert: vi.fn().mockResolvedValue({ error: null }) }),
  }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: (...args: unknown[]) => mocks.sentryMessage(...args),
  captureException: (...args: unknown[]) => mocks.sentryException(...args),
}));

import { POST } from "../route";

const fetchMock = vi.fn();
const familyId = "10000000-0000-4000-a000-000000000001";
const operationId = "20000000-0000-4000-a000-000000000002";

function request(): Request {
  return new Request("https://ordilo.test/api/realtime/live/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      family_id: familyId,
      operation_id: operationId,
      sdp: "v=0\r\n",
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  mocks.requireUser.mockResolvedValue({
    user: { id: "user-1" },
    status: null,
    json: null,
  });
  mocks.membershipMaybeSingle.mockResolvedValue({
    data: { family_id: familyId },
    error: null,
  });
  mocks.hasAccess.mockResolvedValue(true);
  mocks.reserve.mockResolvedValue({
    allowed: true,
    duplicate: false,
    plan: "plus",
    metric: "live_conversation",
    used: 1,
    limit: 10,
    period_start: "2026-09-01",
    period_end: "2026-10-01",
  });
  mocks.release.mockResolvedValue(true);
  mocks.recordLiveStarted.mockResolvedValue(undefined);
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        session: { id: "live_test" },
        transport: { type: "webrtc", sdp: "v=0\r\nanswer" },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/realtime/live/session", () => {
  it("rejects free families before reserving usage or calling OpenAI", async () => {
    mocks.hasAccess.mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ code: "PREMIUM_REQUIRED" });
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a family that has used all monthly live sessions", async () => {
    mocks.reserve.mockResolvedValue({
      allowed: false,
      duplicate: false,
      plan: "plus",
      metric: "live_conversation",
      used: 10,
      limit: 10,
      period_start: "2026-09-01",
      period_end: "2026-10-01",
    });

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      code: "MONTHLY_LIVE_QUOTA_EXCEEDED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a five-minute GPT Live WebRTC session for Premium", async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      session_id: "live_test",
      sdp: "v=0\r\nanswer",
      max_duration_ms: 300_000,
      model: "gpt-live-1",
      operation_id: operationId,
    });
    expect(mocks.reserve).toHaveBeenCalledWith({
      familyId,
      metric: "live_conversation",
      operationKey: operationId,
    });

    const openAiRequest = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(openAiRequest.session.model).toBe("gpt-live-1");
    expect(openAiRequest.session.delegation).toEqual({ type: "client" });
    expect(openAiRequest.transport).toEqual({
      type: "webrtc",
      sdp: "v=0\r\n",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/live/sessions",
      expect.any(Object),
    );
    expect(mocks.recordLiveStarted).toHaveBeenCalledWith({
      operationId,
      userId: "user-1",
      providerRequestId: null,
    });
  });

  it("releases the monthly reservation when OpenAI refuses the session", async () => {
    fetchMock.mockResolvedValue(new Response("unavailable", { status: 503 }));

    const response = await POST(request());

    expect(response.status).toBe(502);
    expect(mocks.release).toHaveBeenCalledWith({
      familyId,
      metric: "live_conversation",
      operationKey: operationId,
    });
  });
});
