import { setAudioModeAsync } from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  mediaDevices,
  MediaStream,
  RTCPeerConnection,
} from "react-native-webrtc";

import { getApiUrl } from "./api";
import { getSupabase } from "./supabase";

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
      peer.onicegatheringstatechange = null;
      reject(new Error("ICE gathering timed out"));
    }, 10_000);
    function onState() {
      if (peer.iceGatheringState !== "complete") return;
      clearTimeout(timeout);
      peer.onicegatheringstatechange = null;
      resolve();
    }
    peer.onicegatheringstatechange = onState;
    onState();
  });
}

/**
 * Native GPT Live session. Audio stays in the WebRTC connection; only
 * transcript turns delegated by GPT Live enter Ordilo's existing chat route.
 * The OpenAI project key and all database credentials stay on the server.
 */
export function useNativeLiveConversation({
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
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const microphoneRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<
    ReturnType<RTCPeerConnection["createDataChannel"]> | null
  >(null);
  const limitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delegationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  useEffect(() => {
    onTurnRef.current = onTurn;
    onErrorRef.current = onError;
  }, [onError, onTurn]);

  const cleanup = useCallback(() => {
    const operationId = operationIdRef.current;
    const startedAt = startedAtRef.current;
    const reason = stopReasonRef.current ?? "background";
    operationIdRef.current = null;
    startedAtRef.current = null;
    stopReasonRef.current = null;
    if (operationId && startedAt !== null) {
      const durationMillis = Math.max(
        Date.now() - startedAt,
        providerSecondsRef.current * 1_000,
      );
      void getSupabase()
        .auth.getSession()
        .then(({ data }) => {
          const token = data.session?.access_token;
          if (!token) return;
          return fetch(`${getApiUrl()}/api/realtime/live/session/end`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              family_id: familyId,
              operation_id: operationId,
              duration_ms: durationMillis,
              reason,
            }),
          });
        })
        .catch(() => undefined);
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
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    for (const track of microphoneRef.current?.getTracks() ?? []) track.stop();
    microphoneRef.current?.release();
    microphoneRef.current = null;
    remoteStreamRef.current?.release();
    remoteStreamRef.current = null;
    void setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    setLastTranscript("");
    setStatus("idle");
  }, [familyId]);

  const stopSession = useCallback(
    (reason: "user" | "limit" | "background" | "error") => {
      if (stopReasonRef.current) return;
      stopReasonRef.current = reason;

      const channel = dataChannelRef.current;
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
    const channel = dataChannelRef.current;
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

  async function runTurn(turn: PendingTurn, generation: number) {
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
  }

  function queueDelegation(delegationId: string, generation: number) {
    if (delegationTimerRef.current) {
      clearTimeout(delegationTimerRef.current);
    }
    delegationTimerRef.current = setTimeout(() => {
      const transcript = transcriptRef.current.trim();
      transcriptRef.current = "";
      delegationTimerRef.current = null;
      void runTurn({ delegationId, transcript }, generation);
    }, 120);
  }

  async function start() {
    if (peerRef.current) return;
    const generation = ++generationRef.current;
    setStatus("connecting");
    setLastTranscript("");

    const { data } = await getSupabase().auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      fail("Nicht angemeldet. Bitte melde dich erneut an.");
      return;
    }

    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      const microphone = await mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      if (generation !== generationRef.current) {
        for (const track of microphone.getTracks()) track.stop();
        microphone.release();
        return;
      }
      microphoneRef.current = microphone;

      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      for (const track of microphone.getTracks()) {
        peer.addTrack(track, microphone);
      }
      peer.ontrack = (rawEvent: unknown) => {
        const event = rawEvent as {
          streams?: MediaStream[];
          track?: { kind?: string };
        };
        if (event.track?.kind === "audio" && event.streams?.[0]) {
          remoteStreamRef.current = event.streams[0];
        }
      };

      const channel = peer.createDataChannel("oai-events");
      dataChannelRef.current = channel;
      channel.onmessage = (rawEvent: unknown) => {
        const eventData = rawEvent as { data?: string };
        let event: LiveServerEvent;
        try {
          event = JSON.parse(eventData.data ?? "") as LiveServerEvent;
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
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed") {
          fail("Die Live-Verbindung wurde unterbrochen.");
        }
      };

      const offer = await peer.createOffer({ offerToReceiveAudio: true });
      await peer.setLocalDescription(offer);
      await waitForIceGathering(peer);
      const sdp = peer.localDescription?.sdp;
      if (!sdp) throw new Error("Missing SDP");

      const operationId = crypto.randomUUID();
      stopReasonRef.current = null;
      providerSecondsRef.current = 0;
      const response = await fetch(
        `${getApiUrl()}/api/realtime/live/session`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            family_id: familyId,
            operation_id: operationId,
            sdp,
          }),
        },
      );
      const session = (await response.json().catch(() => null)) as
        | LiveSessionResponse
        | null;
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
      await peer.setRemoteDescription({
        type: "answer",
        sdp: session.sdp,
      });
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
      fail("Die Live-Verbindung konnte nicht aufgebaut werden.");
    }
  }

  useEffect(
    () => () => stopSession("background"),
    [stopSession],
  );

  return { lastTranscript, start, status, stop };
}
