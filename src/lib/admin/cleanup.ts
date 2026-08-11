import "server-only";

import { createClient as createAdminClient } from "@/lib/supabase/admin";

const ACTIVITY_RETENTION_DAYS = 365;
const ACCESS_ATTEMPT_RETENTION_DAYS = 2;

export async function purgeExpiredAdminAnalytics(): Promise<void> {
  const admin = createAdminClient();
  const activityCutoff = new Date(
    Date.now() - ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const attemptCutoff = new Date(
    Date.now() - ACCESS_ATTEMPT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [events, attempts] = await Promise.all([
    admin.from("product_events").delete().lt("occurred_at", activityCutoff),
    admin
      .from("admin_access_attempts")
      .delete()
      .lt("attempted_at", attemptCutoff),
  ]);
  if (events.error) throw events.error;
  if (attempts.error) throw attempts.error;
}
