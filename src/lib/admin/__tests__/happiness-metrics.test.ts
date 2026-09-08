import { expect, it } from "vitest";
import {
  countsFromVotes,
  summarizeReasons,
  toFeedbackComment,
} from "../happiness-metrics";

it("computes the positive rate from counted votes", () => {
  expect(countsFromVotes(2, 1)).toEqual({ positive: 2, negative: 1, positiveRate: 2 / 3 });
});

it("returns a null rate when there are no ratings", () => {
  expect(countsFromVotes(0, 0).positiveRate).toBeNull();
});

it("ranks negative reasons by frequency with German labels", () => {
  const result = summarizeReasons([
    { reasons: ["falsche_antwort"] },
    { reasons: ["falsche_antwort", "unvollstaendig"] },
    { reasons: [] },
  ]);
  expect(result).toEqual([
    { reason: "falsche_antwort", label: "Falsche Antwort", count: 2 },
    { reason: "unvollstaendig", label: "Unvollständig", count: 1 },
  ]);
});

it("maps comment rows to labeled feedback comments", () => {
  expect(
    toFeedbackComment({
      rating: "negative",
      comment: "Hat nicht geklappt.",
      query_kind: "fristen",
      created_at: "2026-09-05T10:00:00Z",
    }),
  ).toEqual({
    rating: "negative",
    comment: "Hat nicht geklappt.",
    queryKind: "Fristen und Termine",
    createdAt: "2026-09-05T10:00:00Z",
  });
});
