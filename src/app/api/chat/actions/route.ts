import { requireUser } from "@/lib/auth/require-user";
import { parseJsonBody } from "@/lib/api/parse-json";
import { jsonError, methodNotAllowed } from "@/lib/api/respond";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { executeTool, type ToolContext } from "@/lib/ai/tools";
import { chatActionConfirmationSchema } from "@/lib/schemas/chat";

/**
 * A claim still "running" after this long belongs to a crashed request —
 * the write never committed, so the family may safely retry.
 */
const CLAIM_STALE_MS = 10 * 60 * 1000;

/**
 * POST /api/chat/actions
 *
 * Executes exactly one action the family member explicitly accepted in an
 * Ordilo Action Card. This never accepts model prose, only the validated
 * tool name and proposal fields rendered in the card.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) return Response.json(auth.json, { status: auth.status });

  const parsed = await parseJsonBody(request, chatActionConfirmationSchema, {
    invalidPayload: "Diese Aktion konnte nicht übernommen werden.",
    payloadCode: "INVALID_CHAT_ACTION",
  });
  if (!parsed.ok) return parsed.response;

  const {
    family_id: familyId,
    action_id: actionId,
    tool_name: toolName,
    args,
  } = parsed.data;
  const client = await createServerClient();

  const { data: membership } = await client
    .from("family_memberships")
    .select("family_id")
    .eq("family_id", familyId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!membership) {
    return jsonError("Kein Zugriff auf diese Familie.", "FAMILY_ACCESS_DENIED", 403);
  }

  // Claim the proposal id BEFORE executing. The ledger row carries a
  // status because a uniqueness conflict alone does NOT prove success:
  // the first request may still be running (or may have crashed). The
  // ledger lives behind the service role only.
  const admin = createAdminClient();
  const ledgerTable = () => admin.from("chat_action_executions");
  const claim = {
    family_id: familyId,
    action_id: actionId,
    tool_name: toolName,
    status: "running",
  };
  const { error: claimError } = await ledgerTable().insert(claim);

  if (claimError) {
    if (claimError.code !== "23505") {
      return jsonError(
        "Die Aktion konnte nicht übernommen werden. Bitte versuche es erneut.",
        "CHAT_ACTION_FAILED",
        500,
      );
    }

    const { data: existing } = await ledgerTable()
      .select("status, executed_at")
      .eq("family_id", familyId)
      .eq("action_id", actionId)
      .maybeSingle();

    if (existing?.status === "completed") {
      return Response.json({
        success: true,
        duplicate: true,
        message: "Schon übernommen.",
      });
    }

    // A crashed request leaves a "running" row behind forever — after a
    // grace period it is treated like a failed one and may be reclaimed.
    const staleRunning =
      existing?.status === "running" &&
      Date.parse(existing.executed_at) < Date.now() - CLAIM_STALE_MS;

    if (existing?.status === "failed" || staleRunning) {
      await ledgerTable()
        .delete()
        .eq("family_id", familyId)
        .eq("action_id", actionId);
      const { error: reclaimError } = await ledgerTable().insert(claim);
      if (reclaimError) {
        // Lost the reclaim race — another request is executing right now.
        return jsonError(
          "Diese Aktion wird gerade übernommen. Warte einen Moment und tippe dann nochmal.",
          "CHAT_ACTION_IN_PROGRESS",
          409,
        );
      }
    } else {
      return jsonError(
        "Diese Aktion wird gerade übernommen. Warte einen Moment und tippe dann nochmal.",
        "CHAT_ACTION_IN_PROGRESS",
        409,
      );
    }
  }

  const context: ToolContext = {
    client,
    familyId,
    sources: [],
    speakerName: null,
  };

  // Success and failure are both recorded, never deleted: a duplicate tap
  // must find a completed row, and a failed row tells the next attempt it
  // may safely retry. Deleting on failure would reopen the race where a
  // retry reports "confirmed" for a write that never happened.
  const settleClaim = (status: "completed" | "failed") =>
    ledgerTable()
      .update({
        status,
        ...(status === "completed" ? { executed_at: new Date().toISOString() } : {}),
      })
      .eq("family_id", familyId)
      .eq("action_id", actionId)
      .then(undefined, () => undefined);

  try {
    const result = JSON.parse(
      await executeTool(toolName, { ...args, confirmed: true }, context),
    ) as Record<string, unknown>;

    if (result.error || !result.success) {
      await settleClaim("failed");
      return jsonError(
        typeof result.error === "string"
          ? result.error
          : "Die Aktion konnte nicht übernommen werden.",
        "CHAT_ACTION_FAILED",
        422,
      );
    }

    await settleClaim("completed");
    return Response.json({
      success: true,
      message:
        typeof result.message === "string"
          ? result.message
          : "Übernommen.",
      result,
    });
  } catch {
    await settleClaim("failed");
    return jsonError(
      "Die Aktion konnte nicht übernommen werden. Bitte versuche es erneut.",
      "CHAT_ACTION_FAILED",
      500,
    );
  }
}

export async function GET(): Promise<Response> {
  return methodNotAllowed();
}
