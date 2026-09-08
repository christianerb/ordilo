import "server-only";
import { createClient } from "@/lib/supabase/admin";
import { summarizeFeedback, type FeedbackRow } from "./happiness-metrics";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Satisfaction and frustration signals for the admin overview:
 * thumbs up/down on chat answers and failed document processing.
 */
export async function getHappinessOverview() {
  const client = createClient();
  const windowStart = new Date(Date.now() - 30 * DAY_MS).toISOString();

  const rows: FeedbackRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client
      .from("chat_feedback_events")
      .select("rating,reasons,comment,query_kind,created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }

  const [failedTotalResult, failedRecentResult] = await Promise.all([
    client.from("documents").select("id", { count: "exact", head: true }).eq("status", "failed"),
    client
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("created_at", windowStart),
  ]);
  if (failedTotalResult.error) throw failedTotalResult.error;
  if (failedRecentResult.error) throw failedRecentResult.error;

  return {
    feedback: summarizeFeedback(rows, windowStart),
    failedDocuments: {
      total: failedTotalResult.count ?? 0,
      last30Days: failedRecentResult.count ?? 0,
    },
  };
}
