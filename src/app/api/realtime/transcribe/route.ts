import { requireUser } from "@/lib/auth/require-user";
import {
  checkVoiceRateLimit,
  recordVoiceTranscription,
} from "@/lib/ai/voice-rate-limit";
import { createClient as createServerClient } from "@/lib/supabase/server";

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) return Response.json(auth.json, { status: auth.status });

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  const familyId = form?.get("family_id");
  if (!(audio instanceof File) || typeof familyId !== "string" || !familyId) {
    return Response.json(
      { error: "Die Aufnahme ist nicht vollständig.", code: "INVALID_AUDIO" },
      { status: 400 },
    );
  }
  if (audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
    return Response.json(
      { error: "Die Aufnahme ist zu groß.", code: "AUDIO_TOO_LARGE" },
      { status: 413 },
    );
  }

  const client = await createServerClient();
  const { data: membership } = await client
    .from("family_memberships")
    .select("family_id")
    .eq("family_id", familyId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!membership) {
    return Response.json(
      { error: "Kein Zugriff auf diese Familie.", code: "FAMILY_ACCESS_DENIED" },
      { status: 403 },
    );
  }
  const rateLimit = await checkVoiceRateLimit(client, familyId);
  if (!rateLimit.allowed) {
    return Response.json(
      {
        error: "Tageslimit für Spracheingaben erreicht. Bitte morgen weiter.",
        code: "VOICE_RATE_LIMIT_EXCEEDED",
      },
      { status: 429 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Spracheingabe ist gerade nicht verfügbar.", code: "VOICE_UNAVAILABLE" },
      { status: 503 },
    );
  }

  const body = new FormData();
  body.append("file", audio, audio.name || "ordilo-frage.m4a");
  body.append("model", "gpt-4o-mini-transcribe");
  body.append("language", "de");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
  });
  const result = (await response.json().catch(() => null)) as { text?: unknown } | null;
  if (!response.ok || typeof result?.text !== "string") {
    return Response.json(
      { error: "Die Spracheingabe hat nicht geklappt.", code: "TRANSCRIPTION_FAILED" },
      { status: 502 },
    );
  }
  await recordVoiceTranscription(client, familyId);
  return Response.json({ text: result.text });
}
