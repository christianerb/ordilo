import { describe, expect, it } from "vitest";
import { summarizeBetaEvents, summarizeScanFailures } from "../beta-metrics";

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

describe("scan failure quality signal", () => {
  const event = (
    event_name: string,
    properties?: Record<string, unknown>,
  ) => ({
    user_id: "a",
    event_name,
    occurred_at: "2026-09-02T10:00:00Z",
    properties,
  });

  it("counts failed attempts with their stage and reason codes", () => {
    const result = summarizeScanFailures([
      event("document_upload_failed", { stage: "upload", reason: "network", source: "mobile_scan" }),
      event("document_upload_failed", { stage: "upload", reason: "server", source: "mobile_scan" }),
      event("document_upload_failed", { stage: "ocr", reason: "server", source: "mobile_scan" }),
      event("document_upload_succeeded", { source: "mobile_scan" }),
      event("document_upload_succeeded", { source: "mobile_scan" }),
    ]);

    expect(result.total).toBe(3);
    expect(result.uploadsSucceeded).toBe(2);
    expect(result.stages).toEqual([
      { stage: "upload", count: 2 },
      { stage: "ocr", count: 1 },
    ]);
    expect(result.reasons).toEqual([
      { reason: "server", count: 2 },
      { reason: "network", count: 1 },
    ]);
  });

  it("scopes the rate to the mobile scan client on both sides", () => {
    const result = summarizeScanFailures([
      event("document_upload_succeeded", { source: "mobile_scan" }),
      event("document_upload_succeeded", { source: "web" }),
      event("document_upload_succeeded"),
      event("document_upload_failed", { stage: "upload", reason: "network", source: "mobile_scan" }),
      event("document_upload_failed", { stage: "upload", reason: "server", source: "web" }),
    ]);

    expect(result.total).toBe(1);
    expect(result.uploadsSucceeded).toBe(1);
    expect(result.stages).toEqual([{ stage: "upload", count: 1 }]);
    expect(result.reasons).toEqual([{ reason: "network", count: 1 }]);
  });

  it("still counts legacy failures from before the source property", () => {
    const result = summarizeScanFailures([
      event("document_upload_failed", { stage: "upload", reason: "network" }),
    ]);

    expect(result.total).toBe(1);
  });

  it("labels events without properties as unknown instead of dropping them", () => {
    const result = summarizeScanFailures([event("document_upload_failed")]);

    expect(result.stages).toEqual([{ stage: "unbekannt", count: 1 }]);
    expect(result.reasons).toEqual([{ reason: "unbekannt", count: 1 }]);
  });

  it("reports zeroes when nothing failed", () => {
    expect(
      summarizeScanFailures([
        event("document_upload_succeeded", { source: "mobile_scan" }),
      ]),
    ).toEqual({
      total: 0,
      uploadsSucceeded: 1,
      stages: [],
      reasons: [],
    });
  });
});
