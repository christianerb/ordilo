import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorCode,
} from "expo-speech-recognition";

/**
 * Native voice capture via expo-speech-recognition (Apple SFSpeechRecognizer
 * on iOS, Android SpeechRecognizer). Mirrors the web's two-path voice input
 * — interim text fills the field live, and a final transcript is delivered
 * for auto-send — but uses the platform's on-device recognizer instead of
 * the Web Speech API or OpenAI Realtime.
 *
 * Lifecycle: idle → listening → idle (or error → idle).
 * `start()` requests permissions, then begins recognition with German
 * locale and interim results. `stop()` lets the recognizer emit one final
 * result before ending. `cancel()` aborts immediately without delivering.
 */

export type VoiceState = "idle" | "listening" | "error";

/** Error codes from expo-speech-recognition (Web Speech API names). */
const ERROR_MESSAGES: Partial<Record<ExpoSpeechRecognitionErrorCode, string>> = {
  "not-allowed":
    "Kein Zugriff auf das Mikrofon. Bitte erlaube den Zugriff in den Einstellungen.",
  "audio-capture": "Das Mikrofon ist nicht erreichbar. Bitte prüfe dein Gerät.",
  network: "Keine Verbindung für die Spracherkennung. Bitte prüfe dein Internet.",
  "no-speech": "Ich konnte nichts hören. Bitte versuch es nochmal.",
  "language-not-supported": "Spracherkennung für Deutsch ist auf diesem Gerät nicht verfügbar.",
  "service-not-allowed": "Die Spracherkennung ist auf diesem Gerät nicht verfügbar.",
  busy: "Die Spracherkennung ist beschäftigt. Bitte versuch es gleich nochmal.",
};

/** Map a native error code to a plain German user message. */
export function voiceErrorMessage(
  code: ExpoSpeechRecognitionErrorCode | undefined,
): string {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code]!;
  return "Die Spracheingabe hat nicht geklappt. Bitte versuch es nochmal.";
}

export function useVoiceInput({
  onInterimTranscript,
  onFinalTranscript,
}: {
  /** Fired with each partial transcript so the caller can show live text. */
  onInterimTranscript: (text: string) => void;
  /** Fired once with the final transcript, ready to send. */
  onFinalTranscript: (text: string) => void;
}): {
  state: VoiceState;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
} {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);

  // Latest-callback refs so native event listeners never go stale.
  // Updated in an effect (not during render) per the react-hooks/refs rule.
  const onInterimRef = useRef(onInterimTranscript);
  const onFinalRef = useRef(onFinalTranscript);
  useEffect(() => {
    onInterimRef.current = onInterimTranscript;
    onFinalRef.current = onFinalTranscript;
  }, [onInterimTranscript, onFinalTranscript]);

  // Accumulated final text from prior segments in this session. Non-continuous
  // mode delivers one final result, but interim results may have already
  // partially filled the field — the final transcript replaces them.
  const finalRef = useRef("");

  useSpeechRecognitionEvent("start", () => {
    setState("listening");
    setError(null);
  });

  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results[0]?.transcript ?? "";
    if (event.isFinal) {
      finalRef.current = transcript;
      onFinalRef.current(transcript);
    } else {
      onInterimRef.current(transcript);
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    setError(voiceErrorMessage(event.error));
    setState("error");
  });

  useSpeechRecognitionEvent("end", () => {
    finalRef.current = "";
    setState("idle");
  });

  const start = useCallback(async () => {
    setError(null);
    finalRef.current = "";

    try {
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!result.granted) {
        setError(
          "Kein Zugriff auf das Mikrofon. Bitte erlaube den Zugriff in den Einstellungen.",
        );
        setState("error");
        return;
      }
    } catch {
      setError("Die Spracheingabe konnte nicht gestartet werden.");
      setState("error");
      return;
    }

    try {
      ExpoSpeechRecognitionModule.start({
        lang: "de-DE",
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
      });
    } catch {
      setError("Die Spracheingabe konnte nicht gestartet werden.");
      setState("error");
    }
  }, []);

  const stop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  const cancel = useCallback(() => {
    ExpoSpeechRecognitionModule.abort();
    finalRef.current = "";
    setState("idle");
  }, []);

  return { state, error, start, stop, cancel };
}
