import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase server client.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// Mock the agentic chat streaming function.
vi.mock("@/lib/ai/chat", async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import("@/lib/ai/chat");
  return {
    ...actual,
    streamAgenticAnswer: vi.fn(),
  };
});

import { POST, GET } from "@/app/api/chat/route";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { streamAgenticAnswer, ChatError } from "@/lib/ai/chat";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FAMILY_ID = "660e8400-e29b-41d4-a716-446655440001";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createRequestWithHeaders(
  body: unknown,
  extraHeaders: Record<string, string>,
): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    message: "Was muss ich diese Woche erledigen?",
    family_id: FAMILY_ID,
    ...overrides,
  };
}

function mockServerClient() {
  // Build a chainable mock that supports all query builder methods
  // used across the chat route (rate limit, conversation, messages,
  // speaker identity, usage recording).
  const chainable: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = [
    "select", "eq", "order", "update", "single", "maybeSingle",
    "insert", "in", "limit", "lte", "gte", "not", "or",
  ];
  for (const m of methods) {
    chainable[m] = vi.fn().mockReturnThis();
  }
  // maybeSingle / single return a resolved result (no data by default).
  chainable.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  chainable.single = vi.fn().mockResolvedValue({ data: { id: "conv-1" }, error: null });
  // insert returns a chainable too (for .insert().select().single() patterns).
  chainable.insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: "conv-1" }, error: null }),
    }),
  });

  (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1", email: "test@example.com" } },
      }),
    },
    from: vi.fn(() => chainable),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  });
}

/** Create a ReadableStream from NDJSON lines. */
function ndjsonStream(lines: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
      }
      controller.close();
    },
  });
}

// Mock requireUser
let mockAuthUser: { id: string; email: string } | null = {
  id: "user-1",
  email: "test@example.com",
};

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn().mockImplementation(async () => {
    if (!mockAuthUser) {
      return {
        status: 401,
        json: { error: "Nicht authentifiziert.", code: "UNAUTHORIZED" },
      };
    }
    return { status: null, json: null };
  }),
}));

// ---------------------------------------------------------------------------
// beforeEach
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthUser = { id: "user-1", email: "test@example.com" };
  mockServerClient();
});

// ---------------------------------------------------------------------------
// POST /api/chat
// ---------------------------------------------------------------------------

describe("POST /api/chat", () => {
  it("returns 401 without authentication", async () => {
    mockAuthUser = null;
    const response = await POST(createRequest(validBody()));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 for missing message", async () => {
    const response = await POST(
      createRequest({ family_id: FAMILY_ID }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("INVALID_CHAT_INPUT");
  });

  it("returns 400 for missing family_id", async () => {
    const response = await POST(
      createRequest({ message: "Test" }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("INVALID_CHAT_INPUT");
  });

  it("returns 400 for invalid JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("INVALID_JSON");
  });

  it("returns a streaming response with correct content type", async () => {
    (streamAgenticAnswer as ReturnType<typeof vi.fn>).mockResolvedValue(
      ndjsonStream([
        { type: "text", content: "Hallo" },
        { type: "sources", sources: [] },
        { type: "done" },
      ]),
    );

    const response = await POST(createRequest(validBody()));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain(
      "application/x-ndjson",
    );
    expect(response.body).toBeDefined();
  });

  it("passes conversation history to streamAgenticAnswer", async () => {
    (streamAgenticAnswer as ReturnType<typeof vi.fn>).mockResolvedValue(
      ndjsonStream([{ type: "done" }]),
    );

    const history = [
      { role: "user", content: "Was muss ich erledigen?" },
      { role: "assistant", content: "Du hast 2 Aufgaben." },
    ];

    await POST(createRequest(validBody({ history })));

    expect(streamAgenticAnswer).toHaveBeenCalledWith(
      expect.any(String),
      history,
      expect.objectContaining({ familyId: FAMILY_ID }),
    );
  });

  it("returns 500 on ChatError (before stream starts)", async () => {
    (streamAgenticAnswer as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ChatError("OpenAI: API-Fehler.", "OPENAI_API_ERROR", 500),
    );

    const response = await POST(createRequest(validBody()));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.code).toBe("OPENAI_API_ERROR");
  });

  it("returns 500 on generic error", async () => {
    (streamAgenticAnswer as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Unexpected"),
    );

    const response = await POST(createRequest(validBody()));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.code).toBe("CHAT_FAILED");
  });

  it("returns simulated error in dev mode with x-dev-simulate-failure header", async () => {
    const response = await POST(
      createRequestWithHeaders(validBody(), {
        "x-dev-simulate-failure": "chat",
      }),
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.code).toBe("OPENAI_API_ERROR");
  });
});

// ---------------------------------------------------------------------------
// GET /api/chat
// ---------------------------------------------------------------------------

describe("GET /api/chat", () => {
  it("returns 405 method not allowed", async () => {
    const response = await GET();
    expect(response.status).toBe(405);
    const body = await response.json();
    expect(body.code).toBe("METHOD_NOT_ALLOWED");
  });
});
