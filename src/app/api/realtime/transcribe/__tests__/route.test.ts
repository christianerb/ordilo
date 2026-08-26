import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  membershipMaybeSingle: vi.fn(),
  reserveVoiceTranscription: vi.fn(),
  releaseVoiceTranscription: vi.fn(),
  adminClient: { rpc: vi.fn() },
}));

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: () => mocks.requireUser(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: mocks.membershipMaybeSingle })),
        })),
      })),
    })),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createClient: () => mocks.adminClient,
}));

vi.mock("@/lib/ai/voice-rate-limit", () => ({
  reserveVoiceTranscription: (...args: unknown[]) =>
    mocks.reserveVoiceTranscription(...args),
  releaseVoiceTranscription: (...args: unknown[]) =>
    mocks.releaseVoiceTranscription(...args),
}));

import { POST } from "@/app/api/realtime/transcribe/route";

const fetchMock = vi.fn();

function recordingRequest(size = 32): Request {
  // Undici wraps multipart files in a different File realm. The route's
  // guard deliberately uses `instanceof File`, so this direct form-data
  // stand-in keeps the test in the same realm as the route.
  const form = new Map<string, FormDataEntryValue>([
    ["family_id", "family-1"],
    [
      "audio",
      new File([new Uint8Array(size)], "frage.m4a", { type: "audio/m4a" }),
    ],
  ]);
  return {
    formData: async () => form,
  } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubGlobal("fetch", fetchMock);
  mocks.requireUser.mockResolvedValue({
    user: { id: "user-1" },
    status: null,
    json: null,
  });
  mocks.membershipMaybeSingle.mockResolvedValue({ data: { family_id: "family-1" } });
  mocks.reserveVoiceTranscription.mockResolvedValue({
    allowed: true,
    used: 1,
    remaining: 49,
  });
  mocks.releaseVoiceTranscription.mockResolvedValue(undefined);
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ text: "Wann ist der Elternabend?" }), {
      status: 200,
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/realtime/transcribe", () => {
  it("rejects unauthenticated callers before reading audio", async () => {
    mocks.requireUser.mockResolvedValue({
      user: null,
      status: 401,
      json: { error: "Nicht angemeldet." },
    });

    const response = await POST(recordingRequest());

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects recordings outside the allowed family", async () => {
    mocks.membershipMaybeSingle.mockResolvedValue({ data: null });

    const response = await POST(recordingRequest());

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("enforces the separate voice allowance before calling OpenAI", async () => {
    mocks.reserveVoiceTranscription.mockResolvedValue({
      allowed: false,
      used: 50,
      remaining: 0,
    });

    const response = await POST(recordingRequest());
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.code).toBe("VOICE_RATE_LIMIT_EXCEEDED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized recording before reserving quota", async () => {
    const response = await POST(recordingRequest(8 * 1024 * 1024 + 1));

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.reserveVoiceTranscription).not.toHaveBeenCalled();
  });

  it("transcribes German audio after an atomic reservation", async () => {
    const response = await POST(recordingRequest());

    await expect(response.json()).resolves.toEqual({
      text: "Wann ist der Elternabend?",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/audio/transcriptions",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mocks.reserveVoiceTranscription).toHaveBeenCalledWith(
      mocks.adminClient,
      "family-1",
    );
    expect(mocks.releaseVoiceTranscription).not.toHaveBeenCalled();
  });

  it("releases the quota reservation when OpenAI rejects the transcription", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 502 }));

    const response = await POST(recordingRequest());

    expect(response.status).toBe(502);
    expect(mocks.releaseVoiceTranscription).toHaveBeenCalledWith(
      mocks.adminClient,
      "family-1",
    );
  });

  it("does not reserve quota when transcription is unavailable", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const response = await POST(recordingRequest());

    expect(response.status).toBe(503);
    expect(mocks.reserveVoiceTranscription).not.toHaveBeenCalled();
  });
});
