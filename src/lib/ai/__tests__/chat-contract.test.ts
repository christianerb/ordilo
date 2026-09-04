import { describe, expect, it } from "vitest";

import {
  buildAssistantHistoryContext,
  buildPersonalChatPrompts,
  extractHistoryEvidence,
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

  it("redacts structured identifiers before excerpts re-enter the model", () => {
    const history = buildAssistantHistoryContext({
      text: "Die Überweisung ist raus.",
      sources: [
        {
          document_id: "doc-1",
          title: "Kontoauszug",
          excerpt:
            "IBAN DE89 3704 0044 0532 0130 00, Steuer-ID 12.345.678.901, Versicherungsnummer A123456789",
          score: 0.9,
        },
      ],
    });

    expect(history).not.toContain("DE89");
    expect(history).not.toContain("12.345.678.901");
    expect(history).not.toContain("A123456789");
    expect(history).toContain("[IBAN]");
    expect(history).toContain("[Steuer-ID]");
    expect(history).toContain("[Versicherungsnummer]");
  });

  it("masks alphanumeric IBANs completely, not just the prefix", () => {
    const history = buildAssistantHistoryContext({
      text: "Die Überweisung ist raus.",
      sources: [
        {
          document_id: "doc-1",
          title: "Kontoauszug",
          excerpt: "IBAN GB29 NWBK 6016 1331 9268 19 bitte verwenden",
          score: 0.9,
        },
      ],
    });

    expect(history).toContain("[IBAN]");
    expect(history).toContain("bitte verwenden");
    expect(history).not.toContain("NWBK");
    expect(history).not.toContain("6016");
    expect(history).not.toContain("GB29");
  });

  it("extracts evidence sections from client-built history turns", () => {
    const history = [
      { role: "user", content: "Wie war das nochmal?" },
      {
        role: "assistant",
        content: buildAssistantHistoryContext({
          text: "Das Ticket gilt noch.",
          sources: [
            {
              document_id: "doc-1",
              title: "Kita Vertrag",
              excerpt: "Das vorläufige Ticket gilt bis Ende August.",
              score: 0.9,
            },
          ],
        }),
      },
      { role: "assistant", content: "Kurze Antwort ohne Belege." },
    ];

    const evidence = extractHistoryEvidence(history);

    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toContain("Das vorläufige Ticket gilt bis Ende August.");
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
