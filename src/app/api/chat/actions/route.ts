import { requireUser } from "@/lib/auth/require-user";
import { parseJsonBody } from "@/lib/api/parse-json";
import { jsonError, methodNotAllowed } from "@/lib/api/respond";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { executeTool, type ToolContext } from "@/lib/ai/tools";
import { chatActionConfirmationSchema } from "@/lib/schemas/chat";

/**
 * A claim still "running" after this long almost certainly belongs to a
 * crashed request. It is never replayed (the write may have committed) —
 * the copy just switches from "wait a moment" to "uncertain, ask again".
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

    if (!existing) {
      // A 23505 without a visible row is a transient inconsistency — never
      // continue without holding a claim.
      return jsonError(
        "Die Aktion konnte nicht übernommen werden. Bitte versuche es erneut.",
        "CHAT_ACTION_FAILED",
        500,
      );
    }

    if (existing.status === "failed") {
      // Safe to reclaim: every tool reports an error only BEFORE its
      // write commits (single inserts fail atomically; post-insert steps
      // like note analysis swallow their own errors and still report
      // success). A failed row therefore proves no write happened.
      //
      // The reclaim is a single conditional UPDATE (compare-and-swap on
      // status), not a delete+insert pair: two concurrent retries must
      // not be able to delete each other's fresh claim and both execute
      // the write. Exactly one of them flips failed → running; the other
      // matches no row and backs off with 409.
      const { data: reclaimed, error: reclaimError } = await ledgerTable()
        .update({ status: "running", executed_at: new Date().toISOString() })
        .eq("family_id", familyId)
        .eq("action_id", actionId)
        .eq("status", "failed")
        .select("id");
      if (reclaimError || !reclaimed?.length) {
        return jsonError(
          "Diese Aktion wird gerade übernommen. Warte einen Moment und tippe dann nochmal.",
          "CHAT_ACTION_IN_PROGRESS",
          409,
        );
      }
    } else if (existing.status === "running") {
      // NEVER replay a running claim, no matter how old: the request may
      // still be executing, or may have crashed between the write and the
      // settle update — in that case the write DID commit and replaying
      // would duplicate the task/event/member/note. The person dismisses
      // the card and asks again, which creates a fresh proposal id.
      const stale =
        Date.parse(existing.executed_at) < Date.now() - CLAIM_STALE_MS;
      return jsonError(
        stale
          ? "Der Status dieser Aktion ist unklar. Tippe auf Ablehnen und bitte Ordilo nochmal darum — so verhindern wir doppelte Einträge."
          : "Diese Aktion wird gerade übernommen. Warte einen Moment und tippe dann nochmal.",
        stale ? "CHAT_ACTION_UNCERTAIN" : "CHAT_ACTION_IN_PROGRESS",
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
