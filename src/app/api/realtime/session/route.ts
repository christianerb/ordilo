import { createHash } from "node:crypto";
import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { checkRateLimit, recordUsage } from "@/lib/ai/rate-limit";

const REALTIME_MODEL = "gpt-realtime-2.1";

function sessionUnavailable(): Response {
  return Response.json(
    {
      error: "Spracheingabe ist gerade nicht verfügbar.",
      code: "REALTIME_UNAVAILABLE",
    },
    { status: 503 },
  );
}

function sessionFailed(reason: string): Response {
  // Without this the 502 carries no trace of WHY OpenAI refused (bad
  // model name, rejected session parameter, expired key), and the client
  // only ever sees the generic German sentence below.
  console.error("[realtime] Client secret could not be minted:", reason);
  return Response.json(
    {
      error: "Spracheingabe konnte nicht gestartet werden.",
      code: "REALTIME_SESSION_FAILED",
    },
    { status: 502 },
  );
}

/**
 * POST /api/realtime/session — creates a short-lived Realtime client
 * secret for browser WebRTC. The OpenAI API key never reaches the device;
 * planner writes still go through the authenticated chat tools and their
 * confirmation gate.
 *
 * Auth:   401 without session, 403 without a family.
 * Rate:   429 (RATE_LIMIT_EXCEEDED) when the family's daily budget is
 *         used up — a minted secret permits direct Realtime connections
 *         that bypass the /api/chat cost guard, so minting itself
 *         consumes one unit of the daily budget.
 * Errors: 503 (no API key configured), 502 (OpenAI session failed).
 */
export async function POST(): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) return Response.json(auth.json, { status: auth.status });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return sessionUnavailable();
  }

  // Resolve the user's family (RLS: only own memberships are visible).
  const supabase = await createServerClient();
  const { data: membership } = await supabase
    .from("family_memberships")
    .select("family_id")
    .eq("user_id", auth.user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return Response.json(
      { error: "Keine Familie gefunden.", code: "NO_FAMILY" },
      { status: 403 },
    );
  }

  // Cost guard: without this, any authenticated client could mint
  // unlimited secrets and stream audio directly against OpenAI.
  const rateLimit = await checkRateLimit(supabase, membership.family_id);
  if (!rateLimit.allowed) {
    return Response.json(
      {
        error: "Tageslimit erreicht. Bitte morgen erneut versuchen.",
        code: "RATE_LIMIT_EXCEEDED",
      },
      { status: 429 },
    );
  }

  const safetyIdentifier = createHash("sha256")
    .update(auth.user.id)
    .digest("hex");

  try {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": safetyIdentifier,
        },
        body: JSON.stringify({
          session: {
            type: "realtime",
            model: REALTIME_MODEL,
            instructions:
              "Du hörst einen deutschen Familienplaner-Wunsch. Gib nur eine klare, vollständige deutsche Transkription zurück. Lege niemals selbst Termine oder Aufgaben an und behaupte niemals, dass etwas gespeichert wurde.",
            // Text-only output: the session exists to transcribe, so no
            // audio answer is ever generated (or paid for). GA Realtime
            // names this `output_modalities` — the beta-era `modalities`
            // is rejected as an unknown parameter, which took down the
            // whole PWA voice path (the only caller without a native
            // Web Speech fallback).
            output_modalities: ["text"],
            audio: {
              input: {
                transcription: { model: "gpt-live-transcribe", language: "de" },
                // Server VAD ends the turn when the speaker pauses, so the
                // transcript arrives without a separate commit tap.
                turn_detection: { type: "server_vad" },
              },
            },
          },
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return sessionFailed(
        `OpenAI responded ${response.status}: ${detail.slice(0, 500)}`,
      );
    }

    // `/v1/realtime/client_secrets` returns the secret fields at the top
    // level. The former sessions endpoint used a nested `client_secret`
    // object, so keep that shape as a rollout-safe fallback.
    const session = (await response.json()) as {
      value?: string;
      expires_at?: number;
      client_secret?: { value?: string; expires_at?: number };
    };
    const value = session.value ?? session.client_secret?.value;
    if (!value) {
      return sessionFailed("OpenAI returned no client secret value");
    }

    // Count the minted session against the family's daily budget (token
    // count is unknown for realtime audio; the unit is what matters).
    await recordUsage(supabase, membership.family_id, 0);

    return Response.json({
      client_secret: value,
      expires_at:
        session.expires_at ?? session.client_secret?.expires_at ?? null,
      model: REALTIME_MODEL,
    });
  } catch (err) {
    return sessionFailed(`request to OpenAI threw: ${String(err)}`);
  }
}

export async function GET(): Promise<Response> {
  return Response.json(
    {
      error: "Methode nicht erlaubt. Bitte POST verwenden.",
      code: "METHOD_NOT_ALLOWED",
    },
    { status: 405 },
  );
}
