import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  statusMaybeSingle: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: () => mocks.requireUser(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: vi.fn((table: string) => {
      if (table !== "user_consents") {
        throw new Error(`unexpected table: ${table}`);
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: mocks.statusMaybeSingle })),
        })),
        upsert: mocks.upsert,
      };
    }),
  }),
}));

import { GET, POST } from "@/app/api/me/ai-consent/route";

const USER = { id: "user-1", email: "test@ordilo.test" };

function authenticated() {
  mocks.requireUser.mockResolvedValue({ user: USER, status: null, json: null });
}

function unauthenticated() {
  mocks.requireUser.mockResolvedValue({
    user: null,
    status: 401,
    json: {
      error: "Nicht authentifiziert. Bitte erneut anmelden.",
      code: "UNAUTHENTICATED",
    },
  });
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/me/ai-consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/me/ai-consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.upsert.mockResolvedValue({ error: null });
  });

  it("GET rejects unauthenticated requests with 401", async () => {
    unauthenticated();

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("GET returns null when the user was never asked", async () => {
    authenticated();
    mocks.statusMaybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ai_data_sharing: null });
  });

  it("GET returns the recorded decision", async () => {
    authenticated();
    mocks.statusMaybeSingle.mockResolvedValue({
      data: { ai_data_sharing: "granted" },
      error: null,
    });

    const response = await GET();

    expect(await response.json()).toEqual({ ai_data_sharing: "granted" });
  });

  it("POST rejects an invalid decision with 400", async () => {
    authenticated();

    const response = await POST(postRequest({ decision: "maybe" }));

    expect(response.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("POST records consent for the caller's own user id", async () => {
    authenticated();

    const response = await POST(postRequest({ decision: "granted" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ai_data_sharing: "granted" });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER.id,
        ai_data_sharing: "granted",
        ai_data_sharing_at: expect.any(String),
      }),
    );
  });

  it("POST records a withdrawal (declined) the same way", async () => {
    authenticated();

    const response = await POST(postRequest({ decision: "declined" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ai_data_sharing: "declined" });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ ai_data_sharing: "declined" }),
    );
  });

  it("POST returns 500 when the decision cannot be stored", async () => {
    authenticated();
    mocks.upsert.mockResolvedValue({ error: { message: "db down" } });

    const response = await POST(postRequest({ decision: "granted" }));

    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe("CONSENT_SAVE_FAILED");
  });
});
