import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  membershipMaybeSingle: vi.fn(),
  recordEnded: vi.fn(),
  recordProductEvent: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: () => mocks.requireUser(),
}));

vi.mock("@/lib/analytics/api-usage", () => ({
  recordLiveConversationEnded: (...args: unknown[]) =>
    mocks.recordEnded(...args),
}));

vi.mock("@/lib/analytics/product-events", () => ({
  recordProductEvent: (...args: unknown[]) => mocks.recordProductEvent(...args),
}));

vi.mock("@/lib/billing/live-conversation", () => ({
  LIVE_CONVERSATION_MAX_DURATION_MS: 300_000,
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

import { POST } from "../route";

const familyId = "10000000-0000-4000-a000-000000000001";
const operationId = "20000000-0000-4000-a000-000000000002";

function request(overrides: Record<string, unknown> = {}): Request {
  return new Request("https://ordilo.test/api/realtime/live/session/end", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      family_id: familyId,
      operation_id: operationId,
      duration_ms: 42_000,
      reason: "user",
      ...overrides,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({
    user: { id: "user-1" },
    status: null,
    json: null,
  });
  mocks.membershipMaybeSingle.mockResolvedValue({
    data: { family_id: familyId },
    error: null,
  });
  mocks.recordEnded.mockResolvedValue(undefined);
  mocks.recordProductEvent.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/realtime/live/session/end", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.requireUser.mockResolvedValue({
      user: null,
      status: 401,
      json: { error: "unauthorized" },
    });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.recordEnded).not.toHaveBeenCalled();
  });

  it("rejects invalid bodies", async () => {
    const response = await POST(request({ reason: "unknown" }));

    expect(response.status).toBe(400);
    expect(mocks.recordEnded).not.toHaveBeenCalled();
  });

  it("rejects users outside the family", async () => {
    mocks.membershipMaybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.recordEnded).not.toHaveBeenCalled();
  });

  it("records duration and product event for members", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.recordEnded).toHaveBeenCalledWith({
      operationId,
      durationMillis: 42_000,
      userId: "user-1",
    });
    expect(mocks.recordProductEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventName: "live_conversation_ended",
        properties: { duration_seconds: 42, reason: "user" },
      }),
    );
  });

  it("caps reported duration at the five-minute session limit", async () => {
    const response = await POST(request({ duration_ms: 10 * 60 * 1_000 }));

    expect(response.status).toBe(200);
    expect(mocks.recordEnded).toHaveBeenCalledWith({
      operationId,
      durationMillis: 300_000,
      userId: "user-1",
    });
  });
});
