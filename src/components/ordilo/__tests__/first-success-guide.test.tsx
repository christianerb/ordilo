import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FirstSuccessGuide } from "@/components/ordilo/first-success-guide";

describe("FirstSuccessGuide", () => {
  const setItem = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    setItem.mockReset();
    const values = new Map<string, string>();
    setItem.mockImplementation((key: string, value: string) => {
      values.set(key, value);
    });
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem,
      },
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 16),
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) =>
      window.clearTimeout(id),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("enters on the next frame", () => {
    render(<FirstSuccessGuide familyId="family-1" onScan={vi.fn()} />);
    const guide = screen.getByTestId("first-success-guide");

    expect(guide).toHaveAttribute("data-state", "entering");
    act(() => vi.advanceTimersByTime(16));
    expect(guide).toHaveAttribute("data-state", "visible");
  });

  it("persists dismissal only after the 150ms exit", () => {
    render(<FirstSuccessGuide familyId="family-1" onScan={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Hinweis schließen" }));

    expect(screen.getByTestId("first-success-guide")).toHaveAttribute(
      "data-state",
      "leaving",
    );
    expect(setItem).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(149));
    expect(screen.getByTestId("first-success-guide")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByTestId("first-success-guide")).toBeNull();
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it("ignores a repeated dismiss while leaving", () => {
    render(<FirstSuccessGuide familyId="family-1" onScan={vi.fn()} />);
    const close = screen.getByRole("button", { name: "Hinweis schließen" });

    fireEvent.click(close);
    fireEvent.click(close);
    act(() => vi.advanceTimersByTime(150));

    expect(setItem).toHaveBeenCalledTimes(1);
  });
});
