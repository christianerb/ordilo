import { expect, it } from "vitest";
import { summarizeFeedback, type FeedbackRow } from "../happiness-metrics";

const row = (patch: Partial<FeedbackRow>): FeedbackRow => ({
  rating: "positive",
  reasons: [],
  comment: null,
  query_kind: "suche",
  created_at: "2026-09-05T10:00:00Z",
  ...patch,
});

const WINDOW = "2026-09-01T00:00:00Z";

it("counts ratings overall and inside the window with a positive rate", () => {
  const result = summarizeFeedback(
    [
      row({}),
      row({ rating: "negative", reasons: ["falsche_antwort"] }),
      row({ created_at: "2026-07-01T10:00:00Z" }),
    ],
    WINDOW,
  );
  expect(result.total).toEqual({ positive: 2, negative: 1, positiveRate: 2 / 3 });
  expect(result.window).toEqual({ positive: 1, negative: 1, positiveRate: 0.5 });
});

it("returns a null rate when there are no ratings", () => {
  expect(summarizeFeedback([], WINDOW).total.positiveRate).toBeNull();
});

it("ranks negative reasons and keeps recent comments with labels", () => {
  const result = summarizeFeedback(
    [
      row({ rating: "negative", reasons: ["falsche_antwort"] }),
      row({ rating: "negative", reasons: ["falsche_antwort", "unvollstaendig"] }),
      row({ rating: "negative", comment: "Hat nicht geklappt.", query_kind: "fristen" }),
      row({ rating: "positive", reasons: ["falsche_antwort"] }),
    ],
    WINDOW,
  );
  expect(result.topReasons).toEqual([
    { reason: "falsche_antwort", label: "Falsche Antwort", count: 2 },
    { reason: "unvollstaendig", label: "Unvollständig", count: 1 },
  ]);
  expect(result.recentComments).toEqual([
    { rating: "negative", comment: "Hat nicht geklappt.", queryKind: "Fristen und Termine", createdAt: "2026-09-05T10:00:00Z" },
  ]);
});
