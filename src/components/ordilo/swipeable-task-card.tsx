"use client";

import {
  useRef,
  useState,
  useCallback,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { CalendarClock, Check } from "lucide-react";
import {
  TaskCard,
  type TaskAssigneeDisplay,
  type TaskCardData,
} from "@/components/ordilo/task-card";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { cn } from "@/lib/utils";
import { vibrate } from "@/lib/haptics";

/**
 * SwipeableTaskCard — a task row with the two gestures a family actually
 * repeats, and nothing else.
 *
 * Swipe right → erledigt (petrol panel, "Erledigt").
 * Swipe left  → verschieben (apricot panel, "Verschieben") — opens the
 *   "Wann?" sheet rather than changing the date behind the user's back.
 *
 * Three rules this component exists to keep:
 *
 * 1. **It never invents a tap.** An earlier version fired `onClick` from
 *    `touchend` for any tap on the row, which stole the tap from the
 *    controls inside it — pressing the checkbox opened the detail sheet
 *    instead of ticking the task off, and pressing "…" opened the menu
 *    *and* the sheet. Real DOM clicks do that job now; this component only
 *    *suppresses* the click that a browser may synthesise at the end of a
 *    swipe.
 *
 * 2. **It locks to one axis.** Whichever direction the finger commits to
 *    in the first few pixels wins for the rest of the gesture, so scrolling
 *    the list never smears the rows sideways.
 *
 * 3. **Both gestures are reversible.** Right completes (undoable from the
 *    toast), left only *opens* a sheet. Verwerfen — the one destructive
 *    action — is deliberately not on a gesture; it lives in the "…" menu
 *    behind a confirmation.
 *
 * Long-press drag-and-drop between sections used to live here too. It is
 * gone: on a phone the drop target is usually off-screen, so it demanded
 * dragging, auto-scrolling and aiming at once, and it hijacked the natural
 * "hold your finger still" gesture. Explicit rescheduling replaced it.
 */

/** Distance the finger must travel before a swipe commits. */
const SWIPE_THRESHOLD = 72;
/** Movement that decides whether this gesture is a swipe or a scroll. */
const AXIS_LOCK_PX = 8;
/** Furthest the row can travel, however hard the swipe. */
const MAX_OFFSET = 132;
/** Beyond the threshold the row resists — a detent you can feel. */
const RESISTANCE = 0.4;
const SLIDE_OFF_DISTANCE = 320;
const SETTLE_DURATION = 200;
const SWIPE_SPEED_THRESHOLD = 0.11;
/**
 * How long a swipe keeps swallowing clicks. Browsers may synthesise a
 * click after a touch sequence; without a window this long, a swipe that
 * ends over the row body would also open the detail sheet.
 */
const CLICK_SUPPRESS_MS = 400;

function currentTranslateX(element: HTMLElement): number {
  const transform = window.getComputedStyle(element).transform;
  if (!transform || transform === "none") return 0;
  const matrix3d = transform.match(/^matrix3d\((.+)\)$/);
  if (matrix3d) return Number(matrix3d[1].split(",")[12]) || 0;
  const matrix = transform.match(/^matrix\((.+)\)$/);
  if (matrix) return Number(matrix[1].split(",")[4]) || 0;
  const translate = transform.match(/^translate3d\(([-\d.]+)px/);
  return translate ? Number(translate[1]) || 0 : 0;
}

export interface SwipeableTaskCardProps {
  task: TaskCardData;
  /** Who the task belongs to, with their face (see TaskCard). */
  assignee?: TaskAssigneeDisplay;
  /** Flat row inside a grouped surface — no own card chrome. */
  flat?: boolean;
  /** Extra classes for the card itself (e.g. row padding in a list). */
  cardClassName?: string;
  /**
   * Background of the moving layer. A flat row is transparent, which would
   * let the swipe-action colors behind it shine through before the swipe
   * even starts — so in a list the row carries its own opaque surface.
   */
  surfaceClassName?: string;
  onToggleDone: (newStatus: string) => void;
  onDismiss: () => void;
  /**
   * Open the "Wann?" sheet. Wired to the left swipe and the row menu; when
   * omitted, the left swipe is disabled (the row simply will not move
   * left, so the gesture never promises something that cannot happen).
   */
  onSchedule?: () => void;
  /** Open the member picker on the row's assignee avatar. */
  onAssign?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onClick?: () => void;
  showConfidence?: boolean;
  /** Label for the delete/dismiss menu item. Defaults to "Löschen". */
  deleteLabel?: string;
}

export function SwipeableTaskCard({
  task,
  assignee,
  flat = false,
  cardClassName,
  surfaceClassName,
  onToggleDone,
  onDismiss,
  onSchedule,
  onAssign,
  onEdit,
  onDelete,
  onClick,
  showConfidence = false,
  deleteLabel = "Löschen",
}: SwipeableTaskCardProps) {
  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);
  const latestRawDx = useRef(0);
  const gestureBaseOffset = useRef(0);
  const visualOffset = useRef(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** null = undecided, "x" = swiping, "y" = the page is scrolling. */
  const axis = useRef<null | "x" | "y">(null);
  const tracking = useRef(false);
  /** 0 = not armed, 1/-1 = past the threshold — ticks once per crossing. */
  const armedDirection = useRef<0 | 1 | -1>(0);
  const reducedMotion = useRef(false);
  const suppressClick = useRef(false);
  const suppressTimer = useRef<number | null>(null);
  const commitTimer = useRef<number | null>(null);
  /** A committed completion owns its timer and cannot be interrupted. */
  const completionPending = useRef(false);

  const [swipeDirection, setSwipeDirection] = useState<0 | 1 | -1>(0);
  const [armed, setArmed] = useState(false);

  // The slide-off is helpful confirmation under normal motion, but people
  // who reduce motion should get the committed state immediately. Kept in
  // a ref so gesture callbacks always read the current setting.
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

  useMountEffect(() => () => {
    if (suppressTimer.current !== null) {
      window.clearTimeout(suppressTimer.current);
    }
    if (commitTimer.current !== null) {
      window.clearTimeout(commitTimer.current);
    }
  });

  /**
   * Can the row travel this way, and does something happen if it does?
   *
   * A row that cannot deliver on a gesture must not move at all — a panel
   * sliding in under the finger is a promise. Nothing to complete on an
   * already-finished task (the checkbox still reopens it), and nothing to
   * open left when no schedule sheet was wired up.
   */
  const canSwipe = useCallback(
    (direction: 1 | -1) =>
      direction === 1 ? task.status !== "done" : Boolean(onSchedule),
    [onSchedule, task.status],
  );

  /** Screen travel for a finger delta — linear, then resisting. */
  const resist = useCallback((dx: number) => {
    const direction = dx >= 0 ? 1 : -1;
    const distance = Math.abs(dx);
    const eased =
      distance <= SWIPE_THRESHOLD
        ? distance
        : SWIPE_THRESHOLD + (distance - SWIPE_THRESHOLD) * RESISTANCE;
    return direction * Math.min(MAX_OFFSET, eased);
  }, []);

  const setVisualOffset = useCallback((offset: number) => {
    visualOffset.current = offset;
    if (rowRef.current) {
      rowRef.current.style.transform = `translate3d(${offset}px, 0, 0)`;
    }
    if (panelRef.current) {
      panelRef.current.style.opacity = String(
        Math.min(1, Math.abs(offset) / 36),
      );
    }
  }, []);

  const clearCommitTimer = useCallback(() => {
    if (commitTimer.current !== null) {
      window.clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
  }, []);

  const settleToZero = useCallback(() => {
    if (rowRef.current) {
      rowRef.current.style.transition = reducedMotion.current
        ? "none"
        : `transform ${SETTLE_DURATION}ms var(--ease-out)`;
    }
    if (panelRef.current) panelRef.current.style.opacity = "0";
    setVisualOffset(0);
    clearCommitTimer();
    if (reducedMotion.current) {
      setSwipeDirection(0);
      return;
    }
    commitTimer.current = window.setTimeout(() => {
      commitTimer.current = null;
      setSwipeDirection(0);
    }, SETTLE_DURATION);
  }, [clearCommitTimer, setVisualOffset]);

  const resetGesture = useCallback(() => {
    tracking.current = false;
    axis.current = null;
    armedDirection.current = 0;
    latestRawDx.current = 0;
    setArmed(false);
    settleToZero();
  }, [settleToZero]);

  const handleTouchStart = useCallback((e: ReactTouchEvent) => {
    if (completionPending.current) return;
    clearCommitTimer();
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    startTime.current = performance.now();
    latestRawDx.current = 0;
    const currentOffset = rowRef.current
      ? currentTranslateX(rowRef.current)
      : visualOffset.current;
    gestureBaseOffset.current = currentOffset;
    tracking.current = true;
    axis.current = null;
    armedDirection.current = 0;
    suppressClick.current = false;
    setArmed(false);
    if (rowRef.current) {
      rowRef.current.style.transition = "none";
      setVisualOffset(currentOffset);
    }
  }, [clearCommitTimer, setVisualOffset]);

  const handleTouchMove = useCallback(
    (e: ReactTouchEvent) => {
      if (!tracking.current) return;
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;

      // Decide once what this gesture is. A list is scrolled far more
      // often than a row is swiped, so anything that leans vertical is
      // handed to the page and never comes back to us.
      if (axis.current === null) {
        if (Math.abs(dy) > AXIS_LOCK_PX && Math.abs(dy) >= Math.abs(dx)) {
          axis.current = "y";
          resetGesture();
          return;
        }
        if (Math.abs(dx) > AXIS_LOCK_PX) {
          axis.current = "x";
          // A real swipe: whatever click the browser synthesises at the
          // end of it must not reach the row.
          suppressClick.current = true;
        } else {
          return;
        }
      }
      if (axis.current !== "x") return;

      const direction = dx >= 0 ? 1 : -1;
      latestRawDx.current = dx;
      if (!canSwipe(direction)) {
        setSwipeDirection(0);
        setVisualOffset(0);
        return;
      }

      setSwipeDirection(direction);
      const resistedOffset = resist(dx);
      setVisualOffset(
        reducedMotion.current
          ? 0
          : gestureBaseOffset.current + resistedOffset,
      );
      if (reducedMotion.current && panelRef.current) {
        panelRef.current.style.opacity = String(
          Math.min(1, Math.abs(resistedOffset) / 36),
        );
      }

      // A light tick the instant the swipe crosses the commit threshold,
      // like iOS's rubber-band tick when an action becomes armed. Fires
      // once per crossing, resets when the finger comes back.
      const crossed =
        Math.abs(dx) > SWIPE_THRESHOLD && canSwipe(direction) ? direction : 0;
      if (crossed !== armedDirection.current) {
        armedDirection.current = crossed;
        setArmed(crossed !== 0);
        if (crossed !== 0) vibrate(8);
      }
    },
    [canSwipe, resetGesture, resist, setVisualOffset],
  );

  const handleTouchEnd = useCallback(() => {
    if (!tracking.current) return;
    tracking.current = false;
    const rawDx = latestRawDx.current;
    const direction: 1 | -1 = rawDx >= 0 ? 1 : -1;
    const elapsedMs = Math.max(performance.now() - startTime.current, 1);
    const speed = Math.abs(rawDx) / elapsedMs;
    const committed =
      rawDx !== 0 &&
      canSwipe(direction) &&
      (Math.abs(rawDx) > SWIPE_THRESHOLD || speed > SWIPE_SPEED_THRESHOLD)
        ? direction
        : 0;
    axis.current = null;
    armedDirection.current = 0;
    latestRawDx.current = 0;
    setArmed(false);

    // Release the click suppression on a timer: the synthesised click, if
    // there is one, arrives right after this handler.
    if (suppressClick.current) {
      if (suppressTimer.current !== null) {
        window.clearTimeout(suppressTimer.current);
      }
      suppressTimer.current = window.setTimeout(() => {
        suppressClick.current = false;
        suppressTimer.current = null;
      }, CLICK_SUPPRESS_MS);
    }

    if (committed === 0) {
      settleToZero();
      return;
    }

    vibrate(14);

    // Left = verschieben: the row stays in the list and a sheet asks when,
    // so it springs back rather than sliding away.
    if (committed === -1) {
      settleToZero();
      onSchedule?.();
      return;
    }

    // Right = erledigt: the row leaves the section it was in, so it slides
    // out and the callback lands once it is gone.
    if (reducedMotion.current) {
      if (rowRef.current) rowRef.current.style.transition = "none";
      if (panelRef.current) panelRef.current.style.opacity = "0";
      setVisualOffset(0);
      setSwipeDirection(0);
      onToggleDone("done");
      return;
    }
    if (rowRef.current) {
      rowRef.current.style.transition =
        `transform ${SETTLE_DURATION}ms var(--ease-out)`;
    }
    setVisualOffset(SLIDE_OFF_DISTANCE);
    clearCommitTimer();
    completionPending.current = true;
    commitTimer.current = window.setTimeout(() => {
      commitTimer.current = null;
      completionPending.current = false;
      onToggleDone("done");
    }, SETTLE_DURATION);
  }, [
    canSwipe,
    clearCommitTimer,
    onSchedule,
    onToggleDone,
    setVisualOffset,
    settleToZero,
  ]);

  const handleTouchCancel = useCallback(() => {
    if (completionPending.current) return;
    resetGesture();
  }, [resetGesture]);

  const isDoneDirection = swipeDirection === 1;

  return (
    <div
      className={cn(
        "relative select-none rounded-ordilo-sm",
        swipeDirection !== 0 && "overflow-hidden",
      )}
      style={{ touchAction: "pan-y", WebkitTouchCallout: "none" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onClickCapture={(e) => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      data-testid="swipeable-task-card"
    >
      {/* What the swipe will do, named — not a mystery icon. */}
      {swipeDirection !== 0 && (
        <div
          ref={panelRef}
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center rounded-ordilo-sm px-4 opacity-0",
            isDoneDirection ? "justify-start" : "justify-end",
          )}
          style={{
            backgroundColor: isDoneDirection
              ? "var(--petrol)"
              : "var(--apricot)",
          }}
          aria-hidden="true"
          data-testid="swipe-action-panel"
          data-action={isDoneDirection ? "done" : "schedule"}
        >
          <span
            className={cn(
              "flex items-center gap-2 text-sm font-medium text-white transition-transform motion-reduce:transform-none",
              armed && "scale-[1.06]",
            )}
          >
            {isDoneDirection ? (
              <>
                <Check className="size-4.5" strokeWidth={3} />
                Erledigt
              </>
            ) : (
              <>
                <CalendarClock className="size-4.5" strokeWidth={2.2} />
                Verschieben
              </>
            )}
          </span>
        </div>
      )}

      <div
        ref={rowRef}
        style={{ transform: "translate3d(0, 0, 0)", transition: "none" }}
        className={cn("relative", flat && (surfaceClassName ?? "bg-card"))}
      >
        <TaskCard
          task={task}
          assignee={assignee}
          flat={flat}
          className={cardClassName}
          onToggleDone={onToggleDone}
          onDismiss={onDismiss}
          onSchedule={onSchedule}
          onAssign={onAssign}
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
