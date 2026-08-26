import { describe, expect, it, vi } from "vitest";

import {
  DAILY_VOICE_TRANSCRIPTION_LIMIT,
  releaseVoiceTranscription,
  reserveVoiceTranscription,
} from "@/lib/ai/voice-rate-limit";

function createAdminClient() {
  const rpc = vi.fn();
  return { client: { rpc } as never, rpc };
}

describe("voice transcription rate limit", () => {
  it("reserves one transcription through the atomic database RPC", async () => {
    const { client, rpc } = createAdminClient();
    rpc.mockResolvedValue({
      data: [{ allowed: true, used: 3, remaining: 47 }],
      error: null,
    });

    await expect(reserveVoiceTranscription(client, "family-1")).resolves.toEqual({
      allowed: true,
      used: 3,
      remaining: 47,
    });
    expect(rpc).toHaveBeenCalledWith("reserve_voice_transcription", {
      p_family_id: "family-1",
      p_limit: DAILY_VOICE_TRANSCRIPTION_LIMIT,
    });
  });

  it("returns the atomic refusal without retrying a paid request", async () => {
    const { client, rpc } = createAdminClient();
    rpc.mockResolvedValue({
      data: [{ allowed: false, used: DAILY_VOICE_TRANSCRIPTION_LIMIT, remaining: 0 }],
      error: null,
    });

    await expect(reserveVoiceTranscription(client, "family-1")).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
    });
  });

  it("releases a reservation when transcription cannot complete", async () => {
    const { client, rpc } = createAdminClient();
    rpc.mockResolvedValue({ error: null });

    await releaseVoiceTranscription(client, "family-1", "2026-08-26");

    expect(rpc).toHaveBeenCalledWith("release_voice_transcription", {
      p_family_id: "family-1",
      p_usage_date: "2026-08-26",
    });
  });
});
