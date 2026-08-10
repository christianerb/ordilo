import { describe, it, expect } from "vitest";
import {
  jobsRunRequestSchema,
  reindexRequestSchema,
} from "@/lib/schemas/jobs";

describe("jobsRunRequestSchema", () => {
  it("accepts an empty body and a positive integer limit", () => {
    expect(jobsRunRequestSchema.safeParse({}).success).toBe(true);
    expect(jobsRunRequestSchema.safeParse({ limit: 5 }).success).toBe(true);
  });

  it("rejects non-integer or non-positive limits", () => {
    expect(jobsRunRequestSchema.safeParse({ limit: 1.5 }).success).toBe(false);
    expect(jobsRunRequestSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(jobsRunRequestSchema.safeParse({ limit: "5" }).success).toBe(false);
  });
});

describe("reindexRequestSchema", () => {
  it("accepts an empty body and a boolean force flag", () => {
    expect(reindexRequestSchema.safeParse({}).success).toBe(true);
    expect(reindexRequestSchema.safeParse({ force: true }).success).toBe(true);
    expect(reindexRequestSchema.safeParse({ force: "yes" }).success).toBe(
      false,
    );
  });
});
