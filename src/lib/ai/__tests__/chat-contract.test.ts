import { describe, expect, it } from "vitest";

import {
  buildAssistantHistoryContext,
  buildPersonalChatPrompts,
  isSafePublicSourceUrl,
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
});
