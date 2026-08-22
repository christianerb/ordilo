import { describePushPermission } from "../lib/notifications";
import { staggerDelay, motion } from "../lib/motion";

// motion.ts imports only the ReduceMotion enum from reanimated — the
// native worklets runtime does not exist under jest. jest.mock calls are
// hoisted above the imports by babel-plugin-jest-hoist.
jest.mock("react-native-reanimated", () => ({
  ReduceMotion: { System: "system", Always: "always", Never: "never" },
}));

describe("describePushPermission", () => {
  it("is granted only when the OS says granted", () => {
    expect(
      describePushPermission({ granted: true, canAskAgain: false, status: "granted" }),
    ).toBe("granted");
  });

  it("can still ask when undetermined or askable again", () => {
    expect(
      describePushPermission({
        granted: false,
        canAskAgain: false,
        status: "undetermined",
      }),
    ).toBe("ask");
    expect(
      describePushPermission({
        granted: false,
        canAskAgain: true,
        status: "denied",
      }),
    ).toBe("ask");
  });

  it("is blocked when denied and iOS will not show the dialog again", () => {
    expect(
      describePushPermission({
        granted: false,
        canAskAgain: false,
        status: "denied",
      }),
    ).toBe("blocked");
  });
});

describe("staggerDelay", () => {
  it("grows linearly and caps out", () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(2)).toBe(140);
    expect(staggerDelay(100)).toBe(420);
  });
});

describe("motion tokens", () => {
  it("keeps every animation short and interruptible", () => {
    expect(motion.duration.slow).toBeLessThanOrEqual(400);
    for (const spring of Object.values(motion.spring)) {
      expect(spring.reduceMotion).toBeDefined();
    }
  });
});
