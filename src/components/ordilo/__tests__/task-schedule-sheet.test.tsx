import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { TaskScheduleSheet } from "@/components/ordilo/task-schedule-sheet";
import { resolveSchedulePreset, todayLocalDate } from "@/lib/task-utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TODAY = todayLocalDate();

/** A date `days` from today, ISO and in the German form the field shows. */
function futureDate(days: number): { iso: string; typed: string } {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const iso = date.toLocaleDateString("sv-SE");
  const [year, month, day] = iso.split("-");
  return { iso, typed: `${day}.${month}.${year}` };
}

const FUTURE = futureDate(45);

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

  it("does not commit while a date is still being typed", () => {
    const props = renderSheet();
    const input = screen.getByTestId("task-schedule-custom");

    // DateInput reports every parseable keystroke, so committing there
    // would snap the sheet shut mid-edit.
    fireEvent.change(input, { target: { value: "24.1" } });
    fireEvent.change(input, { target: { value: FUTURE.typed } });

    expect(props.onSelect).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it("commits a typed date when it is deliberately applied", () => {
    const props = renderSheet();

    fireEvent.change(screen.getByTestId("task-schedule-custom"), {
      target: { value: FUTURE.typed },
    });
    fireEvent.click(screen.getByTestId("task-schedule-apply"));

    expect(props.onSelect).toHaveBeenCalledWith(FUTURE.iso);
  });

  it("refuses a typed date in the past and stays open", () => {
    const props = renderSheet();

    fireEvent.change(screen.getByTestId("task-schedule-custom"), {
      target: { value: "01.01.2000" },
    });

    // `minDate` only disables calendar days — the typed path needs its own
    // check, or rescheduling could move a task into the past while the
    // create and detail forms both refuse to.
    expect(screen.getByTestId("task-schedule-error").textContent).toContain(
      "heute oder einen späteren Tag",
    );
    expect(screen.queryByTestId("task-schedule-apply")).toBeNull();
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it("clears the error once a usable date is typed", () => {
    renderSheet();
    const input = screen.getByTestId("task-schedule-custom");

    fireEvent.change(input, { target: { value: "01.01.2000" } });
    expect(screen.getByTestId("task-schedule-error")).toBeDefined();

    fireEvent.change(input, { target: { value: FUTURE.typed } });
    expect(screen.queryByTestId("task-schedule-error")).toBeNull();
    expect(screen.getByTestId("task-schedule-apply")).toBeDefined();
  });

  it("commits straight away when a day is picked in the calendar", () => {
    const props = renderSheet();

    fireEvent.click(screen.getByLabelText("Kalender öffnen"));
    // Days before today are disabled, so the last enabled cell is always a
    // usable one — a fixed index would be in the past for most of a month.
    const selectable = screen
      .getAllByTestId("date-input-day")
      .filter((day) => !(day as HTMLButtonElement).disabled);
    expect(selectable.length).toBeGreaterThan(0);
    fireEvent.click(selectable[selectable.length - 1]);

    // A tapped day is a finished decision, and past days are disabled
    // there — so it behaves like the presets above it.
    expect(props.onSelect).toHaveBeenCalledTimes(1);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not carry one task's typed date over to the next", () => {
    const props = renderSheet();

    fireEvent.change(screen.getByTestId("task-schedule-custom"), {
      target: { value: FUTURE.typed },
    });
    fireEvent.click(screen.getByTestId("task-schedule-apply"));

    // Closing runs through the resetting handler; the sheet stays mounted
    // between tasks, so a leftover date would greet the next one as its own.
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(
      (screen.getByTestId("task-schedule-custom") as HTMLInputElement).value,
    ).toBe("");
  });

  it("resets a typed date when the sheet is dismissed unused", () => {
    renderSheet();

    fireEvent.change(screen.getByTestId("task-schedule-custom"), {
      target: { value: FUTURE.typed },
    });
    fireEvent.keyDown(screen.getByTestId("task-schedule-sheet"), {
      key: "Escape",
    });

    expect(
      (screen.getByTestId("task-schedule-custom") as HTMLInputElement).value,
    ).toBe("");
  });
});
