"use client";

import {
  useRef,
  useState,
  useCallback,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { Check, X } from "lucide-react";
import { TaskCard, type TaskCardData } from "@/components/ordilo/task-card";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

/**
 * SwipeableTaskCard — wraps a TaskCard with touch swipe gestures,
 * long-press touch drag-and-drop, and native drag-and-drop for desktop.
 *
 * Swipe right → mark as done (petrol check indicator).
 * Swipe left → dismiss (destructive X indicator).
 * Tap (minimal movement) → open task detail via onClick.
 * Long-press + drag (touch) → move task between board columns. The page
 *   scroll is blocked while dragging; columns are hit-tested via
 *   `document.elementFromPoint` against `[data-column-id]` ancestors.
 * Drag (desktop) → move task between board columns (native HTML5 DnD).
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
/** Finger must stay within TAP_THRESHOLD for this long to start a drag. */
const LONG_PRESS_MS = 450;
/** Viewport edge zones where the page auto-scrolls during a touch drag. */
const DRAG_SCROLL_EDGE_PX = 72;
const DRAG_SCROLL_STEP_PX = 12;

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
  /**
   * Called when a touch drag ends over a board column. When omitted,
   * long-press touch dragging is disabled (e.g. outside the board).
   */
  onTaskDrop?: (taskId: string, columnId: string) => void;
  /** Notifies the parent which column the touch drag is currently over. */
  onDragOverColumn?: (columnId: string | null) => void;
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
  onTaskDrop,
  onDragOverColumn,
}: SwipeableTaskCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const swiping = useRef(false);
  const moved = useRef(false);
  /** 0 = not armed, 1/-1 = armed past the threshold in that direction —
   * used to fire the "armed" tick exactly once per crossing. */
  const armed = useRef<0 | 1 | -1>(0);
  const reducedMotion = useRef(false);
  const [offset, setOffset] = useState(0);
  const [phase, setPhase] = useState<"live" | "snap" | "slide-off">("snap");
  const [isDragging, setIsDragging] = useState(false);

  // Touch drag state. `touchDragging` mirrors `dragOffset !== null` for use
  // inside event handlers without stale closures.
  const longPressTimer = useRef<number | null>(null);
  const touchDragging = useRef(false);
  const overColumnId = useRef<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null,
  );

  // Auto-scroll state for the drag loop: -1/0/+1 per frame while the
  // finger rests in a viewport edge zone, plus the last finger position
  // for re-hit-testing after each scroll step.
  const scrollVelocity = useRef(0);
  const lastTouchPos = useRef({ x: 0, y: 0 });
  const scrollRaf = useRef<number | null>(null);

  // The card's slide-off is helpful confirmation under normal motion, but
  // people who reduce motion should get the committed state immediately.
  // Keep this in a ref so gesture callbacks always read the current setting.
  useMountEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      reducedMotion.current = media.matches;
    };
    updatePreference();
    media.addEventListener?.("change", updatePreference);
    return () => media.removeEventListener?.("change", updatePreference);
  });

  // Latest callback refs so the rAF scroll loop never goes stale.
  const onDragOverColumnRef = useRef(onDragOverColumn);
  onDragOverColumnRef.current = onDragOverColumn;

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  /** Hit-test the board column under a viewport point and notify on change. */
  const updateOverColumn = useCallback((clientX: number, clientY: number) => {
    // The dragged card has pointer-events: none while dragging, so
    // elementFromPoint sees through it to the column (or a card inside one).
    const el = document.elementFromPoint(clientX, clientY);
    const columnId =
      el?.closest("[data-column-id]")?.getAttribute("data-column-id") ?? null;
    if (columnId !== overColumnId.current) {
      overColumnId.current = columnId;
      onDragOverColumnRef.current?.(columnId);
    }
  }, []);

  const activateTouchDrag = useCallback(() => {
    if (!onTaskDrop || touchDragging.current) return;
    touchDragging.current = true;
    setDragOffset({ x: 0, y: 0 });
    onDragStateChange?.(task.id);
    // Haptic bump where supported (Android; iOS Safari has none — the
    // animate-drag-pop class is the visual haptic there).
    haptic("light");

    // Continuous edge auto-scroll: keeps scrolling while the finger rests
    // in an edge zone, and re-hit-tests after each step because scrolling
    // moves the columns under the stationary finger.
    scrollVelocity.current = 0;
    const step = () => {
      if (!touchDragging.current) {
        scrollRaf.current = null;
        return;
      }
      if (scrollVelocity.current !== 0) {
        window.scrollBy(0, scrollVelocity.current * DRAG_SCROLL_STEP_PX);
        updateOverColumn(lastTouchPos.current.x, lastTouchPos.current.y);
      }
      scrollRaf.current = requestAnimationFrame(step);
    };
    scrollRaf.current = requestAnimationFrame(step);
  }, [onTaskDrop, onDragStateChange, task.id, updateOverColumn]);

  const endTouchDrag = useCallback(
    (drop: boolean) => {
      const target = overColumnId.current;
      touchDragging.current = false;
      overColumnId.current = null;
      swiping.current = false;
      scrollVelocity.current = 0;
      if (scrollRaf.current !== null) {
        cancelAnimationFrame(scrollRaf.current);
        scrollRaf.current = null;
      }
      setDragOffset(null);
      setPhase("snap");
      setOffset(0);
      onDragOverColumn?.(null);
      onDragStateChange?.(null);
      if (drop && target) {
        onTaskDrop?.(task.id, target);
      }
    },
    [onDragOverColumn, onDragStateChange, onTaskDrop, task.id],
  );

  // Block page scroll during a touch drag. React attaches touchmove as
  // passive, so preventDefault only works in a native non-passive listener.
  // Touch events stay captured to the gesture's original target, so the
  // listener on the wrapper fires for the whole drag. Attached once on
  // mount; the handler no-ops unless a touch drag is active.
  useMountEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const preventScrollDuringDrag = (e: TouchEvent) => {
      if (touchDragging.current) e.preventDefault();
    };
    el.addEventListener("touchmove", preventScrollDuringDrag, {
      passive: false,
    });
    return () => el.removeEventListener("touchmove", preventScrollDuringDrag);
  });

  const handleTouchStart = useCallback(
    (e: ReactTouchEvent) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      swiping.current = true;
      moved.current = false;
      armed.current = 0;
      setPhase("live");
      if (onTaskDrop) {
        longPressTimer.current = window.setTimeout(
          activateTouchDrag,
          LONG_PRESS_MS,
        );
      }
    },
    [onTaskDrop, activateTouchDrag],
  );

  const handleTouchMove = useCallback(
    (e: ReactTouchEvent) => {
      if (!swiping.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX.current;
      const dy = touch.clientY - startY.current;

      if (touchDragging.current) {
        setDragOffset({ x: dx, y: dy });
        lastTouchPos.current = { x: touch.clientX, y: touch.clientY };
        updateOverColumn(touch.clientX, touch.clientY);
        // Arm the edge auto-scroll; the rAF loop applies it continuously.
        if (touch.clientY < DRAG_SCROLL_EDGE_PX) {
          scrollVelocity.current = -1;
        } else if (touch.clientY > window.innerHeight - DRAG_SCROLL_EDGE_PX) {
          scrollVelocity.current = 1;
        } else {
          scrollVelocity.current = 0;
        }
        return;
      }

      if (Math.abs(dx) > TAP_THRESHOLD || Math.abs(dy) > TAP_THRESHOLD) {
        moved.current = true;
        // Movement before the long-press fired → swipe or page scroll.
        clearLongPressTimer();
      }
      setOffset(Math.max(-150, Math.min(150, dx)));

      // A light tick the instant the swipe first crosses the commit
      // threshold in either direction — like iOS's rubber-band tick when an
      // action becomes armed. Fires once per crossing, resets on release.
      const direction =
        dx > SWIPE_THRESHOLD ? 1 : dx < -SWIPE_THRESHOLD ? -1 : 0;
      if (direction !== 0 && armed.current !== direction) {
        armed.current = direction;
        haptic("selection");
      } else if (direction === 0) {
        armed.current = 0;
      }
    },
    [clearLongPressTimer, updateOverColumn],
  );

  const handleTouchEnd = useCallback(() => {
    clearLongPressTimer();
    if (touchDragging.current) {
      endTouchDrag(true);
      return;
    }
    if (!swiping.current) return;
    swiping.current = false;

    if (offset > SWIPE_THRESHOLD) {
      haptic("success");
      if (reducedMotion.current) {
        onToggleDone("done");
        return;
      }
      setPhase("slide-off");
      setOffset(SLIDE_OFF_DISTANCE);
      window.setTimeout(() => onToggleDone("done"), SLIDE_OFF_DURATION);
    } else if (offset < -SWIPE_THRESHOLD) {
      haptic("warning");
      if (reducedMotion.current) {
        onDismiss();
        return;
      }
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
  }, [offset, onToggleDone, onDismiss, onClick, clearLongPressTimer, endTouchDrag]);

  const handleTouchCancel = useCallback(() => {
    clearLongPressTimer();
    if (touchDragging.current) {
      endTouchDrag(false);
      return;
    }
    swiping.current = false;
    setPhase("snap");
    setOffset(0);
  }, [clearLongPressTimer, endTouchDrag]);

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
    reducedMotion.current || phase === "live"
      ? "none"
      : `transform ${phase === "slide-off" ? SLIDE_OFF_DURATION : 300}ms var(--ease-out-quart)`;

  const dragActive = dragOffset !== null;

  // Only clip overflow during active swipe — otherwise the hover shadow
  // gets clipped and the card feels dead on hover. Never clip during a
  // touch drag: the card must overflow its slot to reach other columns.
  const needsClip = !dragActive && (swiping.current || Math.abs(offset) > 0);

  return (
    <div
      ref={cardRef}
      className={cn(
        "relative select-none rounded-ordilo-sm transition-opacity",
        needsClip && "overflow-hidden",
        isDragging && "opacity-40",
      )}
      style={{ touchAction: "pan-y", WebkitTouchCallout: "none" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onContextMenu={(e) => {
        // Suppress the long-press context menu while touch-dragging.
        if (touchDragging.current) e.preventDefault();
      }}
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

      {/* The card, translated by the swipe offset or the touch-drag
          position, draggable for desktop DnD. While touch-dragging it
          floats above siblings and is transparent to hit-testing so the
          column underneath can be found via elementFromPoint. The pickup
          scale uses the individual `scale` property so the drag-pop
          animation and the inline translate never fight over `transform`. */}
      <div
        style={{
          transform: dragOffset
            ? `translate(${dragOffset.x}px, ${dragOffset.y}px)`
            : `translateX(${offset}px)`,
          scale: dragOffset ? "1.03" : undefined,
          transition: dragOffset ? "none" : transition,
        }}
        className={cn(
          "relative",
          dragOffset &&
            "animate-drag-pop pointer-events-none z-20 rounded-ordilo-sm shadow-card-hover",
        )}
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
