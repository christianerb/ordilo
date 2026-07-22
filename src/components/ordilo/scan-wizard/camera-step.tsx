"use client";

import { useCallback, useRef, useState } from "react";
import {
  X,
  Zap,
  ZapOff,
  Images,
  Camera,
  CameraOff,
  Check,
  Loader2,
  NotebookPen,
  Undo2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { combinePagesToFile } from "@/lib/images-to-pdf";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CameraPermissionState = "requesting" | "ready" | "denied" | "unavailable";

interface CapturedPage {
  file: File;
  /** Object URL for the thumbnail preview (revoked on removal/unmount). */
  url: string;
}

// ---------------------------------------------------------------------------
// Auto-capture preference (opt-in, persisted across scans)
// ---------------------------------------------------------------------------

const AUTO_CAPTURE_KEY = "ordilo:auto-capture";

function readAutoCapturePref(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(AUTO_CAPTURE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeAutoCapturePref(value: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(AUTO_CAPTURE_KEY, value ? "1" : "0");
  } catch {
    // Private mode / disabled storage — preference stays session-only.
  }
}

export interface CameraStepProps {
  /**
   * Called with the finished capture: the original JPEG for a single page,
   * or a client-side PDF combining all pages for multi-page documents.
   */
  onCapture: (file: File) => void;
  /** Called when the user wants to pick a file instead (fallback + shortcut). */
  onUseGallery: () => void;
  /** Called when the user wants to write a note instead of scanning. */
  onCreateNote?: () => void;
  /** Called when the user closes the camera. */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Camera Step — an in-app camera viewfinder (getUserMedia) with an
 * alignment frame, a shutter button, and a best-effort torch toggle.
 *
 * Multi-page: each shutter press captures a page and keeps the camera
 * running. A thumbnail with page count appears on the left (tap the undo
 * button to discard the last page — instant retake), and a green check
 * finishes the document. One page uploads the original JPEG; several
 * pages are combined client-side into one PDF (see
 * `@/lib/images-to-pdf`) so multi-page letters become ONE document.
 *
 * The camera is also the app's add-hub: gallery/PDF picking and note
 * writing are one tap away, so "add anything" has a single entry point.
 *
 * The frame is a compositional aid only (helps the user hold the document
 * steady and centered) — it does not perform real edge detection. No
 * control is shown unless it actually works: the torch button only
 * appears when the active video track reports torch support, and any
 * camera access failure (denied permission, no camera, insecure context,
 * unsupported browser) falls back to a friendly panel offering the native
 * gallery/file picker instead of leaving the user stuck on a dead screen.
 */
export function CameraStep({
  onCapture,
  onUseGallery,
  onCreateNote,
  onClose,
}: CameraStepProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevSampleRef = useRef<Uint8ClampedArray | null>(null);
  const stillnessStartRef = useRef<number | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCaptureRef = useRef<boolean>(true);
  const [permission, setPermission] = useState<CameraPermissionState>("requesting");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [flash, setFlash] = useState(false);
  const [pages, setPages] = useState<CapturedPage[]>([]);
  const [finishing, setFinishing] = useState(false);
  const [autoCapture, setAutoCapture] = useState(readAutoCapturePref);
  const [stillness, setStillness] = useState(0);
  const pagesRef = useRef<CapturedPage[]>([]);
  pagesRef.current = pages;
  autoCaptureRef.current = autoCapture;
  const finishingRef = useRef(false);
  finishingRef.current = finishing;
  const handleShutterRef = useRef<() => void>(() => {});

  // --- Acquire the camera stream on mount, release it on unmount. ---
  useMountEffect(() => {
    let cancelled = false;
    // Some browsers silently block the prompt or never resolve; fall
    // back to "denied" after 5s so the user is never stuck on
    // "Kamera wird gestartet …".
    const permissionTimer = setTimeout(() => {
      if (!cancelled && streamRef.current === null) {
        setPermission("denied");
      }
    }, 5000);

    async function start() {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        if (!cancelled) setPermission("unavailable");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        // NOTE: the <video> element is only mounted once `permission`
        // becomes "ready", so it does not exist yet at this point.
        // Attaching the stream to it happens in the effect below, which
        // runs after the element is in the DOM — assigning srcObject here
        // would no-op against a null ref and leave the viewfinder black.

        // Feature-detect torch support (best-effort; most laptop/desktop
        // webcams and many mobile browsers don't expose it).
        const track = stream.getVideoTracks()[0];
        const capabilities = track?.getCapabilities?.() as
          | (MediaTrackCapabilities & { torch?: boolean })
          | undefined;
        if (!cancelled) {
          setTorchSupported(Boolean(capabilities?.torch));
          setPermission("ready");
        }
      } catch {
        if (!cancelled) setPermission("denied");
      }
    }

    start();

    return () => {
      cancelled = true;
      clearTimeout(permissionTimer);
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      // Release thumbnail object URLs.
      pagesRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    };
  });

  // --- Attach the acquired stream once the <video> is mounted. ---
  // The viewfinder is only rendered in the "ready" state, so the stream
  // must be wired up when the element actually appears — a callback ref
  // fires exactly then (after mount), whereas assigning srcObject inside
  // the acquire routine runs while still "requesting" (null ref) and would
  // leave the viewfinder black. A stable useCallback identity keeps React
  // from detaching/reattaching on every render.
  const attachVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    const stream = streamRef.current;
    if (!node || !stream) return;
    try {
      if (node.srcObject !== stream) {
        node.srcObject = stream;
      }
    } catch {
      // Some environments (e.g. jsdom in tests) don't implement srcObject.
    }
    void node.play?.().catch(() => {
      // Autoplay can be rejected; the feed resumes on user interaction.
    });
  }, []);

  // --- Auto-capture via stillness detection. ---
  // Samples the live video at ~5Hz into a tiny offscreen canvas, measures
  // frame-to-frame difference, and fires the shutter once the picture has
  // been stable for ~1.2s. A subtle readiness ring around the shutter
  // shows the accumulated stillness so the user understands *why* it
  // fires. Respects prefers-reduced-motion (disabled entirely) and can be
  // toggled off manually.
  useMountEffect(() => {
    if (typeof window === "undefined") return;
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    if (reduceMotion) {
      setAutoCapture(false);
      return;
    }

    const SAMPLE_MS = 200;
    const STABLE_THRESHOLD = 6; // mean per-channel delta under this = "still"
    const STABLE_DURATION_MS = 1200;

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 48;
    sampleCanvasRef.current = canvas;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const interval = setInterval(() => {
      const video = videoRef.current;
      if (
        !video ||
        video.videoWidth === 0 ||
        finishingRef.current ||
        !autoCaptureRef.current
      ) {
        setStillness(0);
        stillnessStartRef.current = null;
        return;
      }
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const prev = prevSampleRef.current;
      prevSampleRef.current = data;

      if (!prev) {
        setStillness(0);
        stillnessStartRef.current = Date.now();
        return;
      }

      // Mean absolute per-channel difference between consecutive frames.
      let sum = 0;
      const channels = Math.min(prev.length, data.length);
      for (let i = 0; i < channels; i += 4) {
        sum += Math.abs(data[i] - prev[i]);
        sum += Math.abs(data[i + 1] - prev[i + 1]);
        sum += Math.abs(data[i + 2] - prev[i + 2]);
      }
      const meanDelta = sum / (channels / 4 * 3);

      if (meanDelta < STABLE_THRESHOLD) {
        const started = stillnessStartRef.current ?? Date.now();
        stillnessStartRef.current = started;
        const elapsed = Date.now() - started;
        const progress = Math.min(1, elapsed / STABLE_DURATION_MS);
        setStillness(progress);
        if (progress >= 1) {
          // Stable long enough — capture and reset.
          stillnessStartRef.current = Date.now();
          setStillness(0);
          handleShutterRef.current();
        }
      } else {
        stillnessStartRef.current = Date.now();
        setStillness(0);
      }
    }, SAMPLE_MS);

    return () => {
      clearInterval(interval);
      prevSampleRef.current = null;
      stillnessStartRef.current = null;
      setStillness(0);
    };
  });

  // --- Torch toggle (best-effort; silently no-ops if it fails). ---
  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      // Torch control failed on this device — leave state unchanged.
    }
  }, [torchOn]);

  // --- Capture a frame from the live video → add it as a page. ---
  const handleShutter = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || finishingRef.current) return;

    // Taptic feedback on supporting mobile devices.
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate?.(10);
      } catch {
        // Vibration not allowed or unsupported — silently ignore.
      }
    }

    const viewportWidth = video.clientWidth;
    const viewportHeight = video.clientHeight;
    const sourceAspect = video.videoWidth / video.videoHeight;
    const viewportAspect = viewportWidth / viewportHeight;
    const cropToViewport =
      Number.isFinite(viewportAspect) && viewportWidth > 0 && viewportHeight > 0;
    const cropWidth =
      cropToViewport && sourceAspect > viewportAspect
        ? Math.round(video.videoHeight * viewportAspect)
        : video.videoWidth;
    const cropHeight =
      cropToViewport && sourceAspect < viewportAspect
        ? Math.round(video.videoWidth / viewportAspect)
        : video.videoHeight;
    const cropX = Math.round((video.videoWidth - cropWidth) / 2);
    const cropY = Math.round((video.videoHeight - cropHeight) / 2);

    const canvas = document.createElement("canvas");
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(
      video,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    // Brief white shutter-flash for tactile feedback.
    setFlash(true);
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current);
    }
    flashTimerRef.current = setTimeout(() => {
      setFlash(false);
      flashTimerRef.current = null;
    }, 180);

    // Reset stillness so auto-capture doesn't immediately re-fire.
    stillnessStartRef.current = Date.now();
    setStillness(0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `scan-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        // Keep the camera running — the next page is one tap away.
        setPages((prev) => [...prev, { file, url: URL.createObjectURL(blob) }]);
      },
      "image/jpeg",
      0.92,
    );
  }, []);
  handleShutterRef.current = handleShutter;

  // --- Discard a captured page by index (mid-stack delete). ---
  const handleRemovePage = useCallback((index: number) => {
    setPages((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  // --- Finish: hand over one JPEG or a combined multi-page PDF. ---
  const handleFinish = useCallback(async () => {
    if (pages.length === 0 || finishing) return;
    setFinishing(true);
    try {
      const file = await combinePagesToFile(pages.map((p) => p.file));
      streamRef.current?.getTracks().forEach((t) => t.stop());
      onCapture(file);
    } catch {
      // PDF assembly failed (should not happen for canvas JPEGs) — fall
      // back to uploading the first page so the user's work is not lost.
      toast.warning(
        "Die Seiten konnten nicht zusammengefügt werden — nur die erste Seite wurde übernommen.",
      );
      streamRef.current?.getTracks().forEach((t) => t.stop());
      onCapture(pages[0].file);
    }
  }, [pages, finishing, onCapture]);

  const isReady = permission === "ready";
  const hasFailed = permission === "denied" || permission === "unavailable";
  const hasPages = pages.length > 0;

  return (
    <div className="relative flex size-full flex-col bg-black" data-testid="camera-step">
      {/* Live video feed */}
      {isReady && (
        <video
          ref={attachVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 size-full object-cover"
          data-testid="camera-video"
        />
      )}

      {/* Shutter flash */}
      {flash && (
        <div
          className="absolute inset-0 bg-white animate-camera-flash motion-reduce:hidden"
          aria-hidden="true"
        />
      )}

      {/* Top bar */}
      <div
        className="relative z-10 flex items-center justify-between p-4"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="flex size-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white/50"
          aria-label="Kamera schließen"
        >
          <X className="size-5" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-2">
          {/* Auto-capture toggle: when on, the shutter fires automatically
              once the picture is steady. A subtle ring on the shutter
              shows the accumulated stillness. */}
          <button
            type="button"
            onClick={() => {
              setAutoCapture((prev) => {
                const next = !prev;
                writeAutoCapturePref(next);
                stillnessStartRef.current = Date.now();
                setStillness(0);
                return next;
              });
            }}
            className={cn(
              "flex size-10 items-center justify-center rounded-full backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white/50",
              autoCapture
                ? "bg-[var(--petrol)] text-white"
                : "bg-black/40 text-white hover:bg-black/60",
            )}
            aria-label={autoCapture ? "Automatisches Auslösen aus" : "Automatisches Auslösen an"}
            aria-pressed={autoCapture}
            data-testid="camera-auto-capture-toggle"
          >
            <Sparkles className="size-5" aria-hidden="true" />
          </button>

          {torchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              className="flex size-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white/50"
              aria-label={torchOn ? "Blitz ausschalten" : "Blitz einschalten"}
              aria-pressed={torchOn}
            >
              {torchOn ? (
                <Zap className="size-5" aria-hidden="true" />
              ) : (
                <ZapOff className="size-5" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Alignment frame + fallback state */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-8">
        {isReady && (
          <>
            <div
              className="relative aspect-[3/4] w-full max-w-[280px] rounded-ordilo-md border-2 border-white/70"
              aria-hidden="true"
            >
              {/* Corner brackets — a viewfinder alignment aid, drawn as a
                  single L-shaped glyph rotated per corner (not a border
                  accent) */}
              {(["top-3 left-3", "top-3 right-3 rotate-90", "bottom-3 right-3 rotate-180", "bottom-3 left-3 -rotate-90"] as const).map(
                (pos, i) => (
                  <svg
                    key={i}
                    viewBox="0 0 20 20"
                    className={cn("absolute size-5", pos)}
                  >
                    <path
                      d="M1 8 V3 a2 2 0 0 1 2-2 H8"
                      fill="none"
                      stroke="var(--apricot)"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                    />
                  </svg>
                ),
              )}
            </div>
            <p
              className="mt-4 rounded-full bg-black/40 px-4 py-1.5 text-sm text-white backdrop-blur-sm"
              data-testid="camera-hint"
            >
              {hasPages
                ? `Seite ${pages.length + 1} aufnehmen — oder unten abschließen`
                : autoCapture
                  ? "Dokument still halten — wird automatisch ausgelöst"
                  : "Dokument im Rahmen ausrichten"}
            </p>
          </>
        )}

        {permission === "requesting" && (
          <div className="flex flex-col items-center gap-3 text-white">
            <Camera className="size-10 animate-pulse" aria-hidden="true" strokeWidth={1.5} />
            <p className="text-sm text-white/80">Kamera wird gestartet …</p>
          </div>
        )}

        {hasFailed && (
          <div className="flex max-w-xs flex-col items-center gap-3 text-center text-white">
            <div className="flex size-14 items-center justify-center rounded-full bg-white/10">
              <CameraOff className="size-7" aria-hidden="true" strokeWidth={1.5} />
            </div>
            <h2 className="text-base font-semibold">
              {permission === "denied"
                ? "Kein Zugriff auf die Kamera"
                : "Kamera nicht verfügbar"}
            </h2>
            <p className="text-sm text-white/70">
              {permission === "denied"
                ? "Bitte erlaube den Kamerazugriff in den Browser-Einstellungen, oder wähle ein Foto aus der Galerie."
                : "Dieses Gerät oder dieser Browser unterstützt die Kamera hier nicht. Wähle stattdessen ein Foto oder eine PDF-Datei aus."}
            </p>
            <button
              type="button"
              onClick={onUseGallery}
              className="mt-2 inline-flex h-11 items-center gap-2 rounded-ordilo-md bg-white px-5 text-sm font-medium text-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white/50"
              data-testid="camera-fallback-gallery-button"
            >
              <Images className="size-4" aria-hidden="true" />
              Aus Galerie wählen
            </button>
            {onCreateNote && (
              <button
                type="button"
                onClick={onCreateNote}
                className="inline-flex h-11 items-center gap-2 rounded-ordilo-md border border-white/40 px-5 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white/50"
                data-testid="camera-fallback-note-button"
              >
                <NotebookPen className="size-4" aria-hidden="true" />
                Notiz schreiben
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      {isReady && (
        <div
          className="relative z-10 flex flex-col items-center gap-3 pb-6"
          style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          {/* Pages tray — every captured page is visible and individually
              removable, not just the last one. Horizontal scroll keeps the
              thumb row compact for long multi-page scans. */}
          {hasPages && (
            <div
              className="flex w-full max-w-md gap-2 overflow-x-auto px-4 pb-1"
              data-testid="camera-pages-tray"
            >
              {pages.map((page, i) => (
                <div
                  key={page.url}
                  className="relative shrink-0 animate-check-pop"
                  data-testid={`camera-page-${i}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={page.url}
                    alt={`Seite ${i + 1}`}
                    className="size-12 rounded-ordilo-sm border-2 border-white/70 object-cover"
                  />
                  <span
                    className="absolute -top-1.5 left-1 flex size-4 items-center justify-center rounded-full bg-black/70 text-[10px] font-semibold text-white"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemovePage(i)}
                    className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur-sm transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white/50"
                    aria-label={`Seite ${i + 1} verwerfen`}
                    data-testid={`camera-remove-page-${i}`}
                  >
                    <Undo2 className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex w-full items-center justify-center gap-10">
            {/* Left slot: gallery (always accessible, even mid-scan) */}
            <button
              type="button"
              onClick={onUseGallery}
              className="flex size-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white/50"
              aria-label="Foto oder PDF aus Galerie wählen"
              data-testid="camera-gallery-button"
            >
              <Images className="size-5" aria-hidden="true" />
            </button>

            {/* Shutter with auto-capture readiness ring */}
            <div className="relative flex size-[72px] shrink-0 items-center justify-center">
              {autoCapture && stillness > 0 && (
                <svg
                  className="pointer-events-none absolute inset-0 size-full -rotate-90"
                  viewBox="0 0 72 72"
                  aria-hidden="true"
                  data-testid="camera-shutter-readiness"
                >
                  <circle
                    cx="36"
                    cy="36"
                    r="34"
                    fill="none"
                    stroke="var(--apricot)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 34 * stillness} ${2 * Math.PI * 34}`}
                  />
                </svg>
              )}
              <button
                type="button"
                onClick={handleShutter}
                disabled={finishing}
                className="flex size-[72px] items-center justify-center rounded-full border-4 border-white/30 bg-white transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white/50 disabled:opacity-60"
                aria-label={hasPages ? "Weitere Seite aufnehmen" : "Foto aufnehmen"}
                data-testid="camera-shutter-button"
              >
                <span className="size-14 rounded-full bg-white" />
              </button>
            </div>

            {/* Right slot: note shortcut (no pages yet) or finish button */}
            {!hasPages ? (
              onCreateNote ? (
                <button
                  type="button"
                  onClick={onCreateNote}
                  className="flex size-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white/50"
                  aria-label="Notiz schreiben"
                  data-testid="camera-note-button"
                >
                  <NotebookPen className="size-5" aria-hidden="true" />
                </button>
              ) : (
                <div className="size-11" aria-hidden="true" />
              )
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                disabled={finishing}
                className="flex size-11 items-center justify-center rounded-full bg-[var(--petrol)] text-white transition-colors hover:bg-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white/50 disabled:opacity-70"
                aria-label={
                  pages.length === 1
                    ? "Fertig — Seite verwenden"
                    : `Fertig — ${pages.length} Seiten zusammenfügen`
                }
                data-testid="camera-finish-button"
              >
                {finishing ? (
                  <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="size-5" aria-hidden="true" />
                )}
              </button>
            )}
          </div>

          {/* Secondary labels under the bar keep the icons self-explanatory */}
          {!hasPages ? (
            <p className="text-xs text-white/70">
              Galerie/PDF&ensp;·&ensp;Auslöser&ensp;·&ensp;Notiz
            </p>
          ) : (
            <p className="text-xs text-white/70">
              {pages.length === 1
                ? "1 Seite — Haken tippen zum Fertigstellen"
                : `${pages.length} Seiten — werden zu einem Dokument zusammengefügt`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
