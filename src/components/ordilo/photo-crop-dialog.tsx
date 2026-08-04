"use client";

import { useRef, useState } from "react";
import { Loader2, ZoomIn, ZoomOut } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";

/** Displayed size of the circular crop frame, in CSS pixels. */
const FRAME_SIZE = 224;

/** Square resolution of the cropped photo that gets uploaded. */
const OUTPUT_SIZE = 512;

/** Maximum zoom relative to "image just covers the frame". */
const MAX_ZOOM = 3;

const JPEG_QUALITY = 0.9;

export interface PhotoCropDialogProps {
  /** The raw image file to crop. The dialog is open whenever this is non-null. */
  file: File | null;
  /** Called when the user cancels — discards the selection without uploading. */
  onCancel: () => void;
  /** Called with the cropped, re-encoded JPEG once the user confirms. */
  onConfirm: (file: File) => void;
}

interface NaturalSize {
  width: number;
  height: number;
}

interface Offset {
  x: number;
  y: number;
}

/** Scale at which the image exactly covers the frame (no gaps). */
function baseScaleFor(size: NaturalSize): number {
  return Math.max(FRAME_SIZE / size.width, FRAME_SIZE / size.height);
}

/** Keeps the image covering the frame — no empty space at any edge. */
function clampOffset(offset: Offset, displayedWidth: number, displayedHeight: number): Offset {
  const minX = Math.min(0, FRAME_SIZE - displayedWidth);
  const minY = Math.min(0, FRAME_SIZE - displayedHeight);
  return {
    x: Math.min(0, Math.max(minX, offset.x)),
    y: Math.min(0, Math.max(minY, offset.y)),
  };
}

/**
 * Photo Crop Dialog — lets the user pan and zoom an uploaded photo within a
 * circular frame before it's uploaded as a family member's profile photo.
 *
 * The dialog only ever shows one file at a time (the underlying file input
 * is covered by the modal overlay while open, so a new file can't arrive
 * without the dialog closing first). That means `PhotoCropDialogBody` below
 * can keep all of its crop state in plain `useState` — mounting fresh for
 * each file is exactly the reset it needs, no dependency-array effect
 * required.
 */
export function PhotoCropDialog({ file, onCancel, onConfirm }: PhotoCropDialogProps) {
  return (
    <Dialog
      open={file !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        {file && (
          <PhotoCropDialogBody file={file} onCancel={onCancel} onConfirm={onConfirm} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PhotoCropDialogBody({
  file,
  onCancel,
  onConfirm,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}) {
  const [objectUrl] = useState(() => URL.createObjectURL(file));
  useMountEffect(() => () => URL.revokeObjectURL(objectUrl));

  const [naturalSize, setNaturalSize] = useState<NaturalSize | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [loadError, setLoadError] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startOffset: Offset;
  } | null>(null);

  const scale = naturalSize ? baseScaleFor(naturalSize) * zoom : 1;
  const displayedWidth = naturalSize ? naturalSize.width * scale : 0;
  const displayedHeight = naturalSize ? naturalSize.height * scale : 0;

  const handleImageLoad = () => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) {
      setLoadError(true);
      return;
    }
    const size = { width: img.naturalWidth, height: img.naturalHeight };
    const initialScale = baseScaleFor(size);
    setNaturalSize(size);
    setOffset(
      clampOffset(
        {
          x: (FRAME_SIZE - size.width * initialScale) / 2,
          y: (FRAME_SIZE - size.height * initialScale) / 2,
        },
        size.width * initialScale,
        size.height * initialScale,
      ),
    );
  };

  const handleZoomChange = (nextZoom: number) => {
    if (!naturalSize) {
      setZoom(nextZoom);
      return;
    }
    // Zoom around the frame's current center, not the image's top-left.
    const centerX = (FRAME_SIZE / 2 - offset.x) / scale;
    const centerY = (FRAME_SIZE / 2 - offset.y) / scale;
    const nextScale = baseScaleFor(naturalSize) * nextZoom;
    setZoom(nextZoom);
    setOffset(
      clampOffset(
        {
          x: FRAME_SIZE / 2 - centerX * nextScale,
          y: FRAME_SIZE / 2 - centerY * nextScale,
        },
        naturalSize.width * nextScale,
        naturalSize.height * nextScale,
      ),
    );
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!naturalSize) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: offset,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset(
      clampOffset(
        {
          x: drag.startOffset.x + (event.clientX - drag.startX),
          y: drag.startOffset.y + (event.clientY - drag.startY),
        },
        displayedWidth,
        displayedHeight,
      ),
    );
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img || !naturalSize) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsProcessing(true);
    const sourceSize = FRAME_SIZE / scale;
    ctx.drawImage(
      img,
      -offset.x / scale,
      -offset.y / scale,
      sourceSize,
      sourceSize,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE,
    );
    canvas.toBlob(
      (blob) => {
        setIsProcessing(false);
        if (!blob) return;
        const baseName = file.name.replace(/\.[^.]+$/, "") || "foto";
        onConfirm(new File([blob], `${baseName}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Foto zuschneiden</DialogTitle>
        <DialogDescription>
          Verschiebe und vergrößere das Bild, um den Ausschnitt zu wählen, der als
          Profilfoto angezeigt wird.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col items-center gap-4">
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative size-56 touch-none overflow-hidden rounded-full bg-[var(--sand-warm)] ring-1 ring-border"
          data-testid="photo-crop-frame"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={objectUrl}
            alt=""
            draggable={false}
            onLoad={handleImageLoad}
            onError={() => setLoadError(true)}
            data-testid="photo-crop-image"
            className="absolute max-w-none touch-none select-none"
            style={
              naturalSize
                ? { left: offset.x, top: offset.y, width: displayedWidth, height: displayedHeight }
                : { opacity: 0 }
            }
          />
        </div>

        {loadError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            Das Bild konnte nicht geladen werden. Bitte ein anderes Foto wählen.
          </p>
        )}

        <div className="flex w-full items-center gap-2">
          <ZoomOut className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={!naturalSize}
            onChange={(e) => handleZoomChange(Number(e.target.value))}
            aria-label="Zoom"
            data-testid="photo-crop-zoom"
            className="h-2 flex-1 accent-primary disabled:opacity-50"
          />
          <ZoomIn className="size-4 shrink-0 text-muted-foreground" />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isProcessing}>
          Abbrechen
        </Button>
        <Button
          type="button"
          onClick={handleConfirm}
          disabled={!naturalSize || isProcessing}
          data-testid="photo-crop-confirm"
        >
          {isProcessing && <Loader2 className="size-4 animate-spin" />}
          Übernehmen
        </Button>
      </DialogFooter>
    </>
  );
}
