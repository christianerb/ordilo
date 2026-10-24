import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { recordDailyAppOpen } = vi.hoisted(() => ({
  recordDailyAppOpen: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/analytics/product-events", () => ({ recordDailyAppOpen }));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn(() => ({})) }));
const { midnight } = vi.hoisted(() => ({ midnight: { fail: false } }));
vi.mock("@/lib/berlin-date", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/berlin-date")>();
  return {
    ...actual,
    nextBerlinMidnight: (time: number) => {
      if (midnight.fail) throw new RangeError("Invalid time zone specified: Europe/Berlin");
      return actual.nextBerlinMidnight(time);
    },
  };
});
const { pathname } = vi.hoisted(() => ({ pathname: { current: "/home" } }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

import { DailyAppOpen, DailyAppOpenTracker } from "../daily-app-open";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("DailyAppOpen", () => {
  beforeEach(() => {
    recordDailyAppOpen.mockClear();
    recordDailyAppOpen.mockResolvedValue(true);
  });
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

  it("after Berlin midnight records on the first interaction, not by itself", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T21:59:00Z")); // 23:59 Berlin
    setVisibility("visible");
    const { unmount } = render(<DailyAppOpen familyId="family-1" />);
    recordDailyAppOpen.mockClear();

    act(() => vi.advanceTimersByTime(2 * 60 * 1000)); // past midnight
    expect(recordDailyAppOpen).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    expect(recordDailyAppOpen).toHaveBeenCalledTimes(1);
    // Only the first interaction after midnight records.
    act(() => {
      window.dispatchEvent(new Event("keydown"));
    });
    expect(recordDailyAppOpen).toHaveBeenCalledTimes(1);

    unmount();
    act(() => vi.advanceTimersByTime(48 * 60 * 60 * 1000));
    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
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

  it("records after onboarding even while the layout has no family id yet", () => {
    pathname.current = "/onboarding";
    const { rerender } = render(<DailyAppOpenTracker familyId={null} />);
    expect(recordDailyAppOpen).not.toHaveBeenCalled();

    // Soft navigation to /home: the layout still passes null.
    pathname.current = "/home";
    rerender(<DailyAppOpenTracker familyId={null} />);
    expect(recordDailyAppOpen).toHaveBeenCalledTimes(1);
    expect(recordDailyAppOpen).toHaveBeenLastCalledWith({}, { familyId: null });
  });

  it("does not count a tab that mounts in the background", () => {
    pathname.current = "/home";
    setVisibility("hidden");
    render(<DailyAppOpen familyId="family-1" />);
    expect(recordDailyAppOpen).not.toHaveBeenCalled();
    act(() => setVisibility("visible"));
    expect(recordDailyAppOpen).toHaveBeenCalledTimes(1);
  });

  it("keeps the page alive when the engine has no time zone data", () => {
    midnight.fail = true;
    try {
      pathname.current = "/home";
      setVisibility("visible");
      expect(() => render(<DailyAppOpen familyId="family-1" />)).not.toThrow();
      expect(recordDailyAppOpen).toHaveBeenCalledTimes(1);
    } finally {
      midnight.fail = false;
    }
  });

  it("waits for the next interaction when the first one could not record", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T21:59:00Z"));
    setVisibility("visible");
    render(<DailyAppOpen familyId="family-1" />);
    act(() => vi.advanceTimersByTime(2 * 60 * 1000));
    recordDailyAppOpen.mockClear();
    recordDailyAppOpen.mockResolvedValueOnce(false);

    await act(async () => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    expect(recordDailyAppOpen).toHaveBeenCalledTimes(1);
    await act(async () => {
      window.dispatchEvent(new Event("keydown"));
    });
    expect(recordDailyAppOpen).toHaveBeenCalledTimes(2);
  });
});
