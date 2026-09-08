import "server-only";
import { createClient } from "@/lib/supabase/admin";
import {
  countsFromVotes,
  summarizeReasons,
  toFeedbackComment,
} from "./happiness-metrics";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Satisfaction and frustration signals for the admin overview:
 * thumbs up/down on chat answers and failed document processing.
 *
 * Aggregates are counted in the database; only the reason rows of the
 * 30-day window and the five newest comments are transferred, so the
 * overview stays fast no matter how large the feedback history grows.
 */
export async function getHappinessOverview() {
  const client = createClient();
  const windowStart = new Date(Date.now() - 30 * DAY_MS).toISOString();

  const countVotes = (rating: string, since?: string) => {
    let query = client
      .from("chat_feedback_events")
      .select("id", { count: "exact", head: true })
      .eq("rating", rating);
    if (since) query = query.gte("created_at", since);
    return query;
  };

  const [
    positiveTotal,
    negativeTotal,
    positiveWindow,
    negativeWindow,
    negativeReasonRows,
    commentRows,
    failedTotalResult,
    failedRecentResult,
  ] = await Promise.all([
    countVotes("positive"),
    countVotes("negative"),
    countVotes("positive", windowStart),
    countVotes("negative", windowStart),
    client
      .from("chat_feedback_events")
      .select("reasons")
      .eq("rating", "negative")
      .gte("created_at", windowStart),
    client
      .from("chat_feedback_events")
      .select("rating,comment,query_kind,created_at")
      .not("comment", "is", null)
      .order("created_at", { ascending: false })
      .limit(5),
    client.from("documents").select("id", { count: "exact", head: true }).eq("status", "failed"),
    client
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("created_at", windowStart),
  ]);

  for (const result of [
    positiveTotal,
    negativeTotal,
    positiveWindow,
    negativeWindow,
    failedTotalResult,
    failedRecentResult,
  ]) {
    if (result.error) throw result.error;
  }
  if (negativeReasonRows.error) throw negativeReasonRows.error;
  if (commentRows.error) throw commentRows.error;

  return {
    feedback: {
      total: countsFromVotes(positiveTotal.count ?? 0, negativeTotal.count ?? 0),
      window: countsFromVotes(positiveWindow.count ?? 0, negativeWindow.count ?? 0),
      topReasons: summarizeReasons(negativeReasonRows.data ?? []),
      recentComments: (commentRows.data ?? [])
        .filter((row): row is typeof row & { comment: string } => Boolean(row.comment))
        .map(toFeedbackComment),
    },
    failedDocuments: {
      total: failedTotalResult.count ?? 0,
      last30Days: failedRecentResult.count ?? 0,
    },
  };
}
