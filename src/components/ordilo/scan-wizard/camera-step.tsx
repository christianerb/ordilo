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
} from "lucide-react";
import { cn } from "@/lib/utils";
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
  const [permission, setPermission] = useState<CameraPermissionState>("requesting");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [flash, setFlash] = useState(false);
  const [pages, setPages] = useState<CapturedPage[]>([]);
  const [finishing, setFinishing] = useState(false);
  const pagesRef = useRef<CapturedPage[]>([]);
  pagesRef.current = pages;

  // --- Acquire the camera stream on mount, release it on unmount. ---
  useMountEffect(() => {
    let cancelled = false;

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
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {
            // Autoplay can be rejected in rare cases; the video still
            // renders once the user interacts with the page.
          });
        }

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
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      // Release thumbnail object URLs.
      pagesRef.current.forEach((p) => URL.revokeObjectURL(p.url));
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
    if (!video || video.videoWidth === 0 || finishing) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Brief white shutter-flash for tactile feedback.
    setFlash(true);
    setTimeout(() => setFlash(false), 180);

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
  }, [finishing]);

  // --- Discard the last captured page (instant retake). ---
  const handleRemoveLastPage = useCallback(() => {
    setPages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      URL.revokeObjectURL(last.url);
      return prev.slice(0, -1);
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
      streamRef.current?.getTracks().forEach((t) => t.stop());
      onCapture(pages[0].file);
    }
  }, [pages, finishing, onCapture]);

  const isReady = permission === "ready";
  const hasFailed = permission === "denied" || permission === "unavailable";
  const hasPages = pages.length > 0;
  const lastPage = pages[pages.length - 1];

  return (
    <div className="relative flex size-full flex-col bg-black" data-testid="camera-step">
      {/* Live video feed */}
      {isReady && (
        <video
          ref={videoRef}
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
          <div className="flex w-full items-center justify-center gap-10">
            {/* Left slot: gallery (no pages yet) or last-page thumbnail */}
            {!hasPages ? (
              <button
                type="button"
                onClick={onUseGallery}
                className="flex size-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white/50"
                aria-label="Foto oder PDF aus Galerie wählen"
                data-testid="camera-gallery-button"
              >
                <Images className="size-5" aria-hidden="true" />
              </button>
            ) : (
              <div className="relative" data-testid="camera-page-stack">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={lastPage.url}
                  alt={`Seite ${pages.length}`}
                  className="size-11 rounded-ordilo-sm border-2 border-white/70 object-cover"
                />
                <span
                  className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-[var(--apricot)] text-[11px] font-semibold text-white"
                  data-testid="camera-page-count"
                >
                  {pages.length}
                </span>
                <button
                  type="button"
                  onClick={handleRemoveLastPage}
                  className="absolute -bottom-2 -right-2 flex size-6 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur-sm transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white/50"
                  aria-label="Letzte Seite verwerfen"
                  data-testid="camera-remove-page-button"
                >
                  <Undo2 className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleShutter}
              disabled={finishing}
              className="flex size-[72px] shrink-0 items-center justify-center rounded-full border-4 border-white/30 bg-white transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white/50 disabled:opacity-60"
              aria-label={hasPages ? "Weitere Seite aufnehmen" : "Foto aufnehmen"}
              data-testid="camera-shutter-button"
            >
              <span className="size-14 rounded-full bg-white" />
            </button>

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
