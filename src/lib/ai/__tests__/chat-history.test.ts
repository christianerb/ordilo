import { describe, it, expect, vi } from "vitest";
import {
  estimateTokens,
  loadConversationMessages,
  saveAssistantMessage,
  truncateHistory,
  rowsToHistory,
  type ChatMessageRow,
} from "@/lib/ai/chat-history";
import type { HistoryMessage } from "@/lib/ai/chat";

// ---------------------------------------------------------------------------
// estimateTokens
// ---------------------------------------------------------------------------

describe("estimateTokens", () => {
  it("returns at least 1 for non-empty text", () => {
    expect(estimateTokens("a")).toBe(1);
  });

  it("returns 0 for empty text", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("approximates 4 chars per token", () => {
    expect(estimateTokens("abcdefgh")).toBe(2);
    expect(estimateTokens("abcdefghij")).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// truncateHistory
// ---------------------------------------------------------------------------

describe("truncateHistory", () => {
  it("returns history as-is when under MIN_MESSAGES_TO_KEEP", () => {
    const history: HistoryMessage[] = [
      { role: "user", content: "Hallo" },
      { role: "assistant", content: "Hi!" },
    ];
    expect(truncateHistory(history)).toBe(history);
  });

  it("returns all messages when within token budget", () => {
    const history: HistoryMessage[] = [];
    for (let i = 0; i < 20; i++) {
      history.push({ role: i % 2 === 0 ? "user" : "assistant", content: `Msg ${i}` });
    }
    const result = truncateHistory(history);
    expect(result).toHaveLength(20);
  });

  it("truncates from the front when token budget exceeded", () => {
    const history: HistoryMessage[] = [];
    // Create 100 messages with large content to exceed the 16k token budget.
    // Each message ~200 chars → ~50 tokens. 100 messages → ~5000 tokens.
    // Need more to exceed 16k: 400 messages × 50 tokens = 20k tokens.
    for (let i = 0; i < 400; i++) {
      history.push({
        role: i % 2 === 0 ? "user" : "assistant",
        content: "x".repeat(200) + `-${i}`,
      });
    }
    const result = truncateHistory(history);
    // Should be truncated (fewer than 400).
    expect(result.length).toBeLessThan(400);
    // Should keep the most recent messages.
    expect(result[result.length - 1].content).toContain("-399");
    // Should keep at least MIN_MESSAGES_TO_KEEP (6).
    expect(result.length).toBeGreaterThanOrEqual(6);
  });

  it("always keeps at least MIN_MESSAGES_TO_KEEP (6)", () => {
    const history: HistoryMessage[] = [];
    // Create 10 messages with very large content to far exceed the budget.
    for (let i = 0; i < 10; i++) {
      history.push({
        role: i % 2 === 0 ? "user" : "assistant",
        content: "x".repeat(100_000),
      });
    }
    const result = truncateHistory(history);
    expect(result.length).toBeGreaterThanOrEqual(6);
  });
});

// ---------------------------------------------------------------------------
// rowsToHistory
// ---------------------------------------------------------------------------

describe("rowsToHistory", () => {
  it("converts basic user and assistant rows", () => {
    const rows: ChatMessageRow[] = [
      {
        id: "1",
        conversation_id: "conv-1",
        family_id: "fam-1",
        role: "user",
        content: "Was muss ich erledigen?",
        sources: null,
        card: null,
        actions: null,
        feedback: null,
        created_at: "2026-07-01T10:00:00Z",
      },
      {
        id: "2",
        conversation_id: "conv-1",
        family_id: "fam-1",
        role: "assistant",
        content: "Du hast 2 Aufgaben.",
        sources: null,
        card: null,
        actions: null,
        feedback: null,
        created_at: "2026-07-01T10:00:01Z",
      },
    ];

    const history = rowsToHistory(rows);
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: "user", content: "Was muss ich erledigen?" });
    expect(history[1]).toEqual({ role: "assistant", content: "Du hast 2 Aufgaben." });
  });

  it("appends source names and answer-bearing excerpts to assistant history", () => {
    const rows: ChatMessageRow[] = [
      {
        id: "1",
        conversation_id: "conv-1",
        family_id: "fam-1",
        role: "assistant",
        content: "Ich habe folgendes gefunden.",
        sources: [
          { document_id: "doc-1", title: "Kita-Brief", excerpt: "...", score: 0.9 },
          { document_id: "doc-2", title: "Stromrechnung", excerpt: "...", score: 0.8 },
        ],
        card: null,
        actions: null,
        feedback: null,
        created_at: "2026-07-01T10:00:01Z",
      },
    ];

    const history = rowsToHistory(rows);
    expect(history).toHaveLength(1);
    expect(history[0].content).toContain("[Belege der vorherigen Antwort]");
    expect(history[0].content).toContain(
      "1. Familien-Unterlage: Kita-Brief — ...",
    );
    expect(history[0].content).toContain(
      "2. Familien-Unterlage: Stromrechnung — ...",
    );
  });

  it("does not append source annotation when sources is null", () => {
    const rows: ChatMessageRow[] = [
      {
        id: "1",
        conversation_id: "conv-1",
        family_id: "fam-1",
        role: "assistant",
        content: "Hallo!",
        sources: null,
        card: null,
        actions: null,
        feedback: null,
        created_at: "2026-07-01T10:00:01Z",
      },
    ];

    const history = rowsToHistory(rows);
    expect(history[0].content).toBe("Hallo!");
  });
});

describe("chat history persistence", () => {
  it("loads the newest rows and returns them oldest-first", async () => {
    const rows = [
      { id: "new", created_at: "2026-09-02T10:00:00Z" },
      { id: "old", created_at: "2026-09-01T10:00:00Z" },
    ];
    const order = vi.fn().mockReturnThis();
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order,
      limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
    };
    const client = {
      from: vi.fn(() => builder),
    } as unknown as Parameters<typeof loadConversationMessages>[0];

    const result = await loadConversationMessages(client, "conv-1", 2);

    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(result.map((row) => row.id)).toEqual(["old", "new"]);
  });

  it("persists response state and the single suggested follow-up", async () => {
    let payload: Record<string, unknown> | null = null;
    const builder = {
      insert: vi.fn((value: Record<string, unknown>) => {
        payload = value;
        return builder;
      }),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "message-1" },
        error: null,
      }),
    };
    const client = {
      from: vi.fn(() => builder),
    } as unknown as Parameters<typeof saveAssistantMessage>[0];

    await saveAssistantMessage(
      client,
      "conv-1",
      "fam-1",
      "Nur teilweise gefunden.",
      [],
      null,
      [],
      "partial",
      { label: "Weiter suchen", prompt: "Suche in weiteren Unterlagen." },
    );

    expect(payload).toMatchObject({
      response_state: "partial",
      suggestion: {
        label: "Weiter suchen",
        prompt: "Suche in weiteren Unterlagen.",
      },
    });
  });
});
