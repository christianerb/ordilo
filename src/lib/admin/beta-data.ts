import "server-only";
import { createClient } from "@/lib/supabase/admin";
import { summarizeBetaEvents, type BetaEvent } from "./beta-metrics";

export async function getBetaOverview(days: number) {
  const client = createClient();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const since = start.toISOString();
  const events: BetaEvent[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from("product_events")
      .select("user_id,event_name,occurred_at,properties").gte("occurred_at", since)
      .order("occurred_at").order("id").range(offset, offset + 999);
    if (error) throw error;
    events.push(...data);
    if (data.length < 1000) break;
  }
  const documents: { status: string; failure_stage: string | null }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from("documents").select("status,failure_stage")
      .gte("created_at", since).order("id").range(offset, offset + 999);
    if (error) throw error;
    documents.push(...data);
    if (data.length < 1000) break;
  }
  const summary = summarizeBetaEvents(events, since);
  const daily = new Map(summary.daily.map((day) => [day.day, day.users]));
  return {
    ...summary,
    daily: Array.from({ length: days }, (_, index) => {
      const day = new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10);
      return { day, users: daily.get(day) ?? 0 };
    }),
    documents: documents.length,
    awaitingReview: documents.filter((document) => document.status === "analyzed").length,
    processing: documents.filter((document) => ["uploaded", "ocr_processing", "ocr_done", "analyzing"].includes(document.status)).length,
    failed: documents.filter((document) => document.status === "failed").length,
    failureStages: ["upload", "ocr", "analyze", "embed"].map((stage) => ({ stage, count: documents.filter((document) => document.status === "failed" && document.failure_stage === stage).length })),
  };
}
