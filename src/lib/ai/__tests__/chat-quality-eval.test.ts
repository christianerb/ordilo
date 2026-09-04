import { describe, expect, it } from "vitest";

import {
  CHAT_EVAL_VERSION,
  CHAT_QUALITY_CASES_V1,
  scoreChatAnswer,
} from "@/lib/ai/evals/chat-quality-v1";

describe(`${CHAT_EVAL_VERSION} deterministic quality gate`, () => {
  it("keeps every versioned reference answer above the acceptance floor", () => {
    const results = CHAT_QUALITY_CASES_V1.map((testCase) =>
      scoreChatAnswer(
        testCase,
        testCase.referenceAnswer,
        testCase.expectedState,
      ),
    );

    expect(CHAT_QUALITY_CASES_V1).toHaveLength(8);
    expect(new Set(CHAT_QUALITY_CASES_V1.map((testCase) => testCase.knowledgeSpace))).toEqual(
      new Set(["family", "general", "web", "mixed"]),
    );
    expect(results.every((result) => result.score >= 0.9)).toBe(true);
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
