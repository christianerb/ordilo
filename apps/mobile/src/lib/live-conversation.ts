import { AudioModule, setAudioModeAsync } from "expo-audio";
import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  mediaDevices,
  MediaStream,
  RTCPeerConnection,
} from "react-native-webrtc";

import { getApiUrl } from "./api";
import type { ChatStreamEvent } from "./chat";
import {
  restoreLiveAudioRoute,
  routeLiveAudioToSpeaker,
} from "./live-audio-route";
import {
  createLiveTurnCollector,
  LIVE_PROGRESS_START,
  LIVE_SPOKEN_PROGRESS_DELAYS_MS,
  splitForCommentary,
  spokenProgress,
} from "./live-progress";
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
  code?: string;
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
// GPT Live has no "finished speaking" event. While the backend is still
// working, a pause this long after Ordilo's last spoken fragment means the
// acknowledgement is over and the bar goes back to showing the search.
const SPEECH_SETTLE_MS = 1_200;

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
  onPremiumRequired,
}: {
  familyId: string;
  /**
   * Runs one delegated question through the chat route. `onEvent` receives
   * the chat stream so the hook can show progress and hand the answer to
   * GPT Live the moment it is ready.
   */
  onTurn: (
    transcript: string,
    onEvent: (event: ChatStreamEvent) => void,
  ) => Promise<string | null>;
  onError: (message: string) => void;
  // The server refused the session with 402 PREMIUM_REQUIRED: the family
  // has no active Plus entitlement. The screen receives the server's
  // German message and decides: paywall when billing is rolled out, plain
  // error while it is not. Without a handler this falls back to onError.
  onPremiumRequired?: (message: string) => void;
}) {
  const [status, setStatus] = useState<LiveConversationStatus>("idle");
  const [lastTranscript, setLastTranscript] = useState("");
  const [previousTranscript, setPreviousTranscript] = useState("");
  // Plain status of the running backend turn ("Gefunden in: …").
  const [progress, setProgress] = useState("");
  const [muted, setMuted] = useState(false);
  // True when the microphone is denied and iOS will not ask again — the
  // only way forward is the system settings, so the screen can offer that.
  const [micBlocked, setMicBlocked] = useState(false);
  const lastTranscriptRef = useRef("");
  const mutedRef = useRef(false);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const microphoneRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<
    ReturnType<RTCPeerConnection["createDataChannel"]> | null
  >(null);
  const limitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delegationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const speechSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // True while a delegated question waits for its answer.
  const awaitingAnswerRef = useRef(false);
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
  const onPremiumRequiredRef = useRef(onPremiumRequired);
  useEffect(() => {
    onTurnRef.current = onTurn;
    onErrorRef.current = onError;
    onPremiumRequiredRef.current = onPremiumRequired;
  }, [onError, onPremiumRequired, onTurn]);

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
    if (speechSettleTimerRef.current) {
      clearTimeout(speechSettleTimerRef.current);
    }
    for (const timer of progressTimersRef.current) clearTimeout(timer);
    progressTimersRef.current = [];
    limitTimerRef.current = null;
    closeTimerRef.current = null;
    delegationTimerRef.current = null;
    speechSettleTimerRef.current = null;
    awaitingAnswerRef.current = false;
    setupAbortRef.current?.abort();
    setupAbortRef.current = null;
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    for (const track of microphoneRef.current?.getTracks() ?? []) track.stop();
    microphoneRef.current?.release();
    microphoneRef.current = null;
    remoteStreamRef.current?.release();
    remoteStreamRef.current = null;
    restoreLiveAudioRoute();
    void setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    lastTranscriptRef.current = "";
    mutedRef.current = false;
    setLastTranscript("");
    setPreviousTranscript("");
    setProgress("");
    setMuted(false);
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

  /**
   * Local mute: disabling the audio track stops the microphone's RTP frames
   * at the device, so GPT Live hears silence while the session stays open.
   * No server change needed; the remote side simply waits for speech again.
   */
  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    for (const track of microphoneRef.current?.getAudioTracks() ?? []) {
      track.enabled = !next;
    }
    setMuted(next);
  }, []);

  const fail = useCallback(
    (message: string) => {
      stopSession("error");
      onErrorRef.current(message);
    },
    [stopSession],
  );

  /** Content GPT Live says aloud, in parts that fit its append limit. */
  const sendCommentary = useCallback(
    (delegationId: string, content: string) => {
      const channel = dataChannelRef.current;
      if (!channel || channel.readyState !== "open") return;
      for (const part of splitForCommentary(content)) {
        channel.send(
          JSON.stringify({
            type: "session.commentary.append",
            event_id: randomUUID(),
            delegation_id: delegationId,
            content: part,
          }),
        );
      }
    },
    [],
  );

  function clearProgressTimers() {
    for (const timer of progressTimersRef.current) clearTimeout(timer);
    progressTimersRef.current = [];
  }

  async function runTurn(turn: PendingTurn, generation: number) {
    if (generation !== generationRef.current) return;
    if (turnRunningRef.current) {
      pendingTurnRef.current = turn;
      return;
    }
    turnRunningRef.current = true;
    awaitingAnswerRef.current = true;
    lastTranscriptRef.current = turn.transcript;
    setLastTranscript(turn.transcript);
    setProgress(LIVE_PROGRESS_START);
    setStatus("thinking");

    const collector = createLiveTurnCollector();
    let delivered = false;
    const deliver = (content: string) => {
      if (delivered || generation !== generationRef.current) return;
      delivered = true;
      awaitingAnswerRef.current = false;
      clearProgressTimers();
      sendCommentary(turn.delegationId, content);
    };
    // Silence while the backend works feels like a dropped call. Short
    // spoken updates bridge it; they carry progress, never a result.
    const spoken = new Set<string>();
    clearProgressTimers();
    progressTimersRef.current = LIVE_SPOKEN_PROGRESS_DELAYS_MS.map((delay) =>
      setTimeout(() => {
        if (delivered || generation !== generationRef.current) return;
        const update = spokenProgress(collector.foundTitle);
        if (spoken.has(update)) return;
        spoken.add(update);
        sendCommentary(turn.delegationId, update);
      }, delay),
    );

    try {
      const answer = turn.transcript
        ? await onTurnRef.current(turn.transcript, (event) => {
            if (delivered || generation !== generationRef.current) return;
            const update = collector.apply(event);
            if (update.progress) setProgress(update.progress);
            if (update.answer) deliver(update.answer);
          })
        : null;
      if (generation !== generationRef.current) return;
      deliver(
        answer?.trim() ||
          "Ich habe die Frage nicht sicher verstanden. Bitte sag sie noch einmal.",
      );
    } catch {
      if (generation !== generationRef.current) return;
      deliver("Das hat gerade nicht geklappt. Bitte versuch es noch einmal.");
    } finally {
      if (generation === generationRef.current) {
        clearProgressTimers();
        awaitingAnswerRef.current = false;
      }
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
    lastTranscriptRef.current = "";
    setLastTranscript("");
    setPreviousTranscript("");
    setMicBlocked(false);

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
        shouldRouteThroughEarpiece: false,
      });
      // WebRTC replaces the audio session configuration when the call
      // audio starts, so the speaker route has to be part of its own
      // configuration — before getUserMedia opens the audio unit.
      routeLiveAudioToSpeaker();
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
          // A fresh spoken turn begins: the finished line moves up as the
          // previous transcript so the bar can show the last two turns.
          if (!transcriptRef.current && lastTranscriptRef.current) {
            setPreviousTranscript(lastTranscriptRef.current);
          }
          transcriptRef.current += event.delta ?? "";
          const current = transcriptRef.current.trim();
          lastTranscriptRef.current = current;
          setLastTranscript(current);
          setStatus("listening");
        } else if (event.type === "session.delegation.created") {
          const delegationId = event.delegation?.id;
          if (delegationId && event.delegation?.target === "client") {
            queueDelegation(delegationId, generation);
          }
        } else if (event.type === "session.output_transcript.delta") {
          setStatus("speaking");
          if (speechSettleTimerRef.current) {
            clearTimeout(speechSettleTimerRef.current);
          }
          speechSettleTimerRef.current = setTimeout(() => {
            speechSettleTimerRef.current = null;
            if (
              generation === generationRef.current &&
              awaitingAnswerRef.current
            ) {
              setStatus("thinking");
            }
          }, SPEECH_SETTLE_MS);
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

      const operationId = randomUUID();
      stopReasonRef.current = null;
      providerSecondsRef.current = 0;
      const setupAbort = new AbortController();
      setupAbortRef.current = setupAbort;
      const response = await fetch(
        `${getApiUrl()}/api/realtime/live/session`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          signal: setupAbort.signal,
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
      if (setupAbortRef.current === setupAbort) {
        setupAbortRef.current = null;
      }
      // Stop during the in-flight setup request closed the peer and bumped
      // the generation; never install a session or fail after that stop.
      // Aborting the setup fetch also tells the server to hang up an accepted
      // provider session and return the reservation.
      if (generation !== generationRef.current) return;
      if (
        !response.ok ||
        !session?.sdp ||
        !session.session_id ||
        session.model !== "gpt-live-1"
      ) {
        if (response.status === 402 && session?.code === "PREMIUM_REQUIRED") {
          cleanup();
          const message =
            session?.error ??
            "Mit Ordilo sprechen ist in Premium enthalten.";
          const handler = onPremiumRequiredRef.current;
          if (handler) {
            handler(message);
          } else {
            fail(message);
          }
          return;
        }
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
      if (generation !== generationRef.current) return;
      // A denied microphone lands here too. Ask the system which failure it
      // was so the screen can offer the way into the settings when iOS will
      // not show the permission prompt again.
      const permission = await AudioModule.getRecordingPermissionsAsync()
        .catch(() => null);
      if (generation !== generationRef.current) return;
      if (permission && !permission.granted) {
        setMicBlocked(!permission.canAskAgain);
        fail(
          permission.canAskAgain
            ? "Bitte erlaube Ordilo den Zugriff auf dein Mikrofon."
            : "Ordilo darf das Mikrofon nicht benutzen. Erlaube es in den Einstellungen deines Geräts.",
        );
        return;
      }
      fail("Die Live-Verbindung konnte nicht aufgebaut werden.");
    }
  }

  useEffect(
    () => () => stopSession("background"),
    [stopSession],
  );

  // A mounted screen keeps running while the app is backgrounded, and the
  // suspended JS side cannot meter the session. Stop on real backgrounding;
  // "inactive" is ignored because Android fires it for the mic permission
  // prompt during start().
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") stopSession("background");
    });
    return () => subscription.remove();
  }, [stopSession]);

  return {
    lastTranscript,
    previousTranscript,
    micBlocked,
    muted,
    progress,
    start,
    status,
    stop,
    toggleMute,
  };
}
