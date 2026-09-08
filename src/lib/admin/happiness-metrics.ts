/**
 * Aggregates chat feedback into admin-facing satisfaction signals.
 * Pure module so the counting stays testable without a database.
 */

export type FeedbackRow = {
  rating: string;
  reasons: string[];
  comment: string | null;
  query_kind: string;
  created_at: string;
};

export type FeedbackCounts = {
  positive: number;
  negative: number;
  /** Share of positive ratings, null when there are no ratings yet. */
  positiveRate: number | null;
};

export type FeedbackComment = {
  rating: string;
  comment: string;
  queryKind: string;
  createdAt: string;
};

export const FEEDBACK_REASON_LABELS: Record<string, string> = {
  falsche_antwort: "Falsche Antwort",
  falsches_dokument: "Falsches Dokument",
  unvollstaendig: "Unvollständig",
};

export const QUERY_KIND_LABELS: Record<string, string> = {
  fristen: "Fristen und Termine",
  nummern: "Nummern und Kennziffern",
  personen: "Personen",
  suche: "Suche",
};

function countRatings(rows: FeedbackRow[]): FeedbackCounts {
  const positive = rows.filter((row) => row.rating === "positive").length;
  const negative = rows.filter((row) => row.rating === "negative").length;
  const total = positive + negative;
  return {
    positive,
    negative,
    positiveRate: total === 0 ? null : positive / total,
  };
}

/**
 * @param windowStart ISO timestamp; rows at or after it count as "recent".
 */
export function summarizeFeedback(rows: FeedbackRow[], windowStart: string) {
  const reasonCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.rating !== "negative") continue;
    for (const reason of row.reasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }

  return {
    total: countRatings(rows),
    window: countRatings(rows.filter((row) => row.created_at >= windowStart)),
    topReasons: [...reasonCounts.entries()]
      .map(([reason, count]) => ({
        reason,
        label: FEEDBACK_REASON_LABELS[reason] ?? reason,
        count,
      }))
      .sort((a, b) => b.count - a.count),
    recentComments: rows
      .filter((row) => row.comment)
      .map((row) => ({
        rating: row.rating,
        comment: row.comment as string,
        queryKind: QUERY_KIND_LABELS[row.query_kind] ?? row.query_kind,
        createdAt: row.created_at,
      }))
      .slice(0, 5),
  };
}
