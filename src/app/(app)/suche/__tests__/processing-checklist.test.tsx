import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { act } from "react";

import { ProcessingChecklist } from "@/app/(app)/suche/processing-checklist";

describe("ProcessingChecklist", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders four steps", () => {
    render(<ProcessingChecklist />);
    expect(screen.getAllByTestId("processing-step")).toHaveLength(4);
  });

  it("starts with only the first step active and the rest pending", () => {
    render(<ProcessingChecklist />);
    const steps = screen.getAllByTestId("processing-step");
    expect(steps[0].getAttribute("data-status")).toBe("active");
    expect(steps[1].getAttribute("data-status")).toBe("pending");
    expect(steps[2].getAttribute("data-status")).toBe("pending");
    expect(steps[3].getAttribute("data-status")).toBe("pending");
  });

  it("advances to the next step over time, marking earlier steps done", () => {
    render(<ProcessingChecklist />);

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    const steps = screen.getAllByTestId("processing-step");
    expect(steps[0].getAttribute("data-status")).toBe("done");
    expect(steps[1].getAttribute("data-status")).toBe("active");
  });

  it("stops advancing once the last step is reached", () => {
    render(<ProcessingChecklist />);

    // Advance in separate act() blocks so useEffect re-runs and
    // creates the next setTimeout between advances
    for (let i = 0; i < 4; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }

    const steps = screen.getAllByTestId("processing-step");
    expect(steps[0].getAttribute("data-status")).toBe("done");
    expect(steps[1].getAttribute("data-status")).toBe("done");
    expect(steps[2].getAttribute("data-status")).toBe("done");
    expect(steps[3].getAttribute("data-status")).toBe("active");
  });

  it("has an accessible status role for screen readers", () => {
    render(<ProcessingChecklist />);
    expect(screen.getByRole("status")).toBeDefined();
  });
});
