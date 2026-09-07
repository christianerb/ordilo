import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

  it("asks the model for the voice it is then scored on", () => {
    // The rubric rejects a one-line answer and a bare source tag. The live
    // model eval is scored by that same rubric, so the prompt it sends has
    // to ask for the same thing — otherwise it penalises the model for
    // obeying and stops measuring production behaviour.
    const script = readFileSync(resolve(process.cwd(), "scripts/model-chat-eval.ts"), "utf8");
    expect(script).toContain("zwei bis vier");
    expect(script).toContain("Etikett");
    expect(script).not.toContain("Antworte kurz und direkt");
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
    expect(result.failures.some((failure) => failure.startsWith("terse:"))).toBe(true);
    expect(result.score).toBeLessThan(0.9);
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
});
