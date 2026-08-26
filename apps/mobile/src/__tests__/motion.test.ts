import { durations, pressScale, staggerDelay } from "../theme/motion";

// The animation builders themselves are not exercised here — only the
// pure tokens — so Reanimated's native runtime is stubbed out.
jest.mock("react-native-reanimated", () => ({}));

/**
 * Motion tokens are the guardrails of DESIGN.md's animation rules
 * (150–250ms state transitions, capped staggers). These tests pin the
 * contract without touching the Reanimated runtime.
 */
describe("motion tokens", () => {
  it("keeps state transitions inside the 150–250ms band", () => {
    expect(durations.fast).toBeGreaterThanOrEqual(150);
    expect(durations.base).toBeLessThanOrEqual(250);
    expect(durations.fast).toBeLessThan(durations.base);
    expect(durations.base).toBeLessThan(durations.slow);
  });

  it("presses scale down only slightly (no cartoon squash)", () => {
    expect(pressScale).toBeGreaterThan(0.95);
    expect(pressScale).toBeLessThan(1);
  });

  it("stagger grows linearly and caps so long lists never lag", () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(3)).toBe(120);
    expect(staggerDelay(8)).toBe(staggerDelay(100));
  });

  it("honours a custom step for denser groups", () => {
    expect(staggerDelay(2, 60)).toBe(120);
    expect(staggerDelay(50, 60)).toBe(8 * 60);
  });
});
