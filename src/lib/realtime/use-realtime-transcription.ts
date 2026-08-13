"use client";

import { useCallback, useRef, useState } from "react";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";

/**
 * Browser voice capture over OpenAI Realtime WebRTC.
 *
 * The hook mints a short-lived client secret via `/api/realtime/session`
 * (the OpenAI API key never reaches the device), opens a peer connection,
 * streams the microphone, and resolves exactly one German transcript per
 * session. The session itself is transcription-only by server-side
 * configuration — no audio answer is generated, and nothing is ever
 * written to the planner here. What happens with the transcript (the
 * chat tool's confirmation gate) is the caller's business.
 *
 * Lifecycle: idle → connecting → listening → processing → idle.
 * `stop()` finishes the current utterance and delivers the transcript;
 * `cancel()` tears everything down without delivering anything.
 */

export type VoiceStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "processing";

/** Hard cap so a forgotten open mic cannot stream (and bill) forever. */
const MAX_SESSION_MS = 60_000;

/** How many recent samples the waveform meter keeps on screen. */
const LEVEL_HISTORY_LENGTH = 24;
/** Minimum spacing between pushed samples — caps meter re-renders at ~14/s. */
const LEVEL_PUSH_INTERVAL_MS = 70;
/** Exponential-smoothing weight for the raw reading (higher = calmer). */
const LEVEL_SMOOTHING = 0.65;
/** Compresses the normally-quiet mic signal so speech is clearly visible. */
const LEVEL_GAIN = 4;

/**
 * RMS amplitude of a Web Audio time-domain buffer, sqrt-compressed so
 * normal speech doesn't need to be loud to move the meter. Pure function —
 * no AudioContext needed — so the math is unit-testable on its own.
 */
export function computeAudioLevel(data: Uint8Array): number {
  let sumSquares = 0;
  for (let i = 0; i < data.length; i++) {
    const normalized = (data[i] - 128) / 128;
    sumSquares += normalized * normalized;
  }
  const rms = Math.sqrt(sumSquares / data.length);
  return Math.min(1, Math.sqrt(rms * LEVEL_GAIN));
}

/**
 * Turns a stream of analyser readings into a throttled, smoothed waveform
 * history. Kept free of Web Audio/DOM APIs (unlike the AnalyserNode wiring
 * around it) so the throttling and smoothing behavior can be unit tested
 * with synthetic samples and timestamps.
 */
export function createLevelTracker(
  {
    historyLength = LEVEL_HISTORY_LENGTH,
    pushIntervalMs = LEVEL_PUSH_INTERVAL_MS,
    smoothing = LEVEL_SMOOTHING,
  }: {
    historyLength?: number;
    pushIntervalMs?: number;
    smoothing?: number;
  } = {},
) {
  let history = new Array(historyLength).fill(0) as number[];
  let smoothedLevel = 0;
  let lastPush = -Infinity;
  return {
    /** Feed one reading; returns a new history snapshot only when pushed. */
    sample(data: Uint8Array, now: number): number[] | null {
      const instant = computeAudioLevel(data);
      smoothedLevel = smoothedLevel * smoothing + instant * (1 - smoothing);
      if (now - lastPush < pushIntervalMs) return null;
      lastPush = now;
      history = [...history.slice(1), smoothedLevel];
      return history;
    },
    reset(): number[] {
      history = new Array(historyLength).fill(0);
      smoothedLevel = 0;
      lastPush = -Infinity;
      return history;
    },
  };
}

interface RealtimeServerEvent {
  type: string;
  transcript?: string;
  text?: string;
  error?: { code?: string; message?: string };
  response?: {
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };
}

function extractResponseText(event: RealtimeServerEvent): string {
  const parts: string[] = [];
  for (const item of event.response?.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    }
  }
  return parts.join(" ").trim();
}

export function useRealtimeTranscription({
  onTranscript,
  onError,
}: {
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
}): {
  status: VoiceStatus;
  /**
   * External store (see `useSyncExternalStore`) for the live waveform —
   * refs + listeners rather than `useState` so the ~14 updates/second the
   * meter produces re-render only the small bar component that subscribes,
   * not this whole card on every tick.
   */
  subscribeLevels: (onStoreChange: () => void) => () => void;
  getLevels: () => number[];
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
} {
  const [status, setStatus] = useState<VoiceStatus>("idle");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelFrameRef = useRef<number | null>(null);
  const levelTrackerRef = useRef(createLevelTracker());
  const levelsRef = useRef<number[]>(levelTrackerRef.current.reset());
  const levelListenersRef = useRef(new Set<() => void>());
  /** Raw input transcription, kept as fallback for the model's reply. */
  const inputTranscriptRef = useRef("");
  /** Set once a final transcript was delivered — guards double delivery. */
  const deliveredRef = useRef(false);
  /**
   * Bumped by cancel() and unmount so an in-flight start() notices the
   * abort after each awaited setup step instead of opening the microphone
   * "invisibly" after the UI already went back to idle.
   */
  const generationRef = useRef(0);

  // Latest-callback refs (plain writes during render, same pattern as the
  // rest of the codebase) so peer-connection handlers never go stale.
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const getLevels = useCallback(() => levelsRef.current, []);

  const subscribeLevels = useCallback((onStoreChange: () => void) => {
    levelListenersRef.current.add(onStoreChange);
    return () => {
      levelListenersRef.current.delete(onStoreChange);
    };
  }, []);

  const notifyLevelListeners = useCallback(() => {
    for (const listener of levelListenersRef.current) listener();
  }, []);

  const stopLevelMeter = useCallback(() => {
    if (levelFrameRef.current !== null) {
      cancelAnimationFrame(levelFrameRef.current);
      levelFrameRef.current = null;
    }
    analyserRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    levelsRef.current = levelTrackerRef.current.reset();
    notifyLevelListeners();
  }, [notifyLevelListeners]);

  /**
   * Taps the mic stream with an AnalyserNode (never routed to the
   * speakers) so the recording UI can show real voice activity instead of
   * a generic "something is happening" pulse. Best-effort: on browsers
   * without AudioContext support the meter just stays flat.
   */
  const startLevelMeter = useCallback(
    (mic: MediaStream) => {
      const AudioContextCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextCtor) return;

      const audioCtx = new AudioContextCtor();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      audioCtx.createMediaStreamSource(mic).connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.fftSize);
      const tick = (now: number) => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(data);
        const snapshot = levelTrackerRef.current.sample(data, now);
        if (snapshot) {
          levelsRef.current = snapshot;
          notifyLevelListeners();
        }
        levelFrameRef.current = requestAnimationFrame(tick);
      };
      levelFrameRef.current = requestAnimationFrame(tick);
    },
    [notifyLevelListeners],
  );

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    stopLevelMeter();
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    if (micRef.current) {
      for (const track of micRef.current.getTracks()) track.stop();
      micRef.current = null;
    }
  }, [stopLevelMeter]);

  const deliver = useCallback(
    (text: string) => {
      if (deliveredRef.current) return;
      deliveredRef.current = true;
      const transcript = text.trim();
      cleanup();
      setStatus("idle");
      if (transcript) {
        onTranscriptRef.current(transcript);
      } else {
        onErrorRef.current(
          "Ich konnte nichts hören. Bitte versuch es nochmal.",
        );
      }
    },
    [cleanup],
  );

  const fail = useCallback(
    (message: string) => {
      cleanup();
      setStatus("idle");
      onErrorRef.current(message);
    },
    [cleanup],
  );

  const handleServerEvent = useCallback(
    (event: RealtimeServerEvent) => {
      switch (event.type) {
        case "input_audio_buffer.speech_stopped":
          // VAD ended the turn — the transcript is being finalized.
          setStatus("processing");
          break;
        case "conversation.item.input_audio_transcription.completed":
          inputTranscriptRef.current = event.transcript ?? "";
          break;
        case "response.output_text.done":
        case "response.text.done":
          deliver(event.text ?? "");
          break;
        case "response.done":
          deliver(
            extractResponseText(event) || inputTranscriptRef.current,
          );
          break;
        case "error": {
          // A manual stop with an empty buffer is not a failure — it just
          // means nothing was said.
          if (event.error?.code === "input_audio_buffer_commit_empty") {
            deliver("");
          } else {
            fail("Die Spracheingabe hat nicht geklappt.");
          }
          break;
        }
      }
    },
    [deliver, fail],
  );

  const start = useCallback(async () => {
    if (pcRef.current) return; // already running
    const generation = ++generationRef.current;
    const aborted = () => generationRef.current !== generation;
    deliveredRef.current = false;
    inputTranscriptRef.current = "";
    setStatus("connecting");

    // 1. Ephemeral client secret (auth-gated, server mints it).
    let clientSecret: string;
    try {
      const sessionResponse = await fetch("/api/realtime/session", {
        method: "POST",
      });
      // The route answers every refusal with a specific German
      // `{ error, code }` body (abgelaufene Anmeldung, Tageslimit, kein
      // Schlüssel konfiguriert). Showing that instead of one blanket
      // sentence is the difference between a user who knows what to do and
      // a "geht nicht" nobody can act on — this path is only reachable in
      // the installed PWA, where there is no native speech fallback left.
      const session = (await sessionResponse.json().catch(() => null)) as {
        client_secret?: string;
        model?: string;
        error?: string;
      } | null;
      if (!sessionResponse.ok || !session?.client_secret || !session.model) {
        setStatus("idle");
        onErrorRef.current(
          session?.error ?? "Spracheingabe konnte nicht gestartet werden.",
        );
        return;
      }
      clientSecret = session.client_secret;
    } catch {
      // Network-level failure — the request never reached the route, so
      // there is no body to quote. Deliberately worded differently from
      // the route's own 502 text: sharing one sentence made "OpenAI
      // refused the session" and "the phone never got through" look
      // identical in a bug report, which is exactly the distinction
      // needed to know where to look next.
      setStatus("idle");
      onErrorRef.current(
        "Keine Verbindung zum Server. Bitte prüf deine Internetverbindung.",
      );
      return;
    }
    // The user cancelled while the session request was in flight — the UI
    // is already idle, so continue with nothing.
    if (aborted()) return;

    // 2. Microphone.
    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setStatus("idle");
      onErrorRef.current(
        "Kein Zugriff auf das Mikrofon. Bitte erlaube den Zugriff.",
      );
      return;
    }
    // Cancelled during the permission prompt: release the just-acquired
    // tracks immediately so no audio streams after the UI went idle.
    if (aborted()) {
      for (const track of mic.getTracks()) track.stop();
      return;
    }
    micRef.current = mic;
    startLevelMeter(mic);

    // 3. Peer connection + server events channel.
    const pc = new RTCPeerConnection();
    pcRef.current = pc;
    for (const track of mic.getTracks()) pc.addTrack(track, mic);

    const dc = pc.createDataChannel("oai-events");
    dcRef.current = dc;
    dc.onmessage = (message) => {
      try {
        handleServerEvent(JSON.parse(message.data) as RealtimeServerEvent);
      } catch {
        // Non-JSON or unknown event — irrelevant for transcription.
      }
    };
    dc.onopen = () => setStatus("listening");
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        // ICE gave up: the handshake itself succeeded, so this is the
        // media path being blocked rather than the API being unreachable.
        // Kept distinct from the SDP failure below for that reason.
        fail("Die Sprachverbindung wurde unterbrochen.");
      }
    };

    // 4. SDP handshake against the Realtime API.
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      // GA Realtime WebRTC endpoint: the model is already bound to the
      // ephemeral client secret, so the SDP POST goes to /v1/realtime/calls
      // (the beta-era /v1/realtime?model=… query-param path is deprecated).
      const sdpResponse = await fetch(
        "https://api.openai.com/v1/realtime/calls",
        {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${clientSecret}`,
            "Content-Type": "application/sdp",
          },
        },
      );
      if (!sdpResponse.ok) throw new Error("sdp failed");
      await pc.setRemoteDescription({
        type: "answer",
        sdp: await sdpResponse.text(),
      });
    } catch {
      if (aborted()) {
        cleanup();
        return;
      }
      fail("Die Verbindung hat nicht geklappt.");
      return;
    }
    // Cancelled mid-handshake: tear down whatever was set up so the
    // connection does not stream invisibly.
    if (aborted()) {
      cleanup();
      return;
    }

    timerRef.current = setTimeout(() => {
      // Cap reached — deliver whatever is already transcribed.
      deliver(inputTranscriptRef.current);
    }, MAX_SESSION_MS);
  }, [cleanup, deliver, fail, handleServerEvent, startLevelMeter]);

  /** Finish the current utterance now instead of waiting for the VAD. */
  const stop = useCallback(() => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return;
    setStatus("processing");
    dc.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    dc.send(
      JSON.stringify({
        type: "response.create",
        // GA Realtime names this `output_modalities`; the beta-era
        // `modalities` is rejected as an unknown parameter.
        response: { output_modalities: ["text"] },
      }),
    );
  }, []);

  const cancel = useCallback(() => {
    generationRef.current += 1; // abort any in-flight start()
    deliveredRef.current = true; // swallow any in-flight final event
    cleanup();
    setStatus("idle");
  }, [cleanup]);

  // Navigating away or closing the voice UI mid-session must not leave
  // the microphone streaming (and billing) in the background.
  useMountEffect(() => {
    return () => {
      generationRef.current += 1;
      cleanup();
    };
  });

  return { status, subscribeLevels, getLevels, start, stop, cancel };
}
