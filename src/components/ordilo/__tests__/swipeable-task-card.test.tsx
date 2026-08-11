import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { ComponentProps } from "react";

vi.mock("@/lib/scan/scan-context", () => ({
  useDocumentViewer: () => ({ openDocument: vi.fn() }),
}));

import { SwipeableTaskCard } from "@/components/ordilo/swipeable-task-card";
import type { TaskCardData } from "@/components/ordilo/task-card";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Must match LONG_PRESS_MS in swipeable-task-card.tsx. */
const LONG_PRESS_MS = 450;
/** Must match SLIDE_OFF_DURATION in swipeable-task-card.tsx. */
const SLIDE_OFF_DURATION = 200;

function makeTask(overrides: Partial<TaskCardData> = {}): TaskCardData {
  return {
    id: "task-1",
    family_id: "fam-1",
    document_id: null,
    title: "Schulsachen",
    description: null,
    due_date: null,
    priority: "medium",
    status: "open",
    confidence: 0.9,
    confirmed: true,
    created_at: "2026-08-01T00:00:00Z",
    tags: [],
    assigned_to: null,
    ...overrides,
  };
}

type CardProps = ComponentProps<typeof SwipeableTaskCard>;

function renderBoard(overrides: Partial<CardProps> = {}) {
  const props: CardProps = {
    task: makeTask(),
    onToggleDone: vi.fn(),
    onDismiss: vi.fn(),
    onClick: vi.fn(),
    onTaskDrop: vi.fn(),
    onDragStateChange: vi.fn(),
    onDragOverColumn: vi.fn(),
    ...overrides,
  };
  render(
    <div>
      <div data-column-id="this-week" data-testid="target-column">
        <p>Diese Woche</p>
      </div>
      <div data-column-id="later" data-testid="source-column">
        <SwipeableTaskCard {...props} />
      </div>
    </div>,
  );
  return props;
}

function touchStart(el: Element, x = 100, y = 100) {
  fireEvent.touchStart(el, { touches: [{ clientX: x, clientY: y }] });
}

function touchMove(el: Element, x: number, y: number) {
  fireEvent.touchMove(el, { touches: [{ clientX: x, clientY: y }] });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SwipeableTaskCard", () => {
  let originalElementFromPoint: typeof document.elementFromPoint;

  beforeEach(() => {
    vi.useFakeTimers();
    originalElementFromPoint = document.elementFromPoint;
  });

  afterEach(() => {
    document.elementFromPoint = originalElementFromPoint;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("touch drag-and-drop (long-press)", () => {
    it("drops the task on the column under the finger", () => {
      const props = renderBoard();
      const card = screen.getByTestId("task-card");
      document.elementFromPoint = vi
        .fn()
        .mockReturnValue(screen.getByTestId("target-column"));

      touchStart(card);
      act(() => vi.advanceTimersByTime(LONG_PRESS_MS + 50));
      expect(props.onDragStateChange).toHaveBeenCalledWith("task-1");

      touchMove(card, 100, 300);
      expect(props.onDragOverColumn).toHaveBeenCalledWith("this-week");

      fireEvent.touchEnd(card);
      expect(props.onTaskDrop).toHaveBeenCalledWith("task-1", "this-week");
      expect(props.onDragStateChange).toHaveBeenLastCalledWith(null);
      expect(props.onDragOverColumn).toHaveBeenLastCalledWith(null);
    });

    it("does not drop when released outside any column", () => {
      const props = renderBoard();
      const card = screen.getByTestId("task-card");
      document.elementFromPoint = vi.fn().mockReturnValue(null);

      touchStart(card);
      act(() => vi.advanceTimersByTime(LONG_PRESS_MS + 50));
      touchMove(card, 100, 300);
      fireEvent.touchEnd(card);

      expect(props.onTaskDrop).not.toHaveBeenCalled();
      expect(props.onDragStateChange).toHaveBeenLastCalledWith(null);
    });

    it("does not start a drag when the finger moves before the long-press", () => {
      const props = renderBoard();
      const card = screen.getByTestId("task-card");

      touchStart(card);
      act(() => vi.advanceTimersByTime(100));
      touchMove(card, 220, 100);
      act(() => vi.advanceTimersByTime(LONG_PRESS_MS + 100));

      expect(props.onDragStateChange).not.toHaveBeenCalled();
    });

    it("does not start a drag without an onTaskDrop handler", () => {
      const props = renderBoard({ onTaskDrop: undefined });
      const card = screen.getByTestId("task-card");

      touchStart(card);
      act(() => vi.advanceTimersByTime(LONG_PRESS_MS + 100));

      expect(props.onDragStateChange).not.toHaveBeenCalled();
    });

    it("plays the pickup pop animation only while dragging", () => {
      renderBoard();
      const card = screen.getByTestId("task-card");
      const draggable = card.closest("[draggable]") as HTMLElement;

      expect(draggable.className).not.toContain("animate-drag-pop");

      touchStart(card);
      act(() => vi.advanceTimersByTime(LONG_PRESS_MS + 50));
      expect(draggable.className).toContain("animate-drag-pop");

      fireEvent.touchEnd(card);
      expect(draggable.className).not.toContain("animate-drag-pop");
    });

    it("auto-scrolls up while the finger rests near the top edge", () => {
      const scrollBySpy = vi
        .spyOn(window, "scrollBy")
        .mockImplementation(() => {});
      renderBoard();
      const card = screen.getByTestId("task-card");
      document.elementFromPoint = vi.fn().mockReturnValue(null);

      touchStart(card);
      act(() => vi.advanceTimersByTime(LONG_PRESS_MS + 50));
      touchMove(card, 100, 10); // inside the top edge zone
      act(() => vi.advanceTimersByTime(100)); // let the rAF loop tick

      expect(scrollBySpy).toHaveBeenCalled();
      expect(scrollBySpy.mock.calls[0][1]).toBeLessThan(0);

      fireEvent.touchEnd(card);
      scrollBySpy.mockRestore();
    });

    it("does not auto-scroll in the middle of the viewport", () => {
      const scrollBySpy = vi
        .spyOn(window, "scrollBy")
        .mockImplementation(() => {});
      renderBoard();
      const card = screen.getByTestId("task-card");
      document.elementFromPoint = vi.fn().mockReturnValue(null);

      touchStart(card);
      act(() => vi.advanceTimersByTime(LONG_PRESS_MS + 50));
      touchMove(card, 100, 300); // middle of an ~768px jsdom viewport
      act(() => vi.advanceTimersByTime(100));

      expect(scrollBySpy).not.toHaveBeenCalled();

      fireEvent.touchEnd(card);
      scrollBySpy.mockRestore();
    });
  });

  describe("existing gestures stay intact", () => {
    it("treats a quick tap as a click", () => {
      const props = renderBoard();
      const card = screen.getByTestId("task-card");

      touchStart(card);
      fireEvent.touchEnd(card);

      expect(props.onClick).toHaveBeenCalled();
      expect(props.onTaskDrop).not.toHaveBeenCalled();
    });

    it("keeps swipe-right-to-done working", () => {
      const props = renderBoard();
      const card = screen.getByTestId("task-card");

      touchStart(card);
      touchMove(card, 220, 100);
      fireEvent.touchEnd(card);
      act(() => vi.advanceTimersByTime(SLIDE_OFF_DURATION + 50));

      expect(props.onToggleDone).toHaveBeenCalledWith("done");
      expect(props.onTaskDrop).not.toHaveBeenCalled();
    });

    it("commits a swipe immediately when reduced motion is preferred", () => {
      vi.stubGlobal(
        "matchMedia",
        vi.fn().mockReturnValue({
          matches: true,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
      );
      const props = renderBoard();
      const card = screen.getByTestId("task-card");

      touchStart(card);
      touchMove(card, 220, 100);
      fireEvent.touchEnd(card);

      expect(props.onToggleDone).toHaveBeenCalledWith("done");
    });
  });
});
