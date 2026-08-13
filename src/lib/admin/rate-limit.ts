import "server-only";

import { createClient as createAdminClient } from "@/lib/supabase/admin";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export async function isAdminCodeRateLimited(userId: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("admin_access_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("attempted_at", since);

  // Fail closed if the rate-limit store is unavailable.
  return Boolean(error || (count ?? 0) >= MAX_ATTEMPTS);
}

export async function recordFailedAdminCodeAttempt(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("admin_access_attempts").insert({ user_id: userId });
}
