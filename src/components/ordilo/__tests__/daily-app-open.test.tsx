import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { recordDailyAppOpen } = vi.hoisted(() => ({
  recordDailyAppOpen: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/analytics/product-events", () => ({ recordDailyAppOpen }));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn(() => ({})) }));
const { pathname } = vi.hoisted(() => ({ pathname: { current: "/home" } }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

import { DailyAppOpen, DailyAppOpenTracker } from "../daily-app-open";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("DailyAppOpen", () => {
  beforeEach(() => recordDailyAppOpen.mockClear());
  afterEach(() => vi.useRealTimers());

  it("records on mount and again when the tab comes back", () => {
    const { unmount } = render(<DailyAppOpen familyId="family-1" />);
    expect(recordDailyAppOpen).toHaveBeenCalledTimes(1);
    expect(recordDailyAppOpen).toHaveBeenLastCalledWith({}, { familyId: "family-1" });

    act(() => setVisibility("hidden"));
    expect(recordDailyAppOpen).toHaveBeenCalledTimes(1);
    act(() => setVisibility("visible"));
    expect(recordDailyAppOpen).toHaveBeenCalledTimes(2);

    unmount();
    act(() => setVisibility("visible"));
    expect(recordDailyAppOpen).toHaveBeenCalledTimes(2);
  });

  it("records again at Berlin midnight while the tab stays visible", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T21:59:00Z")); // 23:59 Berlin
    setVisibility("visible");
    const { unmount } = render(<DailyAppOpen familyId="family-1" />);
    recordDailyAppOpen.mockClear();

    act(() => vi.advanceTimersByTime(30_000));
    expect(recordDailyAppOpen).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(60_000));
    expect(recordDailyAppOpen).toHaveBeenCalledTimes(1);

    unmount();
    act(() => vi.advanceTimersByTime(48 * 60 * 60 * 1000));
    expect(recordDailyAppOpen).toHaveBeenCalledTimes(1);
  });

  it("waits until setup is done before recording", () => {
    pathname.current = "/onboarding";
    const { rerender } = render(<DailyAppOpenTracker familyId="family-1" />);
    expect(recordDailyAppOpen).not.toHaveBeenCalled();

    // Finishing onboarding navigates on — the recorder mounts and records.
    pathname.current = "/home";
    rerender(<DailyAppOpenTracker familyId="family-1" />);
    expect(recordDailyAppOpen).toHaveBeenCalledTimes(1);
  });

  it("records nothing without a family", () => {
    pathname.current = "/home";
    render(<DailyAppOpenTracker familyId={null} />);
    expect(recordDailyAppOpen).not.toHaveBeenCalled();
  });

  it("does not count a tab that mounts in the background", () => {
    pathname.current = "/home";
    setVisibility("hidden");
    render(<DailyAppOpen familyId="family-1" />);
    expect(recordDailyAppOpen).not.toHaveBeenCalled();
    act(() => setVisibility("visible"));
    expect(recordDailyAppOpen).toHaveBeenCalledTimes(1);
  });
});
