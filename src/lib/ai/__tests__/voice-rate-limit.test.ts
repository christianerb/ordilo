import { describe, expect, it, vi } from "vitest";

import {
  checkVoiceRateLimit,
  DAILY_VOICE_TRANSCRIPTION_LIMIT,
  recordVoiceTranscription,
} from "@/lib/ai/voice-rate-limit";

function createClient(existing: { id: string; transcription_count: number } | null) {
  const update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
  const insert = vi.fn().mockResolvedValue({ error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: existing });
  const select = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({ maybeSingle })),
      maybeSingle,
    })),
  }));
  const from = vi.fn(() => ({ select, update, insert }));
  return {
    client: { from } as never,
    insert,
    update,
  };
}

describe("voice transcription rate limit", () => {
  it("allows a family below the dedicated voice limit", async () => {
    const { client } = createClient({ id: "usage-1", transcription_count: 3 });

    await expect(checkVoiceRateLimit(client, "family-1")).resolves.toMatchObject({
      allowed: true,
      used: 3,
      remaining: DAILY_VOICE_TRANSCRIPTION_LIMIT - 3,
    });
  });

  it("refuses a family at the dedicated voice limit", async () => {
    const { client } = createClient({
      id: "usage-1",
      transcription_count: DAILY_VOICE_TRANSCRIPTION_LIMIT,
    });

    await expect(checkVoiceRateLimit(client, "family-1")).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
    });
  });

  it("increments existing usage without touching chat_usage", async () => {
    const { client, update, insert } = createClient({
      id: "usage-1",
      transcription_count: 2,
    });

    await recordVoiceTranscription(client, "family-1");

    expect(update).toHaveBeenCalledWith({ transcription_count: 3 });
    expect(insert).not.toHaveBeenCalled();
  });
});
