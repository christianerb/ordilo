import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { POST } from "@/app/api/chat/feedback/route";
import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";

function request(body: unknown) {
  return new Request("http://localhost/api/chat/feedback", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Mock server client: the feedback update succeeds (or fails with
 * `updateError`); the best-effort event lookup finds no message, so the
 * event insert is skipped.
 */
function mockServerClient({
  updateError = null,
}: {
  updateError?: unknown;
} = {}) {
  return {
    from: vi.fn((table: string) => {
      if (table === "chat_messages") {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: updateError }),
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi
                .fn()
                .mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe("POST /api/chat/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "user-1" },
      status: null,
      json: null,
    });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient(),
    );
  });

  it("returns 400 when message_id is missing", async () => {
    const response = await POST(request({ feedback: "positive" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Ungültiges Feedback (message_id und feedback erforderlich).",
      code: "INVALID_FEEDBACK_INPUT",
    });
  });

  it("returns 400 for an unknown feedback value", async () => {
    const response = await POST(
      request({ message_id: "m-1", feedback: "meh" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Ungültiges Feedback (message_id und feedback erforderlich).",
      code: "INVALID_FEEDBACK_INPUT",
    });
  });

  it("returns 400 for an unknown reason", async () => {
    const response = await POST(
      request({
        message_id: "m-1",
        feedback: "negative",
        reasons: ["falsche_antwort", "bogus"],
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Ungültiges Feedback (message_id und feedback erforderlich).",
      code: "INVALID_FEEDBACK_INPUT",
    });
  });

  it("stores valid feedback", async () => {
    const response = await POST(
      request({ message_id: "m-1", feedback: "positive" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});
