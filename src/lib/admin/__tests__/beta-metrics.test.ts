import { describe, expect, it } from "vitest";
import { summarizeBetaEvents } from "../beta-metrics";

describe("beta cohorts", () => {
  it("counts people once and excludes completions before entry", () => {
    const event = (user_id: string, event_name: string, occurred_at = "2026-09-02T10:00:00Z") => ({ user_id, event_name, occurred_at });
    const result = summarizeBetaEvents([
      event("a", "onboarding_started"), event("a", "onboarding_started"),
      event("a", "onboarding_completed", "2026-09-03T10:00:00Z"),
      event("b", "onboarding_completed", "2026-09-01T10:00:00Z"), event("b", "onboarding_started"),
      event("a", "search_completed"), event("a", "search_completed"), event("b", "onboarding_step_completed"),
    ], "2026-09-01T00:00:00Z");
    expect(result.started).toBe(2);
    expect(result.completed).toBe(1);
    expect(result.completionRate).toBe(0.5);
    expect(result.daily).toEqual([{ day: "2026-09-02", users: 1 }]);
    expect(result.searches).toBe(2);
  });
  it("does not report an empty cohort as a zero percent conversion", () => {
    expect(summarizeBetaEvents([], "2026-09-01").completionRate).toBeNull();
  });
});
