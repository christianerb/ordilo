import { describe, expect, it } from "vitest";

import {
  CHAT_EVAL_VERSION,
  CHAT_QUALITY_CASES_V1,
  scoreChatAnswer,
} from "@/lib/ai/evals/chat-quality-v1";

describe(`${CHAT_EVAL_VERSION} deterministic scoring contract`, () => {
  it("keeps every versioned reference answer above the acceptance floor", () => {
    const results = CHAT_QUALITY_CASES_V1.map((testCase) =>
      scoreChatAnswer(
        testCase,
        testCase.referenceAnswer,
        testCase.expectedState,
      ),
    );

    expect(CHAT_QUALITY_CASES_V1).toHaveLength(13);
    expect(new Set(CHAT_QUALITY_CASES_V1.map((testCase) => testCase.knowledgeSpace))).toEqual(
      new Set(["family", "general", "web", "mixed"]),
    );
    expect(results.every((result) => result.score >= 0.9)).toBe(true);
  });

  it("fails a correct answer that reads like a field read-out", () => {
    // Every fact and source is right; only the voice is missing. This is the
    // answer the family actually got, and it is not good enough.
    const result = scoreChatAnswer(
      CHAT_QUALITY_CASES_V1[0],
      "Hannas Deutschlandticket ist bis zum 31. August 2027 gültig. Quelle: Deutschlandticket.",
      "answered",
    );

    expect(result.failures).toContain("tone:source-tag");
    expect(result.score).toBeLessThan(0.9);
  });

  it("fails a one-sentence field read-out", () => {
    const result = scoreChatAnswer(
      CHAT_QUALITY_CASES_V1[0],
      "Hannas Deutschlandticket ist bis zum 31. August 2027 gültig.",
      "answered",
    );

    expect(result.failures.some((failure) => failure.startsWith("terse:"))).toBe(true);
  });

  it("accepts a compact two-sentence answer", () => {
    // The floor is sentence shape, not raw word count: a fact sentence
    // plus a source sentence is a real answer.
    const result = scoreChatAnswer(
      CHAT_QUALITY_CASES_V1[0],
      "Emmas Ticket gilt bis zum 30.09.2027. Das steht so auf ihrem Deutschlandticket.",
      "answered",
    );

    expect(result.failures).not.toContain("terse:12");
    expect(result.failures.some((failure) => failure.startsWith("terse:"))).toBe(false);
  });

  it("fails a vague answer that omits the requested fact and source", () => {
    const result = scoreChatAnswer(
      CHAT_QUALITY_CASES_V1[0],
      "Das könnte möglicherweise noch eine Weile gültig sein.",
      "answered",
    );

    expect(result.score).toBeLessThan(0.9);
    expect(result.failures).toContain("fact:31. August 2027");
    expect(result.failures).toContain("source:Deutschlandticket");
  });

  it("fails a closing sentence that names only a generic Unterlage", () => {
    const result = scoreChatAnswer(
      CHAT_QUALITY_CASES_V1[0],
      "Hannas Ticket gilt bis zum 31. August 2027, und bis dahin ist noch viel Zeit für euch. Das steht in der Unterlage zum Deutschlandticket.",
      "answered",
    );

    expect(result.failures).toContain("tone:generic-source");
  });

  it("accepts a source named inside the sentence instead", () => {
    const result = scoreChatAnswer(
      CHAT_QUALITY_CASES_V1[0],
      "Hannas Deutschlandticket gilt noch bis zum 31. August 2027 — so steht es auf dem Ticket selbst. Bis dahin müsst ihr euch darum also nicht kümmern.",
      "answered",
    );

    expect(result.failures).toEqual([]);
    expect(result.score).toBe(1);
  });

  const clarificationCase = {
    id: "clarify",
    knowledgeSpace: "family" as const,
    question: "Welche Anfangszeit nennt die Einladung für Hannah?",
    expectedState: "partial" as const,
    requiredFacts: [],
    maxWords: 60,
    // An honest clarifying question is legitimately short.
    minWords: 6,
    referenceAnswer: "",
    expectsClarification: true,
    clarificationOptions: ["Elternabend", "Schulfest"],
  };

  it("passes a single clarifying question that names both options", () => {
    const result = scoreChatAnswer(
      clarificationCase,
      "Für Hannah gibt es zwei Einladungen. Meinst du den Elternabend oder das Schulfest?",
      "partial",
    );

    expect(result.failures).toEqual([]);
    expect(result.score).toBe(1);
  });

  it("fails a guessed answer where a clarifying question was due", () => {
    const result = scoreChatAnswer(
      clarificationCase,
      "Der Elternabend für Hannah beginnt um 19:30 Uhr, das steht in der Einladung vom 15. September 2027.",
      "answered",
    );

    expect(result.failures).toContain("clarify:no-question");
    expect(result.failures).toContain("clarify:missing:Schulfest");
    expect(result.failures).toContain("state:answered");
  });

  it("fails a hedging answer that stacks several questions", () => {
    const result = scoreChatAnswer(
      clarificationCase,
      "Meinst du den Elternabend? Oder doch das Schulfest? Oder etwas ganz anderes?",
      "partial",
    );

    expect(result.failures).toContain("clarify:too-many-questions");
  });
});
