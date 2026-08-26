/**
 * Server-only, atomic per-family allowance for audio transcription.
 *
 * A spoken question becomes a normal chat message only when the person
 * actually sends its editable transcript. Counting both requests against
 * chat_usage would charge one question twice. Voice still needs its own
 * ceiling so an authenticated client cannot submit unbounded audio.
 */

type AdminClient = ReturnType<typeof import("@/lib/supabase/admin").createClient>;

interface VoiceQuotaRpcResult {
  allowed: boolean;
  used: number;
  remaining: number;
}

interface VoiceQuotaClient {
  rpc(
    functionName: "reserve_voice_transcription",
    params: { p_family_id: string; p_limit: number },
  ): Promise<{ data: VoiceQuotaRpcResult[] | null; error: { message: string } | null }>;
}

function voiceQuotaClient(client: AdminClient): VoiceQuotaClient {
  // The RPCs are introduced by this branch's migration and will be included
  // in generated database types after it is applied.
  return client as unknown as VoiceQuotaClient;
}

export const DAILY_VOICE_TRANSCRIPTION_LIMIT = 50;

export async function reserveVoiceTranscription(
  client: AdminClient,
  familyId: string,
): Promise<VoiceQuotaRpcResult> {
  const { data, error } = await voiceQuotaClient(client).rpc(
    "reserve_voice_transcription",
    {
      p_family_id: familyId,
      p_limit: DAILY_VOICE_TRANSCRIPTION_LIMIT,
    },
  );
  if (error || !data?.[0]) {
    throw new Error(error?.message ?? "Voice quota reservation failed.");
  }
  return data[0];
}
