import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { parseJsonBody } from "@/lib/api/parse-json";
import { jsonError, methodNotAllowed } from "@/lib/api/respond";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { AiDataSharingStatus } from "@/lib/ai/consent";

/**
 * GET /api/me/ai-consent — the user's recorded decision about sharing
 * content with third-party AI processors (OpenAI, Datalab).
 *
 * Response: { ai_data_sharing: "granted" | "declined" | null }
 * `null` means the user has never been asked — clients show the consent
 * sheet before the first scan, question, or dictation.
 *
 * POST /api/me/ai-consent — record that decision.
 *
 * Body: { "decision": "granted" | "declined" }
 *
 * The write goes through the RLS-scoped server client: the
 * user_consents policies limit every operation to the caller's own row,
 * so one user can never read or set another's decision. Re-answering is
 * allowed — consent can be granted after a decline and withdrawn again
 * in the settings.
 */

const decisionSchema = z.object({
  decision: z.enum(["granted", "declined"]),
});

export async function GET(): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) {
    return Response.json(auth.json, { status: auth.status });
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("user_consents")
    .select("ai_data_sharing")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) {
    console.error("[consent] Status konnte nicht gelesen werden:", error);
    return jsonError(
      "Deine Einstellung konnte nicht geladen werden.",
      "CONSENT_READ_FAILED",
      503,
    );
  }

  const status: AiDataSharingStatus = data?.ai_data_sharing ?? null;
  return Response.json({ ai_data_sharing: status }, { status: 200 });
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) {
    return Response.json(auth.json, { status: auth.status });
  }

  const parsed = await parseJsonBody(request, decisionSchema, {
    invalidPayload: "Ungültige Anfrage.",
    payloadCode: "INVALID_CONSENT_DECISION",
  });
  if (!parsed.ok) return parsed.response;

  const supabase = await createServerClient();
  const { error } = await supabase.from("user_consents").upsert({
    user_id: auth.user.id,
    ai_data_sharing: parsed.data.decision,
    ai_data_sharing_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[consent] Entscheidung konnte nicht gespeichert werden:", error);
    return jsonError(
      "Deine Einstellung konnte nicht gespeichert werden. Bitte versuch es nochmal.",
      "CONSENT_SAVE_FAILED",
      500,
    );
  }

  return Response.json(
    { ai_data_sharing: parsed.data.decision },
    { status: 200 },
  );
}

export async function PUT(): Promise<Response> {
  return methodNotAllowed();
}

export async function DELETE(): Promise<Response> {
  return methodNotAllowed();
}
