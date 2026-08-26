/**
 * Separate per-family allowance for audio transcription.
 *
 * A spoken question becomes a normal chat message only when the person
 * actually sends its editable transcript. Counting both requests against
 * chat_usage would charge one question twice. Voice still needs its own
 * ceiling so an authenticated client cannot submit unbounded audio.
 */

type ServerClient = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

interface VoiceUsageRow {
  id: string;
  transcription_count: number;
}

interface VoiceUsageQuery {
  select(columns: string): VoiceUsageQuery;
  eq(column: string, value: string): VoiceUsageQuery;
  maybeSingle(): Promise<{ data: VoiceUsageRow | null }>;
  update(values: Pick<VoiceUsageRow, "transcription_count">): VoiceUsageQuery;
  insert(values: {
    family_id: string;
    usage_date: string;
    transcription_count: number;
  }): PromiseLike<unknown>;
}

function voiceUsageQuery(client: ServerClient): VoiceUsageQuery {
  // The generated Supabase database types are updated with the migration in
  // this branch. Keep this narrow bridge until that generated file lands.
  return client.from("voice_transcription_usage") as unknown as VoiceUsageQuery;
}

export const DAILY_VOICE_TRANSCRIPTION_LIMIT = 50;

export interface VoiceRateLimitResult {
  allowed: boolean;
  used: number;
  remaining: number;
}

export async function checkVoiceRateLimit(
  client: ServerClient,
  familyId: string,
): Promise<VoiceRateLimitResult> {
  const usageDate = new Date().toISOString().split("T")[0];
  const { data } = await voiceUsageQuery(client)
    .select("transcription_count")
    .eq("family_id", familyId)
    .eq("usage_date", usageDate)
    .maybeSingle();

  const used = data?.transcription_count ?? 0;
  return {
    allowed: used < DAILY_VOICE_TRANSCRIPTION_LIMIT,
    used,
    remaining: Math.max(0, DAILY_VOICE_TRANSCRIPTION_LIMIT - used),
  };
}

export async function recordVoiceTranscription(
  client: ServerClient,
  familyId: string,
): Promise<void> {
  const usageDate = new Date().toISOString().split("T")[0];
  const { data: existing } = await voiceUsageQuery(client)
    .select("id, transcription_count")
    .eq("family_id", familyId)
    .eq("usage_date", usageDate)
    .maybeSingle();

  if (existing) {
    await voiceUsageQuery(client)
      .update({ transcription_count: existing.transcription_count + 1 })
      .eq("id", existing.id);
    return;
  }

  await voiceUsageQuery(client).insert({
    family_id: familyId,
    usage_date: usageDate,
    transcription_count: 1,
  });
}
