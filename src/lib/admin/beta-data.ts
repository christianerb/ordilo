import "server-only";
import { createClient } from "@/lib/supabase/admin";
import { berlinDay, startOfBerlinDayBefore } from "@/lib/berlin-date";
import { eventNameList, NOT_PRODUCT_USE_EVENTS } from "./event-filters";
import { fetchAllRows } from "./paginate";
import {
  summarizeBetaEvents,
  summarizeScanFailures,
  type BetaEvent,
} from "./beta-metrics";

export async function getBetaOverview(days: number) {
  const client = createClient();
  // Berlin calendar days, like the other admin tabs.
  const now = Date.now();
  const start = new Date(startOfBerlinDayBefore(now, days - 1));
  const since = start.toISOString();
  const events: BetaEvent[] = await fetchAllRows<BetaEvent>((from, to) =>
    client.from("product_events")
      .select("user_id,event_name,occurred_at,properties").gte("occurred_at", since)
      // The beta funnel never reads the database-written events.
      .not("event_name", "in", eventNameList(NOT_PRODUCT_USE_EVENTS))
      .order("occurred_at").order("id").range(from, to),
  );
  const documents = await fetchAllRows<{ status: string; failure_stage: string | null }>((from, to) =>
    client.from("documents").select("status,failure_stage")
      .gte("created_at", since).order("id").range(from, to),
  );
  const summary = summarizeBetaEvents(events, since);
  const daily = new Map(summary.daily.map((day) => [day.day, day.users]));
  return {
    ...summary,
    daily: Array.from({ length: days }, (_, index) => {
      const day = berlinDay(new Date(startOfBerlinDayBefore(now, days - 1 - index)));
      return { day, users: daily.get(day) ?? 0 };
    }),
    documents: documents.length,
    awaitingReview: documents.filter((document) => document.status === "analyzed").length,
    processing: documents.filter((document) => ["uploaded", "ocr_processing", "ocr_done", "analyzing"].includes(document.status)).length,
    failed: documents.filter((document) => document.status === "failed").length,
    failureStages: ["upload", "ocr", "analyze", "embed"].map((stage) => ({ stage, count: documents.filter((document) => document.status === "failed" && document.failure_stage === stage).length })),
    // App-reported failures, including the uploads that never produced a
    // documents row at all.
    scanFailures: summarizeScanFailures(events),
  };
}
