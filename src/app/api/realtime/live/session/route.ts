import { createHash } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import {
  attributeUsageUser,
  recordLiveConversationStarted,
} from "@/lib/analytics/api-usage";
import { requireUser } from "@/lib/auth/require-user";
import {
  releaseMonthlyUsage,
  reserveMonthlyUsage,
} from "@/lib/billing/quota";
import {
  hasLiveConversationAccess,
  isLiveConversationPreview,
  LIVE_CONVERSATION_MAX_DURATION_MS,
} from "@/lib/billing/live-conversation";
import { createClient as createServerClient } from "@/lib/supabase/server";

const LIVE_MODEL = "gpt-live-1";

const requestSchema = z.object({
  family_id: z.string().uuid(),
  operation_id: z.string().uuid(),
  sdp: z.string().min(1).max(64 * 1_024),
});

function refusal(
  status: number,
  error: string,
  code: string,
): Response {
  Sentry.captureMessage(`Live conversation refused (${code})`, {
    level: "warning",
    tags: { area: "live_conversation", live_refusal: code },
  });
  return Response.json({ error, code }, { status });
}

export async function POST(request: Request): Promise<Response> {
  return handleLiveSession(request);
}

async function handleLiveSession(request: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) return Response.json(auth.json, { status: auth.status });
  attributeUsageUser(auth.user.id);

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return refusal(
      400,
      "Die Live-Unterhaltung konnte nicht gestartet werden.",
      "INVALID_LIVE_REQUEST",
    );
  }

  const { family_id: familyId, operation_id: operationId } = parsed.data;
  const supabase = await createServerClient();
  const { data: membership } = await supabase
    .from("family_memberships")
    .select("family_id")
    .eq("family_id", familyId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!membership) {
    return refusal(
      403,
      "Kein Zugriff auf diese Familie.",
      "FAMILY_ACCESS_DENIED",
    );
  }

  try {
    if (!(await hasLiveConversationAccess(familyId))) {
      return refusal(
        402,
        "Mit Ordilo sprechen ist in Premium enthalten.",
        "PREMIUM_REQUIRED",
      );
    }
  } catch {
    return refusal(
      503,
      "Dein Premium-Zugang konnte gerade nicht geprüft werden.",
      "ENTITLEMENT_CHECK_UNAVAILABLE",
    );
  }

  // Local preview sessions exist to test devices before a payment provider
  // can create an entitlement; they must not hit the free plan's zero limit.
  const preview = isLiveConversationPreview();
  let reserved = false;
  if (!preview) {
    try {
      const reservation = await reserveMonthlyUsage({
        familyId,
        metric: "live_conversation",
        operationKey: operationId,
      });
      if (!reservation.allowed) {
        return refusal(
          429,
          "Deine Live-Gespräche für diesen Monat sind aufgebraucht.",
          "MONTHLY_LIVE_QUOTA_EXCEEDED",
        );
      }
      if (reservation.duplicate) {
        return refusal(
          409,
          "Dieses Live-Gespräch wurde bereits gestartet.",
          "DUPLICATE_LIVE_OPERATION",
        );
      }
      reserved = true;
    } catch {
      return refusal(
        503,
        "Dein Live-Kontingent konnte gerade nicht geprüft werden.",
        "ENTITLEMENT_CHECK_UNAVAILABLE",
      );
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    await releaseReservation(familyId, operationId, reserved);
    return refusal(
      503,
      "Live mit Ordilo ist gerade nicht verfügbar.",
      "LIVE_UNAVAILABLE",
    );
  }

  const safetyIdentifier = createHash("sha256")
    .update(auth.user.id)
    .digest("hex");

  try {
    const response = await fetch(
      "https://api.openai.com/v1/live/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": safetyIdentifier,
        },
        body: JSON.stringify({
          session: {
            model: LIVE_MODEL,
            instructions:
              "Du bist die ruhige Stimme von Ordilo. Antworte auf Deutsch, warm und knapp. " +
              "Delegiere jede Frage zu Familie, Dokumenten, Terminen oder Aufgaben an den Client. " +
              "Sage bei Bedarf kurz, dass du nachschaust. Sobald der Client das Ergebnis sendet, sprich es direkt aus. " +
              "Fakten dazu stammen ausschließlich aus der Antwort des Ordilo-Backends. " +
              "Gib diese Fakten vollständig und ohne Ergänzungen wieder. " +
              "Behaupte nie, dass eine Aufgabe, Notiz oder ein Termin gespeichert wurde. " +
              "Sage bei einem Vorschlag, dass er auf dem Bildschirm bestätigt werden muss.",
            delegation: {
              type: "client",
            },
          },
          transport: {
            type: "webrtc",
            sdp: parsed.data.sdp,
          },
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      await releaseReservation(familyId, operationId, reserved);
      Sentry.captureException(
        new Error(
          `GPT Live client secret failed (${response.status}): ${detail.slice(0, 300)}`,
        ),
        {
          tags: {
            area: "live_conversation",
            live_refusal: "LIVE_SESSION_FAILED",
            model: LIVE_MODEL,
          },
        },
      );
      return refusal(
        502,
        "Live mit Ordilo konnte nicht gestartet werden.",
        "LIVE_SESSION_FAILED",
      );
    }

    const result = (await response.json()) as {
      session?: { id?: string };
      transport?: { type?: string; sdp?: string };
    };
    if (
      !result.session?.id ||
      result.transport?.type !== "webrtc" ||
      !result.transport.sdp
    ) {
      await releaseReservation(familyId, operationId, reserved);
      return refusal(
        502,
        "Live mit Ordilo konnte nicht gestartet werden.",
        "LIVE_SESSION_FAILED",
      );
    }

    await recordLiveConversationStarted({
      operationId,
      userId: auth.user.id,
      providerRequestId: response.headers.get("x-request-id"),
    });

    return Response.json({
      session_id: result.session.id,
      sdp: result.transport.sdp,
      max_duration_ms: LIVE_CONVERSATION_MAX_DURATION_MS,
      model: LIVE_MODEL,
      operation_id: operationId,
    }, { status: 201 });
  } catch (error) {
    await releaseReservation(familyId, operationId, reserved);
    Sentry.captureException(error, {
      tags: { area: "live_conversation", model: LIVE_MODEL },
    });
    return refusal(
      502,
      "Live mit Ordilo konnte nicht gestartet werden.",
      "LIVE_SESSION_FAILED",
    );
  }
}

async function releaseReservation(
  familyId: string,
  operationId: string,
  reserved: boolean,
): Promise<void> {
  if (!reserved) return;
  try {
    await releaseMonthlyUsage({
      familyId,
      metric: "live_conversation",
      operationKey: operationId,
    });
  } catch {
    Sentry.captureMessage("Live conversation quota release failed", {
      level: "warning",
      tags: { area: "live_conversation" },
    });
  }
}
