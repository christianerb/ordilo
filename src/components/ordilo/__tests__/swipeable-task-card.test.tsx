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

/** Must match SLIDE_OFF_DURATION in swipeable-task-card.tsx. */
const SLIDE_OFF_DURATION = 220;
/** Comfortably past SWIPE_THRESHOLD (72). */
const PAST_THRESHOLD = 120;

function makeTask(overrides: Partial<TaskCardData> = {}): TaskCardData {
  return {
    id: "task-1",
    family_id: "fam-1",
    document_id: null,
    title: "Schulsachen",
    description: null,
    due_date: null,
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

function renderCard(overrides: Partial<CardProps> = {}) {
  const props: CardProps = {
    task: makeTask(),
    onToggleDone: vi.fn(),
    onDismiss: vi.fn(),
    onSchedule: vi.fn(),
    onClick: vi.fn(),
    ...overrides,
  };
  render(<SwipeableTaskCard {...props} />);
  return props;
}

function touchStart(el: Element, x = 160, y = 100) {
  fireEvent.touchStart(el, { touches: [{ clientX: x, clientY: y }] });
}

function touchMove(el: Element, x: number, y: number) {
  fireEvent.touchMove(el, { touches: [{ clientX: x, clientY: y }] });
}

/** A complete horizontal swipe by `dx` pixels, in two steps. */
function swipe(el: Element, dx: number) {
  touchStart(el);
  touchMove(el, 160 + Math.sign(dx) * 12, 100);
  touchMove(el, 160 + dx, 100);
  fireEvent.touchEnd(el);
}

function panel(): HTMLElement | null {
  return screen.queryByTestId("swipe-action-panel");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SwipeableTaskCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("swipe right — erledigt", () => {
    it("completes the task after the row has slid away", () => {
      const props = renderCard();
      const card = screen.getByTestId("task-card");

      swipe(card, PAST_THRESHOLD);
      expect(props.onToggleDone).not.toHaveBeenCalled();

      act(() => vi.advanceTimersByTime(SLIDE_OFF_DURATION + 50));
      expect(props.onToggleDone).toHaveBeenCalledWith("done");
    });

    it("names the action while the finger is still down", () => {
      renderCard();
      const card = screen.getByTestId("task-card");

      touchStart(card);
      touchMove(card, 160 + 40, 100);

      // The label appears well before the commit threshold, so the gesture
      // teaches itself on the first hesitant swipe.
      expect(panel()?.getAttribute("data-action")).toBe("done");
      expect(panel()?.textContent).toContain("Erledigt");
    });

    it("snaps back without completing below the threshold", () => {
      const props = renderCard();
      const card = screen.getByTestId("task-card");

      swipe(card, 40);
      act(() => vi.advanceTimersByTime(SLIDE_OFF_DURATION + 50));

      expect(props.onToggleDone).not.toHaveBeenCalled();
      expect(panel()).toBeNull();
    });

    it("never offers to complete a task that is already done", () => {
      const props = renderCard({ task: makeTask({ status: "done" }) });
      const card = screen.getByTestId("task-card");

      touchStart(card);
      touchMove(card, 160 + PAST_THRESHOLD, 100);

      expect(panel()).toBeNull();
      fireEvent.touchEnd(card);
      act(() => vi.advanceTimersByTime(SLIDE_OFF_DURATION + 50));
      expect(props.onToggleDone).not.toHaveBeenCalled();
    });

    it("commits immediately when reduced motion is preferred", () => {
      vi.stubGlobal(
        "matchMedia",
        vi.fn().mockReturnValue({
          matches: true,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
      );
      const props = renderCard();

      swipe(screen.getByTestId("task-card"), PAST_THRESHOLD);
      expect(props.onToggleDone).toHaveBeenCalledWith("done");
    });
  });

  describe("swipe left — verschieben", () => {
    it("opens the schedule sheet instead of changing anything itself", () => {
      const props = renderCard();

      swipe(screen.getByTestId("task-card"), -PAST_THRESHOLD);

      expect(props.onSchedule).toHaveBeenCalledTimes(1);
      // Nothing destructive, and nothing silently rescheduled.
      expect(props.onDismiss).not.toHaveBeenCalled();
      expect(props.onToggleDone).not.toHaveBeenCalled();
    });

    it("names the action while the finger is still down", () => {
      renderCard();
      const card = screen.getByTestId("task-card");

      touchStart(card);
      touchMove(card, 160 - 40, 100);

      expect(panel()?.getAttribute("data-action")).toBe("schedule");
      expect(panel()?.textContent).toContain("Verschieben");
    });

    it("never moves left when there is nothing to open", () => {
      const props = renderCard({ onSchedule: undefined });
      const card = screen.getByTestId("task-card");

      touchStart(card);
      touchMove(card, 160 - PAST_THRESHOLD, 100);

      // A gesture that cannot deliver must not look like it could.
      expect(panel()).toBeNull();
      fireEvent.touchEnd(card);
      expect(props.onToggleDone).not.toHaveBeenCalled();
    });

    it("does not dismiss the task — that stays behind a confirmation", () => {
      const props = renderCard();
      swipe(screen.getByTestId("task-card"), -PAST_THRESHOLD);
      act(() => vi.advanceTimersByTime(SLIDE_OFF_DURATION + 50));
      expect(props.onDismiss).not.toHaveBeenCalled();
    });
  });

  describe("tapping is left to the controls inside the row", () => {
    it("never synthesises a click of its own", () => {
      // The old version fired onClick from touchend, which stole every tap
      // from the checkbox and the row menu.
      const props = renderCard();
      const card = screen.getByTestId("task-card");

      touchStart(card);
      fireEvent.touchEnd(card);

      expect(props.onClick).not.toHaveBeenCalled();
    });

    it("lets a real tap on the checkbox tick the task off, and nothing else", () => {
      const props = renderCard();
      const checkbox = screen.getByTestId("task-checkbox");

      touchStart(checkbox);
      fireEvent.touchEnd(checkbox);
      fireEvent.click(checkbox);

      expect(props.onToggleDone).toHaveBeenCalledWith("done");
      expect(props.onClick).not.toHaveBeenCalled();
    });

    it("lets a real tap on the row body open the task", () => {
      const props = renderCard();
      const body = screen.getByRole("button", {
        name: /Aufgabe öffnen/,
      });

      touchStart(body);
      fireEvent.touchEnd(body);
      fireEvent.click(body);

      expect(props.onClick).toHaveBeenCalledTimes(1);
    });

    it("swallows the click a browser may synthesise after a swipe", () => {
      const props = renderCard();
      const card = screen.getByTestId("task-card");
      const body = screen.getByRole("button", { name: /Aufgabe öffnen/ });

      swipe(card, -PAST_THRESHOLD);
      fireEvent.click(body);

      // The swipe opened the schedule sheet; it must not also open the
      // detail sheet behind it.
      expect(props.onSchedule).toHaveBeenCalledTimes(1);
      expect(props.onClick).not.toHaveBeenCalled();
    });
  });

  describe("scrolling wins over swiping", () => {
    it("lets go of the row as soon as the gesture leans vertical", () => {
      const props = renderCard();
      const card = screen.getByTestId("task-card");

      touchStart(card);
      touchMove(card, 166, 140); // mostly down
      touchMove(card, 160 + PAST_THRESHOLD, 240); // sideways afterwards
      fireEvent.touchEnd(card);
      act(() => vi.advanceTimersByTime(SLIDE_OFF_DURATION + 50));

      // The axis was decided on the first move and never reconsidered.
      expect(panel()).toBeNull();
      expect(props.onToggleDone).not.toHaveBeenCalled();
      expect(props.onSchedule).not.toHaveBeenCalled();
    });

    it("keeps a horizontal gesture even if the finger drifts down later", () => {
      const props = renderCard();
      const card = screen.getByTestId("task-card");

      touchStart(card);
      touchMove(card, 160 + 20, 104); // clearly horizontal
      touchMove(card, 160 + PAST_THRESHOLD, 170); // drifts down
      fireEvent.touchEnd(card);
      act(() => vi.advanceTimersByTime(SLIDE_OFF_DURATION + 50));

      expect(props.onToggleDone).toHaveBeenCalledWith("done");
    });
  });
});
