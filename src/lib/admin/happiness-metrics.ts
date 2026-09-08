/**
 * Aggregates chat feedback into admin-facing satisfaction signals.
 * Pure module so the counting stays testable without a database.
 */

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

export function countsFromVotes(positive: number, negative: number): FeedbackCounts {
  const total = positive + negative;
  return {
    positive,
    negative,
    positiveRate: total === 0 ? null : positive / total,
  };
}

/** Ranks the ticked reasons of negative ratings, most frequent first. */
export function summarizeReasons(rows: Array<{ reasons: string[] }>) {
  const reasonCounts = new Map<string, number>();
  for (const row of rows) {
    for (const reason of row.reasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }
  return [...reasonCounts.entries()]
    .map(([reason, count]) => ({
      reason,
      label: FEEDBACK_REASON_LABELS[reason] ?? reason,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

export function toFeedbackComment(row: {
  rating: string;
  comment: string;
  query_kind: string;
  created_at: string;
}): FeedbackComment {
  return {
    rating: row.rating,
    comment: row.comment,
    queryKind: QUERY_KIND_LABELS[row.query_kind] ?? row.query_kind,
    createdAt: row.created_at,
  };
}
