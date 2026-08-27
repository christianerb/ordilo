import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// WebRTC / media mocks (jsdom has neither RTCPeerConnection nor mediaDevices)
// ---------------------------------------------------------------------------

class MockDataChannel {
  readyState: RTCDataChannelState = "open";
  onmessage: ((event: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  emit(event: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}

class MockRTCPeerConnection {
  static instance: MockRTCPeerConnection | null = null;
  onconnectionstatechange: (() => void) | null = null;
  connectionState: RTCPeerConnectionState = "connected";
  dataChannel = new MockDataChannel();
  addTrack = vi.fn();
  createDataChannel = vi.fn(() => this.dataChannel);
  createOffer = vi.fn(async () => ({ sdp: "offer-sdp" }));
  setLocalDescription = vi.fn(async () => {});
  setRemoteDescription = vi.fn(async () => {});
  close = vi.fn();

  constructor() {
    MockRTCPeerConnection.instance = this;
  }
}

const mockTrack = { stop: vi.fn() };
const mockGetUserMedia = vi.fn();

const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/api/realtime/session")) {
    return new Response(
      JSON.stringify({ client_secret: "secret-1", model: "gpt-realtime-2.1" }),
      { status: 200 },
    );
  }
  return new Response("answer-sdp", { status: 200 });
});

import {
  computeAudioLevel,
  createLevelTracker,
  useRealtimeTranscription,
} from "@/lib/realtime/use-realtime-transcription";

function setup() {
  const onTranscript = vi.fn();
  const onError = vi.fn();
  const view = renderHook(() =>
    useRealtimeTranscription({ onTranscript, onError }),
  );
  return { onTranscript, onError, ...view };
}

async function startSession(
  result: { current: ReturnType<typeof useRealtimeTranscription> },
) {
  await act(async () => {
    await result.current.start();
  });
  const pc = MockRTCPeerConnection.instance;
  if (!pc) throw new Error("peer connection was not created");
  act(() => {
    pc.dataChannel.onopen?.();
  });
  return pc;
}

beforeEach(() => {
  vi.clearAllMocks();
  MockRTCPeerConnection.instance = null;
  vi.stubGlobal("RTCPeerConnection", MockRTCPeerConnection);
  vi.stubGlobal("fetch", mockFetch);
  mockGetUserMedia.mockResolvedValue({
    getTracks: () => [mockTrack],
  } as unknown as MediaStream);
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: mockGetUserMedia },
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useRealtimeTranscription", () => {
  it("delivers the model transcript and returns to idle", async () => {
    const { result, onTranscript, onError } = setup();

    const pc = await startSession(result);
    expect(result.current.status).toBe("listening");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/realtime/session",
      expect.objectContaining({ method: "POST" }),
    );

    act(() => {
      pc.dataChannel.emit({
        type: "response.output_text.done",
        text: "Zahnarzt für Emma morgen um 15 Uhr",
      });
    });

    expect(onTranscript).toHaveBeenCalledWith(
      "Zahnarzt für Emma morgen um 15 Uhr",
    );
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
    expect(pc.close).toHaveBeenCalled();
    expect(mockTrack.stop).toHaveBeenCalled();
  });

  it("falls back to the raw input transcription when the model adds nothing", async () => {
    const { result, onTranscript } = setup();
    const pc = await startSession(result);

    act(() => {
      pc.dataChannel.emit({
        type: "conversation.item.input_audio_transcription.completed",
        transcript: "Herbstferien zwölfter bis achtzehnter Oktober",
      });
    });
    act(() => {
      pc.dataChannel.emit({ type: "response.done", response: { output: [] } });
    });

    expect(onTranscript).toHaveBeenCalledWith(
      "Herbstferien zwölfter bis achtzehnter Oktober",
    );
  });

  it("stop() commits the audio buffer and requests the text response", async () => {
    const { result } = setup();
    const pc = await startSession(result);

    act(() => {
      result.current.stop();
    });

    expect(pc.dataChannel.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "input_audio_buffer.commit" }),
    );
    expect(pc.dataChannel.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "response.create",
        response: { output_modalities: ["text"] },
      }),
    );
    expect(result.current.status).toBe("processing");
  });

  it("cancel() tears down without delivering a transcript", async () => {
    const { result, onTranscript } = setup();
    const pc = await startSession(result);

    act(() => {
      result.current.cancel();
    });

    expect(result.current.status).toBe("idle");
    expect(pc.close).toHaveBeenCalled();

    act(() => {
      pc.dataChannel.emit({ type: "response.output_text.done", text: "zu spät" });
    });
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("reports a missing microphone permission", async () => {
    mockGetUserMedia.mockRejectedValueOnce(new Error("denied"));
    const { result, onError, onTranscript } = setup();

    await act(async () => {
      await result.current.start();
    });

    expect(onError).toHaveBeenCalledWith(
      expect.stringMatching(/Mikrofon/),
    );
    expect(onTranscript).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });

  it("reports a session start failure", async () => {
    mockFetch.mockImplementationOnce(async () => new Response("nope", { status: 500 }));
    const { result, onError } = setup();

    await act(async () => {
      await result.current.start();
    });

    expect(onError).toHaveBeenCalledWith(
      "Spracheingabe konnte nicht gestartet werden.",
    );
    expect(result.current.status).toBe("idle");
  });

  it("surfaces the route's own reason instead of the generic sentence", async () => {
    mockFetch.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({
            error: "Tageslimit erreicht. Bitte morgen erneut versuchen.",
            code: "RATE_LIMIT_EXCEEDED",
          }),
          { status: 429 },
        ),
    );
    const { result, onError } = setup();

    await act(async () => {
      await result.current.start();
    });

    expect(onError).toHaveBeenCalledWith(
      "Tageslimit erreicht. Bitte morgen erneut versuchen.",
    );
    expect(result.current.status).toBe("idle");
  });

  it("distinguishes an unreachable server from a refused session", async () => {
    mockFetch.mockImplementationOnce(async () => {
      throw new TypeError("Load failed");
    });
    const { result, onError } = setup();

    await act(async () => {
      await result.current.start();
    });

    expect(onError).toHaveBeenCalledWith(
      expect.stringMatching(/Internetverbindung/),
    );
    expect(result.current.status).toBe("idle");
  });

  it("treats a manual stop with nothing said as 'nothing heard', not an error", async () => {
    const { result, onTranscript, onError } = setup();
    const pc = await startSession(result);

    act(() => {
      pc.dataChannel.emit({
        type: "error",
        error: { code: "input_audio_buffer_commit_empty" },
      });
    });

    expect(onTranscript).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      "Ich konnte nichts hören. Bitte versuch es nochmal.",
    );
    expect(result.current.status).toBe("idle");
  });

  it("aborts setup when cancelled while the session request is in flight", async () => {
    let resolveSession: ((response: Response) => void) | null = null;
    mockFetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveSession = resolve;
        }),
    );
    const { result, onError } = setup();

    let startPromise: Promise<void> = Promise.resolve();
    act(() => {
      startPromise = result.current.start();
    });
    expect(result.current.status).toBe("connecting");

    act(() => {
      result.current.cancel();
    });
    expect(result.current.status).toBe("idle");

    await act(async () => {
      resolveSession?.(
        new Response(
          JSON.stringify({ client_secret: "secret-1", model: "m" }),
          { status: 200 },
        ),
      );
      await startPromise;
    });

    // The cancelled start must not continue acquiring resources.
    expect(mockGetUserMedia).not.toHaveBeenCalled();
    expect(MockRTCPeerConnection.instance).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it("releases the microphone when cancelled during the permission prompt", async () => {
    let resolveMic: ((stream: MediaStream) => void) | null = null;
    mockGetUserMedia.mockImplementationOnce(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveMic = resolve;
        }),
    );
    const { result } = setup();

    let startPromise: Promise<void> = Promise.resolve();
    act(() => {
      startPromise = result.current.start();
    });
    // Let the session fetch resolve so start() reaches the mic prompt.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockGetUserMedia).toHaveBeenCalled();

    act(() => {
      result.current.cancel();
    });

    await act(async () => {
      resolveMic?.({
        getTracks: () => [mockTrack],
      } as unknown as MediaStream);
      await startPromise;
    });

    // Tracks acquired after the cancellation are stopped immediately.
    expect(mockTrack.stop).toHaveBeenCalled();
    expect(MockRTCPeerConnection.instance).toBeNull();
  });

  it("cleans up the microphone and connection when the hook unmounts", async () => {
    const { result, unmount } = setup();
    const pc = await startSession(result);
    expect(result.current.status).toBe("listening");

    unmount();

    expect(pc.close).toHaveBeenCalled();
    expect(mockTrack.stop).toHaveBeenCalled();
  });

  it("resets the level meter to flat when a session ends", async () => {
    const { result } = setup();
    await startSession(result);

    act(() => {
      result.current.cancel();
    });

    expect(result.current.getLevels().every((level) => level === 0)).toBe(
      true,
    );
  });

  it("cancels analyser frames and closes its AudioContext once", async () => {
    const cancelFrame = vi.fn();
    const close = vi.fn(async () => {});
    const analyser = {
      fftSize: 0,
      getByteTimeDomainData: vi.fn(),
    };
    const AudioContextMock = vi.fn(function AudioContextMock() {
      return {
        createAnalyser: () => analyser,
        createMediaStreamSource: () => ({ connect: vi.fn() }),
        close,
      };
    });
    vi.stubGlobal("AudioContext", AudioContextMock);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 42));
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);
    const { result } = setup();

    await startSession(result);
    act(() => result.current.cancel());
    act(() => result.current.cancel());

    expect(cancelFrame).toHaveBeenCalledWith(42);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not start decorative level sampling under Reduced Motion", async () => {
    const AudioContextMock = vi.fn();
    const onTranscript = vi.fn();
    const onError = vi.fn();
    vi.stubGlobal("AudioContext", AudioContextMock);
    const { result } = renderHook(() =>
      useRealtimeTranscription({
        onTranscript,
        onError,
        reducedMotion: true,
      }),
    );

    await startSession(result);

    expect(AudioContextMock).not.toHaveBeenCalled();
  });
});

/** A byte-domain buffer at a fixed offset from the 128 (silence) midpoint. */
function constantAmplitudeBuffer(length: number, amplitude: number): Uint8Array {
  return new Uint8Array(length).fill(128 + amplitude);
}

describe("computeAudioLevel", () => {
  it("reads 0 for silence (flat buffer at the midpoint)", () => {
    expect(computeAudioLevel(constantAmplitudeBuffer(64, 0))).toBe(0);
  });

  it("reads higher for a louder signal than a quieter one", () => {
    const quiet = computeAudioLevel(constantAmplitudeBuffer(64, 10));
    const loud = computeAudioLevel(constantAmplitudeBuffer(64, 80));
    expect(loud).toBeGreaterThan(quiet);
  });

  it("never exceeds 1 even for a maxed-out signal", () => {
    expect(computeAudioLevel(constantAmplitudeBuffer(64, 127))).toBeLessThanOrEqual(1);
  });
});

describe("createLevelTracker", () => {
  it("throttles pushes to the configured interval", () => {
    const tracker = createLevelTracker({ historyLength: 4, pushIntervalMs: 50 });
    const loud = constantAmplitudeBuffer(64, 80);

    expect(tracker.sample(loud, 0)).not.toBeNull(); // first sample always pushes
    expect(tracker.sample(loud, 10)).toBeNull(); // too soon
    expect(tracker.sample(loud, 40)).toBeNull(); // still too soon
    expect(tracker.sample(loud, 60)).not.toBeNull(); // interval elapsed
  });

  it("slides the history window, dropping the oldest sample", () => {
    const tracker = createLevelTracker({
      historyLength: 3,
      pushIntervalMs: 10,
      smoothing: 0, // disable smoothing so pushed values are exact
    });
    const silence = constantAmplitudeBuffer(64, 0);
    const loud = constantAmplitudeBuffer(64, 80);

    tracker.sample(silence, 0);
    tracker.sample(silence, 10);
    const third = tracker.sample(loud, 20);

    expect(third).toEqual([0, 0, expect.any(Number)]);
    expect(third?.[2]).toBeGreaterThan(0);
  });

  it("reset() zeroes the history and lets the next sample push immediately", () => {
    const tracker = createLevelTracker({ historyLength: 3, pushIntervalMs: 50 });
    const loud = constantAmplitudeBuffer(64, 80);
    tracker.sample(loud, 0);

    expect(tracker.reset()).toEqual([0, 0, 0]);
    expect(tracker.sample(loud, 1)).not.toBeNull(); // no throttling right after reset
  });
});
