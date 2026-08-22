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
import { MAX_CHAT_MESSAGE_LENGTH } from "@/lib/schemas/chat";
import { DAILY_MESSAGE_LIMIT } from "@/lib/ai/rate-limit";

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

/**
 * Result of the family_memberships membership check, configurable per
 * test. Defaults to "user is a member" (set in beforeEach) so the happy
 * path passes the route's family-membership verification.
 */
let membershipResult: { data: unknown; error: unknown };

/**
 * Result of the chat_usage rate-limit query, configurable per test.
 * Defaults to "no row" (= 0 messages used today) so the happy path
 * passes the rate-limit check.
 */
let chatUsageResult: { data: unknown; error: unknown };
let assistantMessageSaveRejects = false;

/** The mocked .from() of the server client — lets tests assert which
 * tables a request touched (e.g. that a 429 creates no conversation). */
let fromMock: ReturnType<typeof vi.fn>;

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
  chainable.insert = vi.fn().mockImplementation((row: { role?: string }) => {
    if (row.role === "assistant" && assistantMessageSaveRejects) {
      return Promise.reject(new Error("Supabase transport failed"));
    }
    return {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: "conv-1" }, error: null }),
      }),
    };
  });

  // Dedicated builder for the membership verification query so tests can
  // control membership independently of the other .from() calls.
  const membershipChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockImplementation(() =>
      Promise.resolve(membershipResult),
    ),
  };

  // Dedicated builder for the chat_usage rate-limit query so tests can
  // simulate an exhausted daily limit. insert/update are needed too:
  // recordUsage fires (void) after a successful answer.
  const usageChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockImplementation(() =>
      Promise.resolve(chatUsageResult),
    ),
  };

  fromMock = vi.fn((table: string) =>
    table === "family_memberships"
      ? membershipChain
      : table === "chat_usage"
        ? usageChain
        : chainable,
  );

  (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1", email: "test@example.com" } },
      }),
    },
    from: fromMock,
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
    return { user: mockAuthUser, status: null, json: null };
  }),
}));

// ---------------------------------------------------------------------------
// beforeEach
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthUser = { id: "user-1", email: "test@example.com" };
  // Default: the user is a member of the family (happy path).
  membershipResult = { data: { family_id: FAMILY_ID }, error: null };
  // Default: no usage row → 0 messages used today (under the limit).
  chatUsageResult = { data: null, error: null };
  assistantMessageSaveRejects = false;
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

  it("returns 400 for a non-UUID family_id", async () => {
    const response = await POST(
      createRequest(validBody({ family_id: "not-a-uuid" })),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("INVALID_CHAT_INPUT");
    expect(streamAgenticAnswer).not.toHaveBeenCalled();
  });

  it("returns 400 when the message exceeds the maximum length", async () => {
    const response = await POST(
      createRequest(
        validBody({ message: "A".repeat(MAX_CHAT_MESSAGE_LENGTH + 1) }),
      ),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("INVALID_CHAT_INPUT");
    expect(streamAgenticAnswer).not.toHaveBeenCalled();
  });

  it("accepts a message at exactly the maximum length", async () => {
    (streamAgenticAnswer as ReturnType<typeof vi.fn>).mockResolvedValue(
      ndjsonStream([{ type: "done" }]),
    );

    const response = await POST(
      createRequest(
        validBody({ message: "A".repeat(MAX_CHAT_MESSAGE_LENGTH) }),
      ),
    );
    expect(response.status).toBe(200);
  });

  it("returns 403 when the user is not a member of the family", async () => {
    // The membership row is invisible under RLS for non-members, so the
    // verification query finds nothing → access denied before any
    // rate-limit check or OpenAI call (cost protection).
    membershipResult = { data: null, error: null };

    const response = await POST(createRequest(validBody()));
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.code).toBe("FAMILY_ACCESS_DENIED");
    expect(streamAgenticAnswer).not.toHaveBeenCalled();
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

  it("announces the persisted assistant message id via message_saved", async () => {
    (streamAgenticAnswer as ReturnType<typeof vi.fn>).mockResolvedValue(
      ndjsonStream([
        { type: "text", content: "Du hast 2 Aufgaben." },
        { type: "sources", sources: [] },
        { type: "done" },
      ]),
    );

    const response = await POST(createRequest(validBody()));
    expect(response.status).toBe(200);

    const text = await response.text();
    const events = text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string });
    // The mock insert returns id "conv-1"; the event must arrive after the
    // answer content but before the terminal event, so clients can attach
    // feedback to what they rendered.
    expect(events.some((event) => event.type === "conversation")).toBe(true);
    expect(events.at(-2)).toEqual({
      type: "message_saved",
      message_id: "conv-1",
    });
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("persists card-only answers and announces their saved message id", async () => {
    (streamAgenticAnswer as ReturnType<typeof vi.fn>).mockResolvedValue(
      ndjsonStream([
        { type: "text", content: "Ich prüfe das kurz." },
        { type: "replace", content: "" },
        { type: "card", card: { type: "tasks", tasks: [] } },
        { type: "done" },
      ]),
    );

    const response = await POST(createRequest(validBody()));
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string; message_id?: string });

    expect(events).toContainEqual({
      type: "message_saved",
      message_id: "conv-1",
    });
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("finishes the stream when best-effort assistant persistence rejects", async () => {
    assistantMessageSaveRejects = true;
    (streamAgenticAnswer as ReturnType<typeof vi.fn>).mockResolvedValue(
      ndjsonStream([
        { type: "text", content: "Die Antwort bleibt sichtbar." },
        { type: "done" },
      ]),
    );

    const response = await POST(createRequest(validBody()));
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string });

    expect(events.some((event) => event.type === "message_saved")).toBe(false);
    expect(events.at(-1)).toEqual({ type: "done" });
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

  it("returns 429 and creates no conversation when the daily limit is reached", async () => {
    chatUsageResult = {
      data: { message_count: DAILY_MESSAGE_LIMIT },
      error: null,
    };

    const response = await POST(createRequest(validBody()));
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(streamAgenticAnswer).not.toHaveBeenCalled();

    // The rejected request must not leave an empty conversation behind —
    // creation is deferred until after membership + rate-limit approval.
    expect(
      fromMock.mock.calls.some(([table]) => table === "chat_conversations"),
    ).toBe(false);
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
