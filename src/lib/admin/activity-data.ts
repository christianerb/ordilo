import "server-only";
import { createClient } from "@/lib/supabase/admin";

export type RecentActivityEvent = {
  id: string;
  userId: string;
  eventName: string;
  occurredAt: string;
  properties: Record<string, unknown> | null;
};

/**
 * Latest product events across all accounts for the admin activity feed.
 * Contains no document content, filenames, or search terms.
 */
export async function getRecentActivity(limit = 60): Promise<RecentActivityEvent[]> {
  const client = createClient();
  const { data, error } = await client
    .from("product_events")
    .select("id,user_id,event_name,occurred_at,properties")
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
