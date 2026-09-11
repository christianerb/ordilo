"use client";

import { useCallback, useRef, useState } from "react";

import { useMountEffect } from "@/lib/hooks/use-mount-effect";

export type LiveConversationStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "ending";

interface LiveSessionResponse {
  session_id?: string;
  sdp?: string;
  max_duration_ms?: number;
  model?: string;
  error?: string;
}

interface LiveServerEvent {
  type: string;
  delta?: string;
  delegation?: { id?: string; target?: string };
  usage?: { seconds?: number };
}

interface PendingTurn {
  delegationId: string;
  transcript: string;
}

const FALLBACK_MAX_DURATION_MS = 5 * 60 * 1_000;
const CLOSE_TIMEOUT_MS = 3_000;

async function waitForIceGathering(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === "complete") return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      peer.removeEventListener("icegatheringstatechange", onState);
      reject(new Error("ICE gathering timed out"));
    }, 10_000);
    function onState() {
      if (peer.iceGatheringState !== "complete") return;
      clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", onState);
      resolve();
    }
    peer.addEventListener("icegatheringstatechange", onState);
    onState();
  });
}

export function useLiveConversation({
  familyId,
  onTurn,
  onError,
}: {
  familyId: string;
  onTurn: (transcript: string) => Promise<string | null>;
  onError: (message: string) => void;
}) {
  const [status, setStatus] = useState<LiveConversationStatus>("idle");
  const [lastTranscript, setLastTranscript] = useState("");
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const limitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delegationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setupAbortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const turnRunningRef = useRef(false);
  const pendingTurnRef = useRef<PendingTurn | null>(null);
  const transcriptRef = useRef("");
  const operationIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const providerSecondsRef = useRef(0);
  const stopReasonRef = useRef<
    "user" | "limit" | "background" | "error" | null
  >(null);
  const onTurnRef = useRef(onTurn);
  const onErrorRef = useRef(onError);
  onTurnRef.current = onTurn;
  onErrorRef.current = onError;

  const cleanup = useCallback(() => {
    const operationId = operationIdRef.current;
    const startedAt = startedAtRef.current;
    const reason = stopReasonRef.current ?? "background";
    operationIdRef.current = null;
    startedAtRef.current = null;
    stopReasonRef.current = null;
    if (operationId && startedAt !== null) {
      void fetch("/api/realtime/live/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          family_id: familyId,
          operation_id: operationId,
          duration_ms: Math.max(
            Date.now() - startedAt,
            providerSecondsRef.current * 1_000,
          ),
          reason,
        }),
      }).catch(() => undefined);
    }
    providerSecondsRef.current = 0;
    generationRef.current += 1;
    turnRunningRef.current = false;
    pendingTurnRef.current = null;
    transcriptRef.current = "";
    if (limitTimerRef.current) clearTimeout(limitTimerRef.current);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if (delegationTimerRef.current) clearTimeout(delegationTimerRef.current);
    limitTimerRef.current = null;
    closeTimerRef.current = null;
    delegationTimerRef.current = null;
    setupAbortRef.current?.abort();
    setupAbortRef.current = null;
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    for (const track of micRef.current?.getTracks() ?? []) track.stop();
    micRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
      audioRef.current = null;
    }
    setLastTranscript("");
    setStatus("idle");
  }, [familyId]);

  const stopSession = useCallback(
    (reason: "user" | "limit" | "background" | "error") => {
      if (stopReasonRef.current) return;
      stopReasonRef.current = reason;

      const channel = dcRef.current;
      if (channel?.readyState === "open") {
        setStatus("ending");
        channel.send(JSON.stringify({ type: "session.close" }));
        closeTimerRef.current = setTimeout(cleanup, CLOSE_TIMEOUT_MS);
      } else {
        cleanup();
      }
    },
    [cleanup],
  );

  const stop = useCallback(() => stopSession("user"), [stopSession]);

  const fail = useCallback(
    (message: string) => {
      stopSession("error");
      onErrorRef.current(message);
    },
    [stopSession],
  );

  const sendResult = useCallback((delegationId: string, content: string) => {
    const channel = dcRef.current;
    if (!channel || channel.readyState !== "open") return;
    channel.send(
      JSON.stringify({
        type: "session.commentary.append",
        event_id: crypto.randomUUID(),
        delegation_id: delegationId,
        content,
      }),
    );
  }, []);

  const runTurn = useCallback(
    async (turn: PendingTurn, generation: number) => {
      if (generation !== generationRef.current) return;
      if (turnRunningRef.current) {
        pendingTurnRef.current = turn;
        return;
      }
      turnRunningRef.current = true;
      setLastTranscript(turn.transcript);
      setStatus("thinking");
      try {
        const answer = turn.transcript
          ? await onTurnRef.current(turn.transcript)
          : null;
        if (generation !== generationRef.current) return;
        sendResult(
          turn.delegationId,
          answer?.trim() ||
            "Ich habe die Frage nicht sicher verstanden. Bitte sag sie noch einmal.",
        );
      } catch {
        if (generation !== generationRef.current) return;
        sendResult(
          turn.delegationId,
          "Das hat gerade nicht geklappt. Bitte versuch es noch einmal.",
        );
      } finally {
        turnRunningRef.current = false;
        const pending = pendingTurnRef.current;
        pendingTurnRef.current = null;
        if (pending && generation === generationRef.current) {
          void runTurn(pending, generation);
        }
      }
    },
    [sendResult],
  );

  const queueDelegation = useCallback(
    (delegationId: string, generation: number) => {
      if (delegationTimerRef.current) {
        clearTimeout(delegationTimerRef.current);
      }
      delegationTimerRef.current = setTimeout(() => {
        const transcript = transcriptRef.current.trim();
        transcriptRef.current = "";
        delegationTimerRef.current = null;
        void runTurn({ delegationId, transcript }, generation);
      }, 120);
    },
    [runTurn],
  );

  const start = useCallback(async () => {
    if (pcRef.current) return;
    const generation = ++generationRef.current;
    setStatus("connecting");
    setLastTranscript("");

    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      fail("Bitte erlaube Ordilo den Zugriff auf dein Mikrofon.");
      return;
    }
    if (generation !== generationRef.current) {
      for (const track of mic.getTracks()) track.stop();
      return;
    }
    micRef.current = mic;

    const audio = new Audio();
    audio.autoplay = true;
    audioRef.current = audio;
    const pc = new RTCPeerConnection();
    pcRef.current = pc;
    for (const track of mic.getTracks()) pc.addTrack(track, mic);
    pc.ontrack = (event) => {
      audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      void audio.play().catch(() => {
        fail("Die Audioausgabe konnte nicht gestartet werden.");
      });
    };

    const dc = pc.createDataChannel("oai-events");
    dcRef.current = dc;
    dc.onmessage = (message) => {
      let event: LiveServerEvent;
      try {
        event = JSON.parse(message.data) as LiveServerEvent;
      } catch {
        return;
      }
      if (event.type === "session.started") {
        setStatus("listening");
      } else if (event.type === "session.input_transcript.delta") {
        transcriptRef.current += event.delta ?? "";
        setLastTranscript(transcriptRef.current.trim());
        setStatus("listening");
      } else if (event.type === "session.delegation.created") {
        const delegationId = event.delegation?.id;
        if (delegationId && event.delegation?.target === "client") {
          queueDelegation(delegationId, generation);
        }
      } else if (event.type === "session.output_transcript.delta") {
        setStatus("speaking");
      } else if (event.type === "session.usage.updated") {
        providerSecondsRef.current = Math.max(
          providerSecondsRef.current,
          event.usage?.seconds ?? 0,
        );
      } else if (event.type === "session.closed") {
        providerSecondsRef.current = Math.max(
          providerSecondsRef.current,
          event.usage?.seconds ?? 0,
        );
        cleanup();
      } else if (event.type === "error") {
        fail("Die Live-Unterhaltung wurde unterbrochen.");
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        fail("Die Live-Verbindung wurde unterbrochen.");
      }
    };

    const operationId = crypto.randomUUID();
    stopReasonRef.current = null;
    providerSecondsRef.current = 0;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc);
      const sdp = pc.localDescription?.sdp;
      if (!sdp) throw new Error("Missing SDP");
      const setupAbort = new AbortController();
      setupAbortRef.current = setupAbort;
      const response = await fetch("/api/realtime/live/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: setupAbort.signal,
        body: JSON.stringify({
          family_id: familyId,
          operation_id: operationId,
          sdp,
        }),
      });
      const session = (await response.json().catch(() => null)) as
        | LiveSessionResponse
        | null;
      if (setupAbortRef.current === setupAbort) {
        setupAbortRef.current = null;
      }
      // The user may have stopped while the setup request was in flight;
      // cleanup() closed the peer and bumped the generation. Never install a
      // session or report an error for a stop that already happened. Aborting
      // the setup fetch also tells the server to hang up an accepted session.
      if (generation !== generationRef.current) return;
      if (
        !response.ok ||
        !session?.sdp ||
        !session.session_id ||
        session.model !== "gpt-live-1"
      ) {
        fail(
          session?.error ?? "Live mit Ordilo konnte nicht gestartet werden.",
        );
        return;
      }
      operationIdRef.current = operationId;
      startedAtRef.current = Date.now();
      await pc.setRemoteDescription({ type: "answer", sdp: session.sdp });
      limitTimerRef.current = setTimeout(
        () => {
          stopSession("limit");
          onErrorRef.current(
            "Das Live-Gespräch ist nach fünf Minuten beendet worden.",
          );
        },
        session.max_duration_ms ?? FALLBACK_MAX_DURATION_MS,
      );
    } catch {
      if (generation === generationRef.current) {
        fail("Die Live-Verbindung konnte nicht aufgebaut werden.");
      }
    }
  }, [cleanup, fail, familyId, queueDelegation, stopSession]);

  useMountEffect(() => () => stopSession("background"));

  return { lastTranscript, start, status, stop };
}
