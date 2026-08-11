import { requireUser } from "@/lib/auth/require-user";
import { parseJsonBody } from "@/lib/api/parse-json";
import { jsonError, methodNotAllowed } from "@/lib/api/respond";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { executeTool, type ToolContext } from "@/lib/ai/tools";
import { chatActionConfirmationSchema } from "@/lib/schemas/chat";

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

  const { family_id: familyId, tool_name: toolName, args } = parsed.data;
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

  const context: ToolContext = {
    client,
    familyId,
    sources: [],
    speakerName: null,
  };

  try {
    const result = JSON.parse(
      await executeTool(toolName, { ...args, confirmed: true }, context),
    ) as Record<string, unknown>;

    if (result.error || !result.success) {
      return jsonError(
        typeof result.error === "string"
          ? result.error
          : "Die Aktion konnte nicht übernommen werden.",
        "CHAT_ACTION_FAILED",
        422,
      );
    }

    return Response.json({
      success: true,
      message:
        typeof result.message === "string"
          ? result.message
          : "Übernommen.",
      result,
    });
  } catch {
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
