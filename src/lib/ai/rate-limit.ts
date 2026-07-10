/**
 * Per-family daily rate limiting and token-usage tracking for the chat API.
 *
 * Each family gets a daily message budget. When the budget is exceeded,
 * the chat route returns a 429-style error before calling OpenAI, preventing
 * cost runaway from a single family.
 *
 * Token usage is recorded after each chat completion so we have visibility
 * into per-family cost and can adjust limits.
 */

type ServerClient = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Maximum chat messages per family per day.
 *
 * A family assistant is used in short bursts (scan a letter, check a
 * deadline). 50 messages/day is generous for normal use while preventing
 * automated abuse.
 */
export const DAILY_MESSAGE_LIMIT = 50;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  /** Whether the request is allowed. */
  allowed: boolean;
  /** Messages used today. */
  used: number;
  /** Messages remaining today. */
  remaining: number;
}

// ---------------------------------------------------------------------------
// Rate limit check
// ---------------------------------------------------------------------------

/**
 * Check whether a family has exceeded its daily chat message limit.
 *
 * Queries the `chat_usage` table for today's count. Does NOT increment
 * the count — call {@link recordUsage} after the chat completes to record
 * the actual usage.
 *
 * @returns `{ allowed, used, remaining }`. `allowed` is false when the
 *          daily limit is reached.
 */
export async function checkRateLimit(
  client: ServerClient,
  familyId: string,
): Promise<RateLimitResult> {
  const today = new Date().toISOString().split("T")[0];

  const { data } = await client
    .from("chat_usage")
    .select("message_count")
    .eq("family_id", familyId)
    .eq("usage_date", today)
    .maybeSingle();

  const used = data?.message_count ?? 0;
  const remaining = Math.max(0, DAILY_MESSAGE_LIMIT - used);

  return {
    allowed: used < DAILY_MESSAGE_LIMIT,
    used,
    remaining,
  };
}

// ---------------------------------------------------------------------------
// Usage recording
// ---------------------------------------------------------------------------

/**
 * Record chat usage for a family after a chat completion.
 *
 * Upserts the daily `chat_usage` row, incrementing the message count by 1
 * and the token count by the given amount. Uses an upsert so the first
 * message of the day creates the row and subsequent messages update it.
 *
 * @param tokens - Total tokens used in this chat completion (prompt +
 *                 completion). 0 if unknown (streaming without usage).
 */
export async function recordUsage(
  client: ServerClient,
  familyId: string,
  tokens: number,
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  // Try to fetch the existing row first (upsert with RPC would be cleaner,
  // but a select-then-insert/update approach works with the JS client and
  // handles the race window acceptably for a family app).
  const { data: existing } = await client
    .from("chat_usage")
    .select("id, message_count, token_count")
    .eq("family_id", familyId)
    .eq("usage_date", today)
    .maybeSingle();

  if (existing) {
    await client
      .from("chat_usage")
      .update({
        message_count: existing.message_count + 1,
        token_count: existing.token_count + tokens,
      })
      .eq("id", existing.id);
  } else {
    await client.from("chat_usage").insert({
      family_id: familyId,
      usage_date: today,
      message_count: 1,
      token_count: tokens,
    });
  }
}
