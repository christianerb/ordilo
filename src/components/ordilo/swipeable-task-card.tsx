"use client";

import { useRef, useState, useCallback, type TouchEvent } from "react";
import { Check, X } from "lucide-react";
import { TaskCard, type TaskCardData } from "@/components/ordilo/task-card";
import { cn } from "@/lib/utils";

/**
 * SwipeableTaskCard — wraps a TaskCard with touch swipe gestures and
 * native drag-and-drop for desktop.
 *
 * Swipe right → mark as done (petrol check indicator).
 * Swipe left → dismiss (destructive X indicator).
 * Tap (minimal movement) → open task detail via onClick.
 * Drag (desktop) → move task between board columns.
 *
 * Visual flow on swipe commit:
 * 1. Card slides off-screen in the swipe direction (200ms).
 * 2. Callback fires after the slide completes.
 * If the swipe doesn't cross the threshold, the card snaps back.
 */
const SWIPE_THRESHOLD = 80;
const TAP_THRESHOLD = 10;
const SLIDE_OFF_DISTANCE = 200;
const SLIDE_OFF_DURATION = 200;

export interface SwipeableTaskCardProps {
  task: TaskCardData;
  onToggleDone: (newStatus: string) => void;
  onDismiss: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onClick?: () => void;
  showConfidence?: boolean;
  /** Label for the delete/dismiss menu item. Defaults to "Löschen". */
  deleteLabel?: string;
  /** Notifies the parent when a drag starts/ends (for drop-target gating). */
  onDragStateChange?: (taskId: string | null) => void;
}

export function SwipeableTaskCard({
  task,
  onToggleDone,
  onDismiss,
  onEdit,
  onDelete,
  onClick,
  showConfidence = false,
  deleteLabel = "Löschen",
  onDragStateChange,
}: SwipeableTaskCardProps) {
  const startX = useRef(0);
  const startY = useRef(0);
  const swiping = useRef(false);
  const moved = useRef(false);
  const [offset, setOffset] = useState(0);
  const [phase, setPhase] = useState<"live" | "snap" | "slide-off">("snap");
  const [isDragging, setIsDragging] = useState(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    swiping.current = true;
    moved.current = false;
    setPhase("live");
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!swiping.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (Math.abs(dx) > TAP_THRESHOLD || Math.abs(dy) > TAP_THRESHOLD) {
      moved.current = true;
    }
    setOffset(Math.max(-150, Math.min(150, dx)));
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!swiping.current) return;
    swiping.current = false;

    if (offset > SWIPE_THRESHOLD) {
      setPhase("slide-off");
      setOffset(SLIDE_OFF_DISTANCE);
      window.setTimeout(() => onToggleDone("done"), SLIDE_OFF_DURATION);
    } else if (offset < -SWIPE_THRESHOLD) {
      setPhase("slide-off");
      setOffset(-SLIDE_OFF_DISTANCE);
      window.setTimeout(() => onDismiss(), SLIDE_OFF_DURATION);
    } else {
      // Below threshold — snap back. If it was a tap (minimal movement),
      // trigger onClick.
      if (!moved.current && onClick) {
        onClick();
      }
      setPhase("snap");
      setOffset(0);
    }
  }, [offset, onToggleDone, onDismiss, onClick]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", task.id);
    e.dataTransfer.effectAllowed = "move";
    setIsDragging(true);
    onDragStateChange?.(task.id);
  }, [task.id, onDragStateChange]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    onDragStateChange?.(null);
  }, [onDragStateChange]);

  const hintOpacity = Math.min(1, Math.abs(offset) / SWIPE_THRESHOLD);
  const transition =
    phase === "live"
      ? "none"
      : `transform ${phase === "slide-off" ? SLIDE_OFF_DURATION : 300}ms var(--ease-out-quart)`;

  // Only clip overflow during active swipe — otherwise the hover shadow
  // gets clipped and the card feels dead on hover.
  const needsClip = swiping.current || Math.abs(offset) > 0;

  return (
    <div
      className={cn(
        "relative rounded-ordilo-sm transition-opacity",
        needsClip && "overflow-hidden",
        isDragging && "opacity-40",
      )}
      style={{ touchAction: "pan-y" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Swipe background indicators */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-between px-4"
        aria-hidden="true"
      >
        <div
          className="flex size-8 items-center justify-center rounded-full"
          style={{
            backgroundColor: "var(--petrol)",
            opacity: offset > 20 ? hintOpacity : 0,
          }}
        >
          <Check className="size-4 text-white" strokeWidth={3} />
        </div>
        <div
          className="flex size-8 items-center justify-center rounded-full"
          style={{
            backgroundColor: "var(--destructive)",
            opacity: offset < -20 ? hintOpacity : 0,
          }}
        >
          <X className="size-4 text-white" strokeWidth={2} />
        </div>
      </div>

      {/* The card, translated by the swipe offset, draggable for DnD */}
      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition,
        }}
        className="relative"
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <TaskCard
          task={task}
          onToggleDone={onToggleDone}
          onDismiss={onDismiss}
          onEdit={onEdit}
          onDelete={onDelete}
          onClick={onClick}
          showConfidence={showConfidence}
          deleteLabel={deleteLabel}
        />
      </div>
    </div>
  );
}
