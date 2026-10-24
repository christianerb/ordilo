import "server-only";
import { createClient } from "@/lib/supabase/admin";
import { eventNameList, FEED_HIDDEN_EVENTS } from "./event-filters";

export type RecentActivityEvent = {
  id: string;
  userId: string;
  eventName: string;
  occurredAt: string;
  properties: Record<string, unknown> | null;
};

/**
 * Latest product events across all accounts for the admin activity feed.
 * Contains no document content, filenames, or search terms. Daily
 * app_opened rows are left out; the Wachstum tab counts them.
 */
export async function getRecentActivity(limit = 60): Promise<RecentActivityEvent[]> {
  const client = createClient();
  const { data, error } = await client
    .from("product_events")
    .select("id,user_id,event_name,occurred_at,properties")
    // One row per person and day would crowd out the real actions.
    .not("event_name", "in", eventNameList(FEED_HIDDEN_EVENTS))
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    eventName: row.event_name,
    occurredAt: row.occurred_at,
    properties: row.properties ?? null,
  }));
}
