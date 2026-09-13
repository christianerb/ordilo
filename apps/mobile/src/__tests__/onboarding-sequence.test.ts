import {
  nextOnboardingStep,
  ONBOARDING_STEPS,
} from "../lib/onboarding";

/**
 * Pins the onboarding step order: after the family exists, the members
 * step ("Wen gibt es noch in eurer Familie?") always comes before the
 * ready springboard, and no step jumps past it. Resuming and gating are
 * covered by the family tests (isOnboardingComplete) — this file pins the
 * forward sequence the screen walks with nextOnboardingStep.
 */

describe("ONBOARDING_STEPS", () => {
  it("walks family name, then members, then ready", () => {
    expect([...ONBOARDING_STEPS]).toEqual([
      "family-name",
      "add-member",
      "ready",
    ]);
  });
});

describe("nextOnboardingStep", () => {
  it("moves from family creation to the members step, never past it", () => {
    expect(nextOnboardingStep("family-name")).toBe("add-member");
    expect(nextOnboardingStep("add-member")).toBe("ready");
  });

  it("keeps the ready springboard terminal", () => {
    expect(nextOnboardingStep("ready")).toBe("ready");
  });
});
