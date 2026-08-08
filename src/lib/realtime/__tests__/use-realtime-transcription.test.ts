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

import { useRealtimeTranscription } from "@/lib/realtime/use-realtime-transcription";

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
        response: { modalities: ["text"] },
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
});
