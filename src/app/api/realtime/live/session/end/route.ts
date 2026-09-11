import { z } from "zod";

import { recordLiveConversationEnded } from "@/lib/analytics/api-usage";
import { recordProductEvent } from "@/lib/analytics/product-events";
import { requireUser } from "@/lib/auth/require-user";
import { LIVE_CONVERSATION_MAX_DURATION_MS } from "@/lib/billing/live-conversation";
import { createClient as createServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  family_id: z.string().uuid(),
  operation_id: z.string().uuid(),
  duration_ms: z.number().int().nonnegative(),
  reason: z.enum(["user", "limit", "background", "error"]),
});

export async function POST(request: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) return Response.json(auth.json, { status: auth.status });

  const parsed = bodySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "Sitzungsende ungültig.", code: "INVALID_LIVE_END" },
      { status: 400 },
    );
  }

  const body = parsed.data;
  const supabase = await createServerClient();
  const { data: membership } = await supabase
    .from("family_memberships")
    .select("family_id")
    .eq("family_id", body.family_id)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!membership) {
    return Response.json(
      { error: "Kein Zugriff auf diese Familie.", code: "FAMILY_ACCESS_DENIED" },
      { status: 403 },
    );
  }

  const durationMillis = Math.min(
    body.duration_ms,
    LIVE_CONVERSATION_MAX_DURATION_MS,
  );
  await Promise.all([
    recordLiveConversationEnded({
      operationId: body.operation_id,
      durationMillis,
      userId: auth.user.id,
    }),
    recordProductEvent(supabase, {
      userId: auth.user.id,
      familyId: body.family_id,
      eventName: "live_conversation_ended",
      properties: {
        duration_seconds: Math.round(durationMillis / 1_000),
        reason: body.reason,
      },
    }),
  ]);

  return Response.json({ success: true });
}
