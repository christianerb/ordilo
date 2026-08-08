import { createHash } from "node:crypto";
import { requireUser } from "@/lib/auth/require-user";

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

function sessionFailed(): Response {
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
 * Auth:   401 without session.
 * Errors: 503 (no API key configured), 502 (OpenAI session failed).
 */
export async function POST(): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) return Response.json(auth.json, { status: auth.status });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return sessionUnavailable();
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
            // audio answer is ever generated (or paid for).
            modalities: ["text"],
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
      return sessionFailed();
    }

    const session = (await response.json()) as {
      client_secret?: { value?: string; expires_at?: number };
    };
    const value = session.client_secret?.value;
    if (!value) {
      return sessionFailed();
    }

    return Response.json({
      client_secret: value,
      expires_at: session.client_secret?.expires_at ?? null,
      model: REALTIME_MODEL,
    });
  } catch {
    return sessionFailed();
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
