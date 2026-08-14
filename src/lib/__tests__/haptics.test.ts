import { afterEach, describe, expect, it, vi } from "vitest";

import { haptic } from "@/lib/haptics";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("haptic", () => {
  it("uses the browser vibration fallback when native haptics are unavailable", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });

    haptic("success");

    expect(vibrate).toHaveBeenCalledWith([10, 36, 14]);
  });

  it("uses a native notification when a Capacitor host exposes one", () => {
    const notification = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("window", {
      Capacitor: { Plugins: { Haptics: { notification } } },
    });

    haptic("warning");

    expect(notification).toHaveBeenCalledWith({ type: "WARNING" });
  });
});
