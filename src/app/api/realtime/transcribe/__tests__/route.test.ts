import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  membershipMaybeSingle: vi.fn(),
  reserveVoiceTranscription: vi.fn(),
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
}));

import { POST } from "@/app/api/realtime/transcribe/route";
import { getM4aDurationMillis } from "@/lib/audio-duration";

const fetchMock = vi.fn();

function atom(type: string, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(payload.length + 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, bytes.length);
  for (let index = 0; index < 4; index += 1) {
    bytes[4 + index] = type.charCodeAt(index);
  }
  bytes.set(payload, 8);
  return bytes;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

function descriptor(tag: number, payload: Uint8Array): Uint8Array {
  if (payload.length > 127) throw new Error("Test descriptor is too large.");
  return concat(new Uint8Array([tag, payload.length]), payload);
}

function uint32(...values: number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value));
  return bytes;
}

function m4aBytes(
  durationMillis = 1_000,
  minSize = 0,
  movieDurationMillis = durationMillis,
): Uint8Array {
  const sampleRate = 44_100;
  const frameSamples = 1_024;
  const frameCount = Math.max(
    1,
    Math.ceil((durationMillis * sampleRate) / (frameSamples * 1_000)),
  );
  const movieHeader = new Uint8Array(20);
  const movieView = new DataView(movieHeader.buffer);
  // Full box version/flags (0), creation/modification (0), timescale, duration.
  movieView.setUint32(12, 1_000);
  movieView.setUint32(16, movieDurationMillis);

  const mediaHeader = new Uint8Array(20);
  const mediaView = new DataView(mediaHeader.buffer);
  mediaView.setUint32(12, sampleRate);
  mediaView.setUint32(16, frameCount * frameSamples);

  const handler = new Uint8Array(12);
  handler.set(new TextEncoder().encode("soun"), 8);

  const decoderSpecific = descriptor(0x05, new Uint8Array([0x12, 0x10]));
  const decoderConfigHeader = new Uint8Array(13);
  decoderConfigHeader[0] = 0x40; // MPEG-4 AAC
  decoderConfigHeader[1] = 0x15; // Audio stream
  const decoderConfig = descriptor(
    0x04,
    concat(decoderConfigHeader, decoderSpecific),
  );
  const esDescriptor = descriptor(
    0x03,
    concat(new Uint8Array([0x00, 0x01, 0x00]), decoderConfig),
  );
  const esds = atom("esds", concat(new Uint8Array(4), esDescriptor));
  const audioSampleEntry = atom("mp4a", concat(new Uint8Array(28), esds));
  const fileType = atom("ftyp", new Uint8Array());
  const mediaData = atom("mdat", new Uint8Array(frameCount));
  const buildMovie = (mediaOffset: number): Uint8Array => {
    const sampleDescription = atom(
      "stsd",
      concat(uint32(0, 1), audioSampleEntry),
    );
    const sampleSizes = atom("stsz", uint32(0, 1, frameCount));
    const timeToSample = atom("stts", uint32(0, 1, frameCount, frameSamples));
    const sampleToChunk = atom("stsc", uint32(0, 1, 1, frameCount, 1));
    const chunkOffsets = atom("stco", uint32(0, 1, mediaOffset));
    const sampleTable = atom(
      "stbl",
      concat(
        sampleDescription,
        sampleSizes,
        timeToSample,
        sampleToChunk,
        chunkOffsets,
      ),
    );
    const media = atom(
      "mdia",
      concat(
        atom("mdhd", mediaHeader),
        atom("hdlr", handler),
        atom("minf", sampleTable),
      ),
    );
    return atom(
      "moov",
      concat(atom("mvhd", movieHeader), atom("trak", media)),
    );
  };
  const initialMovie = buildMovie(0);
  const movie = buildMovie(fileType.length + initialMovie.length + 8);
  const bytes = new Uint8Array(
    Math.max(minSize, fileType.length + movie.length + mediaData.length),
  );
  bytes.set(fileType, 0);
  bytes.set(movie, fileType.length);
  bytes.set(mediaData, fileType.length + movie.length);
  return bytes;
}

function recordingRequest(
  size = 64,
  durationMillis = 1_000,
  movieDurationMillis = durationMillis,
): Request {
  // Undici wraps multipart files in a different File realm. The route's
  // guard deliberately uses `instanceof File`, so this direct form-data
  // stand-in keeps the test in the same realm as the route.
  const form = new Map<string, FormDataEntryValue>([
    ["family_id", "family-1"],
    [
      "audio",
      new File(
        [m4aBytes(durationMillis, size, movieDurationMillis).buffer as ArrayBuffer],
        "frage.m4a",
        { type: "audio/m4a" },
      ),
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

  it("rejects an M4A recording longer than two minutes before reserving quota", async () => {
    const response = await POST(recordingRequest(256, 120_001));
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.code).toBe("AUDIO_TOO_LONG");
    expect(mocks.reserveVoiceTranscription).not.toHaveBeenCalled();
  });

  it("rejects long audio even when the movie header claims one second", async () => {
    const response = await POST(recordingRequest(256, 120_001, 1_000));

    expect(response.status).toBe(413);
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
  });

  it("keeps the quota reservation after a paid provider attempt", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 502 }));

    const response = await POST(recordingRequest());

    expect(response.status).toBe(502);
    expect(mocks.reserveVoiceTranscription).toHaveBeenCalledTimes(1);
  });

  it("does not reserve quota when transcription is unavailable", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const response = await POST(recordingRequest());

    expect(response.status).toBe(503);
    expect(mocks.reserveVoiceTranscription).not.toHaveBeenCalled();
  });
});

describe("getM4aDurationMillis", () => {
  it("reads duration from the AAC sample table", () => {
    const duration = getM4aDurationMillis(m4aBytes(12_345).buffer as ArrayBuffer);

    expect(duration).toBeGreaterThanOrEqual(12_345);
    expect(duration).toBeLessThan(12_370);
  });

  it("ignores a forged short movie-header duration", () => {
    const duration = getM4aDurationMillis(
      m4aBytes(121_000, 0, 1_000).buffer as ArrayBuffer,
    );

    expect(duration).toBeGreaterThan(120_000);
  });

  it("rejects sample tables whose chunks do not point into media data", () => {
    const bytes = m4aBytes(1_000);
    const stcoTypeOffset = bytes.findIndex(
      (_, index) =>
        String.fromCharCode(...bytes.slice(index, index + 4)) === "stco",
    );
    expect(stcoTypeOffset).toBeGreaterThan(0);
    new DataView(bytes.buffer).setUint32(stcoTypeOffset + 12, 0);

    expect(getM4aDurationMillis(bytes.buffer as ArrayBuffer)).toBeNull();
  });

  it("rejects unreferenced media payloads", () => {
    const bytes = concat(m4aBytes(1_000), atom("mdat", new Uint8Array([1])));

    expect(getM4aDurationMillis(bytes.buffer as ArrayBuffer)).toBeNull();
  });

  it("rejects incomplete containers", () => {
    expect(getM4aDurationMillis(new Uint8Array([0, 0, 0, 8]).buffer)).toBeNull();
  });
});
