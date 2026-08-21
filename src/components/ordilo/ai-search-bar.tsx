"use client";

import {
  useState,
  useCallback,
  useRef,
  useSyncExternalStore,
  type Ref,
} from "react";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { ArrowUp, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import {
  createLevelTracker,
  useRealtimeTranscription,
} from "@/lib/realtime/use-realtime-transcription";
import { cn } from "@/lib/utils";
import { OrdiloMark } from "@/components/ordilo/ordilo-mark";

/**
 * Props for the AISearchBar component.
 */
export interface AISearchBarProps {
  /** Called with the trimmed query when the user submits (send button click). */
  onSubmit: (query: string) => void;
  /** Initial value for the input (e.g. pre-filled from home page). */
  initialValue?: string;
  /**
   * Optional controlled value. When provided, the input is controlled by
   * the parent (the parent owns the value and is notified via
   * `onValueChange`). Used on the /suche page so the parent can control
   * the bar value (e.g. populating it with an example query before
   * submission).
   */
  value?: string;
  /**
   * Called when the input value changes. Required for controlled mode
   * (when `value` is provided). The parent should update its `value` prop.
   */
  onValueChange?: (value: string) => void;
  /** Placeholder text (German). Defaults to "Frage Ordilo oder suche nach Dokumenten…". */
  placeholder?: string;
  /** When true, the input and send button are disabled and no submit fires. */
  isLoading?: boolean;
  /**
   * "stacked" puts the text on its own full-width row with the controls
   * beneath it (phone); "inline" keeps everything in one pill row (desktop,
   * where there is width to spare). A grown textarea always stacks.
   */
  layout?: "inline" | "stacked";
  /**
   * Fires when the textarea receives focus. The collapsed mobile pill uses
   * this to trigger the fullscreen composer overlay (Granola-style zoom).
   */
  onFocus?: () => void;
  /** Focuses the textarea on mount — used by the fullscreen overlay's bar. */
  autoFocus?: boolean;
  /** Optional additional className for the outer container. */
  className?: string;
  /** Exposes the underlying textarea node — React 19 accepts `ref` as a
      plain prop, no forwardRef needed. Used by DesktopBottomBar to focus
      the bar imperatively when a page requests the composer's focus
      (there is no fullscreen overlay to zoom into on desktop). */
  ref?: Ref<HTMLTextAreaElement>;
}

// ---------------------------------------------------------------------------
// Speech recognition (voice search)
// ---------------------------------------------------------------------------

/**
 * Minimal typing for the (webkit-prefixed) Web Speech API — TypeScript's
 * DOM lib does not ship SpeechRecognition types.
 */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type VoiceMode = "native" | "realtime" | null;

const NATIVE_LEVEL_HISTORY_LENGTH = 12;

/**
 * A compact, live meter for native browser speech recognition. Web Speech
 * only returns recognized text, so it needs its own local-only mic stream to
 * provide the same "I can hear you" feedback as the Realtime path.
 */
function useNativeAudioMeter() {
  const [levels, setLevels] = useState<number[]>(
    () => new Array(NATIVE_LEVEL_HISTORY_LENGTH).fill(0),
  );
  const micRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const frameRef = useRef<number | null>(null);
  const generationRef = useRef(0);

  const stop = useCallback(() => {
    generationRef.current += 1;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    for (const track of micRef.current?.getTracks() ?? []) track.stop();
    micRef.current = null;
    setLevels(new Array(NATIVE_LEVEL_HISTORY_LENGTH).fill(0));
  }, []);

  const start = useCallback(async () => {
    stop();
    const generation = generationRef.current;
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor || !navigator.mediaDevices?.getUserMedia) return;

    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (generation !== generationRef.current) {
        for (const track of mic.getTracks()) track.stop();
        return;
      }

      const audioContext = new AudioContextCtor();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      audioContext.createMediaStreamSource(mic).connect(analyser);
      micRef.current = mic;
      audioContextRef.current = audioContext;

      const tracker = createLevelTracker({
        historyLength: NATIVE_LEVEL_HISTORY_LENGTH,
      });
      const data = new Uint8Array(analyser.fftSize);
      const tick = (now: number) => {
        if (generation !== generationRef.current) return;
        analyser.getByteTimeDomainData(data);
        const snapshot = tracker.sample(data, now);
        if (snapshot) setLevels(snapshot);
        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    } catch {
      // Native speech recognition may still have its own microphone access.
      // The meter is optional feedback, never a reason to stop dictation.
    }
  }, [stop]);

  useMountEffect(() => stop);

  return { levels, start, stop };
}

function VoiceLevelBars({ levels }: { levels: number[] }) {
  return (
    <div
      className="flex h-6 w-11 shrink-0 items-center justify-center gap-0.5"
      data-testid="voice-level-meter"
      aria-hidden="true"
    >
      {levels.map((level, index) => (
        <span
          key={index}
          className="w-0.5 rounded-full bg-[var(--petrol)] transition-transform duration-75"
          style={{
            height: `${Math.max(5, 6 + level * 18)}px`,
          }}
        />
      ))}
    </div>
  );
}

function RealtimeVoiceLevelBars({
  subscribeLevels,
  getLevels,
}: Pick<
  ReturnType<typeof useRealtimeTranscription>,
  "subscribeLevels" | "getLevels"
>) {
  const levels = useSyncExternalStore(subscribeLevels, getLevels, getLevels);
  return <VoiceLevelBars levels={levels} />;
}

/** Resolve the SpeechRecognition constructor (Chrome/Safari prefix-aware). */
function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (
    (w.SpeechRecognition as SpeechRecognitionConstructor | undefined) ??
    (w.webkitSpeechRecognition as SpeechRecognitionConstructor | undefined) ??
    null
  );
}

function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  const displayModeStandalone = window.matchMedia?.(
    "(display-mode: standalone)",
  ).matches;
  const navigatorStandalone = (
    navigator as Navigator & { standalone?: boolean }
  ).standalone;
  return displayModeStandalone === true || navigatorStandalone === true;
}

/**
 * AI Search Bar — a pill-shaped input with an AI sparkle icon, a voice
 * input button, and a send button.
 *
 * The primary entry point for both search and chat on the /suche page
 * (VAL-CHAT-028). Submitting a natural-language query triggers the chat
 * flow (combined search + LLM synthesis).
 *
 * Submit behaviour:
 *   - Enter always inserts a newline — it never submits, so a message can
 *     be drafted across multiple lines without accidentally sending early.
 *   - Cmd+Enter, Ctrl+Enter or Alt+Enter → submit on a desktop keyboard.
 *   - Send button click → submit
 *   - Empty / whitespace-only input → no submit
 *
 * Voice input uses Web Speech in regular browser tabs. Installed PWAs and
 * unsupported browsers use authenticated Realtime transcription instead.
 *
 * The input is cleared after a successful submit.
 */
export function AISearchBar({
  onSubmit,
  initialValue = "",
  value,
  onValueChange,
  placeholder = "Frage Ordilo oder suche nach Dokumenten…",
  isLoading = false,
  layout = "inline",
  onFocus,
  autoFocus = false,
  className,
  ref,
}: AISearchBarProps) {
  // Controlled mode is active when the parent provides a `value` prop.
  // In controlled mode the parent owns the value; in uncontrolled mode the
  // component manages its own internal state (backward-compatible).
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(initialValue);
  const currentValue = isControlled ? (value as string) : internalValue;

  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize the textarea up to a max height, and remember whether it
  // outgrew a single line. On a phone the row is only ~209px wide once the
  // mic, send and scan buttons have taken their share, so a normal German
  // question wrapped every three or four words. Past one line the controls
  // move below the text and it gets the full width.
  const singleLineHeightRef = useRef<number | null>(null);
  const [multiline, setMultiline] = useState(false);

  const [voiceMode, setVoiceMode] = useState<VoiceMode>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const {
    levels: nativeLevels,
    start: startNativeMeter,
    stop: stopNativeMeter,
  } = useNativeAudioMeter();

  useMountEffect(() => {
    const el = inputRef.current;
    if (el && singleLineHeightRef.current === null) {
      singleLineHeightRef.current = el.scrollHeight;
    }
    // preventScroll: iOS Safari's default focus behavior pans the whole
    // visual viewport to reveal the input, which — inside a fullscreen
    // fixed overlay — shoves everything above it off-screen.
    if (autoFocus) el?.focus({ preventScroll: true });
    return () => {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      recognition?.abort();
      stopNativeMeter();
    };
  });

  // Notify the parent of a value change (controlled mode) or update the
  // internal state (uncontrolled mode).
  const setValue = useCallback(
    (next: string) => {
      if (isControlled) {
        onValueChange?.(next);
      } else {
        setInternalValue(next);
      }
    },
    [isControlled, onValueChange],
  );

  const handleSubmit = useCallback(
    (overrideValue?: string) => {
      const trimmed = (overrideValue ?? currentValue).trim();
      if (!trimmed || isLoading) return;
      onSubmit(trimmed);
      // Clear the bar after a successful submit. In controlled mode this
      // notifies the parent to reset its value.
      setValue("");
      // Reset textarea height after clearing.
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }
      setMultiline(false);
    },
    [currentValue, isLoading, onSubmit, setValue],
  );

  // A grown textarea always stacks, even in the inline layout.
  const stacked = layout === "stacked" || multiline;

  const handleInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const natural = el.scrollHeight;
    if (singleLineHeightRef.current === null && !el.value) {
      singleLineHeightRef.current = natural;
    }
    el.style.height = `${Math.min(natural, 120)}px`;
    const oneLine = singleLineHeightRef.current;
    setMultiline(oneLine !== null && natural > oneLine + 4);
  }, []);

  const {
    status: voiceStatus,
    subscribeLevels,
    getLevels,
    start,
    stop,
    cancel,
  } = useRealtimeTranscription({
    onTranscript: (transcript) => {
      setVoiceMode(null);
      setValue(transcript);
      handleSubmit(transcript);
    },
    onError: (message) => {
      setVoiceMode(null);
      toast.error(message);
    },
  });
  const listening = voiceMode === "native" || voiceStatus !== "idle";

  /** Use native speech in browser tabs, Realtime as the PWA fallback. */
  const handleVoiceToggle = useCallback(() => {
    if (voiceMode === "native") {
      recognitionRef.current?.stop();
      return;
    }
    if (voiceStatus === "listening") {
      stop();
      return;
    }
    if (voiceStatus !== "idle") {
      cancel();
      return;
    }

    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor || isStandalonePwa()) {
      setVoiceMode("realtime");
      void start();
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "de-DE";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let transcript = "";
      let isFinal = false;
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
        isFinal ||= event.results[i].isFinal;
      }
      setValue(transcript);
      if (isFinal && transcript.trim()) {
        // Speak → answer: submit the final transcript directly (zero
        // extra taps). The user can always type to refine afterwards.
        recognition.stop();
        handleSubmit(transcript);
      }
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
      stopNativeMeter();
      setVoiceMode("realtime");
      void start();
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      stopNativeMeter();
      setVoiceMode(null);
    };

    recognitionRef.current = recognition;
    setVoiceMode("native");
    void startNativeMeter();
    recognition.start();
  }, [
    cancel,
    handleSubmit,
    setValue,
    start,
    startNativeMeter,
    stop,
    stopNativeMeter,
    voiceMode,
    voiceStatus,
  ]);

  return (
    <div
      data-testid="ai-search-bar"
      className={cn(
        "border bg-card shadow-card transition-shadow focus-within:shadow-card-hover",
        // Single line: everything in one pill row. Multi-line: the text gets
        // the full width and the controls sit underneath, so a long question
        // is not squeezed into a ~24-character column.
        stacked
          ? "flex flex-col gap-1 rounded-ordilo-md px-3 py-2"
          : "flex items-center gap-2 rounded-full py-2 pr-1.5 pl-3",
        isLoading ? "border-transparent opacity-70" : "border-border",
        className,
      )}
    >
      {!stacked && (
        <OrdiloMark
          size={24}
          animate={false}
          className="shrink-0 text-[var(--petrol)]"
        />
      )}

      {/* Textarea input (grows with content) */}
      <textarea
        ref={(el) => {
          inputRef.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) ref.current = el;
        }}
        value={currentValue}
        onChange={(e) => {
          setValue(e.target.value);
          handleInput();
        }}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            (event.metaKey || event.ctrlKey || event.altKey)
          ) {
            event.preventDefault();
            handleSubmit();
          }
        }}
        onFocus={onFocus}
        disabled={isLoading}
        placeholder={listening ? "Ich höre zu …" : placeholder}
        rows={1}
        aria-label="Such- und Chat-Eingabe"
        className={cn(
          "max-h-[120px] resize-none border-0 bg-transparent py-1.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed",
          stacked ? "w-full" : "flex-1",
        )}
      />

      <div
        className={cn(
          "flex shrink-0 items-center",
          stacked ? "gap-1" : "gap-2",
        )}
      >
        {stacked && (
          <OrdiloMark
            size={24}
            animate={false}
            className="shrink-0 text-[var(--petrol)]"
          />
        )}

        {/* Push the mic and send to the trailing edge (stacked only — in
            the inline layout the row is content-sized). */}
        {stacked && <span className="flex-1" aria-hidden="true" />}

        {listening &&
          (voiceMode === "native" ? (
            <VoiceLevelBars levels={nativeLevels} />
          ) : (
            <RealtimeVoiceLevelBars
              subscribeLevels={subscribeLevels}
              getLevels={getLevels}
            />
          ))}

        <button
          type="button"
          onClick={handleVoiceToggle}
          disabled={isLoading}
          aria-label={listening ? "Spracheingabe stoppen" : "Mit Sprache fragen"}
          aria-pressed={listening}
          data-testid="voice-search-button"
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full transition-all focus-ring",
            listening
              ? "bg-[var(--petrol)] text-white animate-pulse"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {listening ? (
            <MicOff className="size-5" aria-hidden="true" />
          ) : (
            <Mic className="size-5" aria-hidden="true" />
          )}
        </button>

        {/* Send button */}
        <button
          type="button"
          onClick={() => handleSubmit()}
          disabled={isLoading || !currentValue.trim()}
          aria-label="Senden"
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full transition-all focus-ring",
            isLoading || !currentValue.trim()
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-[var(--petrol)] text-white hover:bg-[var(--petrol-dark)]",
          )}
        >
          <ArrowUp className="size-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
