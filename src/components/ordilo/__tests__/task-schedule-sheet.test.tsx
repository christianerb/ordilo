import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { TaskScheduleSheet } from "@/components/ordilo/task-schedule-sheet";
import { resolveSchedulePreset, todayLocalDate } from "@/lib/task-utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TODAY = todayLocalDate();

function makeTask(overrides: Partial<{ due_date: string | null }> = {}) {
  return {
    id: "task-1",
    title: "Trikot waschen",
    due_date: null,
    ...overrides,
  };
}

function renderSheet(
  overrides: Partial<React.ComponentProps<typeof TaskScheduleSheet>> = {},
) {
  const props: React.ComponentProps<typeof TaskScheduleSheet> = {
    task: makeTask(),
    open: true,
    onOpenChange: vi.fn(),
    onSelect: vi.fn(),
    ...overrides,
  };
  render(<TaskScheduleSheet {...props} />);
  return props;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TaskScheduleSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks the question in plain German and names the task", () => {
    renderSheet();
    expect(screen.getByText("Wann ist das dran?")).toBeDefined();
    expect(screen.getByText("Trikot waschen")).toBeDefined();
  });

  it("commits the exact day a preset stands for", () => {
    const props = renderSheet();

    fireEvent.click(screen.getByTestId("task-schedule-tomorrow"));

    expect(props.onSelect).toHaveBeenCalledWith(
      resolveSchedulePreset("tomorrow", TODAY),
    );
  });

  it("spells out which day each preset means", () => {
    renderSheet();

    // "Wochenende" is only trustworthy if it says which Saturday.
    const weekend = screen.getByTestId("task-schedule-weekend");
    const saturday = resolveSchedulePreset("weekend", TODAY)!;
    const dayOfMonth = Number(saturday.split("-")[2]);
    expect(weekend.textContent).toContain(`${dayOfMonth}.`);
  });

  it("closes itself after a choice — there is no save step", () => {
    const props = renderSheet();

    fireEvent.click(screen.getByTestId("task-schedule-today"));

    expect(props.onSelect).toHaveBeenCalledWith(TODAY);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("marks the day the task already sits on", () => {
    renderSheet({ task: makeTask({ due_date: TODAY }) });

    expect(
      screen.getByTestId("task-schedule-today").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByTestId("task-schedule-tomorrow").getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("can take the date off entirely", () => {
    const props = renderSheet({ task: makeTask({ due_date: TODAY }) });

    fireEvent.click(screen.getByTestId("task-schedule-none"));

    expect(props.onSelect).toHaveBeenCalledWith(null);
  });

  it("accepts a typed date once it is complete", () => {
    const props = renderSheet();
    const input = screen.getByTestId("task-schedule-custom");

    // Partial input must not commit anything.
    fireEvent.change(input, { target: { value: "24.1" } });
    expect(props.onSelect).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "24.12.2026" } });
    expect(props.onSelect).toHaveBeenCalledWith("2026-12-24");
  });
});
