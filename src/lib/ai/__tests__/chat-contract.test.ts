import { describe, expect, it } from "vitest";

import {
  buildAssistantHistoryContext,
  buildPersonalChatPrompts,
  isSafePublicSourceUrl,
  parseChatWireEvent,
  splitChatNdjsonChunk,
  splitChatSources,
} from "@ordilo/chat-contract";

describe("shared chat contract", () => {
  it("builds exactly three prompts and personalizes one with family data", () => {
    const prompts = buildPersonalChatPrompts({
      members: [{ name: "Max", role: "Sohn" }],
    });

    expect(prompts).toHaveLength(3);
    expect(prompts[0]).toContain("Max");
    expect(new Set(prompts).size).toBe(3);
  });

  it("permits only public HTTPS source URLs", () => {
    expect(isSafePublicSourceUrl("https://example.org/info")).toBe(true);
    expect(isSafePublicSourceUrl("http://example.org/info")).toBe(false);
    expect(isSafePublicSourceUrl("javascript:alert(1)")).toBe(false);
    expect(isSafePublicSourceUrl("https://localhost/private")).toBe(false);
    expect(isSafePublicSourceUrl("https://127.0.0.1/private")).toBe(false);
  });

  it("keeps safe web evidence in follow-up context", () => {
    const history = buildAssistantHistoryContext({
      text: "Die Regel wurde 2026 geändert.",
      sources: [
          {
            document_id: "web-1",
            title: "Bundesministerium",
            excerpt: "Regelung ab Januar 2026",
            score: 0.9,
            origin: "web",
            url: "https://example.org/regeln",
          },
      ],
    });

    expect(history).toContain("Bundesministerium");
    expect(history).toContain("https://example.org/regeln");
    expect(history).toContain("Regelung ab Januar 2026");
  });

  it("parses the shared confirmation wire event for both clients", () => {
    expect(
      parseChatWireEvent({
        type: "confirmation_request",
        tool_name: "add_task",
        action_id: "action-1",
        action_args: { title: "Elternabend" },
        due_date: "2026-09-12",
      }),
    ).toEqual({
      type: "confirmation",
      action: {
        id: "action-1",
        toolName: "add_task",
        args: {
          title: "Elternabend",
          due_date: "2026-09-12",
        },
      },
    });
    expect(parseChatWireEvent({ type: "text" })).toBeNull();
  });

  it("rejects malformed cards and sources at the shared wire boundary", () => {
    expect(
      parseChatWireEvent({
        type: "sources",
        sources: [
          {
            document_id: "broken",
            title: "Quelle",
            score: 0.8,
          },
        ],
      }),
    ).toBeNull();
    expect(
      parseChatWireEvent({
        type: "card",
        card: {
          type: "dokument",
          title: "Brief",
          subtitle: null,
          fields: "not-an-array",
          actionDocumentId: null,
          hasSecret: false,
        },
      }),
    ).toBeNull();
  });

  it("shares NDJSON buffering and source ranking", () => {
    expect(
      splitChatNdjsonChunk(
        '{"type":"text","content":"A',
        '"}\n{"type":"done"}\npartial',
      ),
    ).toEqual({
      lines: [
        '{"type":"text","content":"A"}',
        '{"type":"done"}',
      ],
      rest: "partial",
    });

    const ranked = splitChatSources([
      { document_id: "low", title: "B", excerpt: "", score: 0.2 },
      { document_id: "high", title: "A", excerpt: "", score: 0.9 },
    ]);
    expect(ranked.best?.document_id).toBe("high");
    expect(ranked.rest.map((source) => source.document_id)).toEqual(["low"]);
  });
});
