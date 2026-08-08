"use client";

import { useCallback, useRef, useState } from "react";

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
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
} {
  const [status, setStatus] = useState<VoiceStatus>("idle");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Raw input transcription, kept as fallback for the model's reply. */
  const inputTranscriptRef = useRef("");
  /** Set once a final transcript was delivered — guards double delivery. */
  const deliveredRef = useRef(false);

  // Latest-callback refs (plain writes during render, same pattern as the
  // rest of the codebase) so peer-connection handlers never go stale.
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    if (micRef.current) {
      for (const track of micRef.current.getTracks()) track.stop();
      micRef.current = null;
    }
  }, []);

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
    deliveredRef.current = false;
    inputTranscriptRef.current = "";
    setStatus("connecting");

    // 1. Ephemeral client secret (auth-gated, server mints it).
    let clientSecret: string;
    let model: string;
    try {
      const sessionResponse = await fetch("/api/realtime/session", {
        method: "POST",
      });
      if (!sessionResponse.ok) throw new Error("session failed");
      const session = (await sessionResponse.json()) as {
        client_secret?: string;
        model?: string;
      };
      if (!session.client_secret || !session.model) {
        throw new Error("session incomplete");
      }
      clientSecret = session.client_secret;
      model = session.model;
    } catch {
      setStatus("idle");
      onErrorRef.current("Spracheingabe konnte nicht gestartet werden.");
      return;
    }

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
    micRef.current = mic;

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
        fail("Die Verbindung hat nicht geklappt.");
      }
    };

    // 4. SDP handshake against the Realtime API.
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpResponse = await fetch(
        `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
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
      fail("Die Verbindung hat nicht geklappt.");
      return;
    }

    timerRef.current = setTimeout(() => {
      // Cap reached — deliver whatever is already transcribed.
      deliver(inputTranscriptRef.current);
    }, MAX_SESSION_MS);
  }, [deliver, fail, handleServerEvent]);

  /** Finish the current utterance now instead of waiting for the VAD. */
  const stop = useCallback(() => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return;
    setStatus("processing");
    dc.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    dc.send(
      JSON.stringify({
        type: "response.create",
        response: { modalities: ["text"] },
      }),
    );
  }, []);

  const cancel = useCallback(() => {
    deliveredRef.current = true; // swallow any in-flight final event
    cleanup();
    setStatus("idle");
  }, [cleanup]);

  return { status, start, stop, cancel };
}
