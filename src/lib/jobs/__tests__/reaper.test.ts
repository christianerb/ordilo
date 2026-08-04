import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { reapStaleProcessingJobs, runPendingJobs } from "@/lib/jobs";

/**
 * Stuck-job reaper coverage.
 *
 * Regression: a worker that crashed after claiming left its job in
 * 'running' forever. claim_processing_jobs only picks 'pending', and the
 * processing_jobs_active_unique_idx blocked re-enqueue — the document was
 * stranded in processing permanently. Migration 0041 adds
 * reap_stale_processing_jobs and runPendingJobs invokes it before claiming.
 *
 * Part 1 asserts the migration file itself (function shape, idempotency,
 * and the revoke/grant posture). Part 2 unit-tests the TS wiring with a
 * mocked Supabase client.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const MIGRATION_NAME = "0041_reap_stale_processing_jobs.sql";

function readMigration(name: string): string {
  const path = join(MIGRATIONS_DIR, name);
  expect(existsSync(path), `${name} is missing`).toBe(true);
  return readFileSync(path, "utf-8");
}

describe("migration 0041: reap_stale_processing_jobs", () => {
  it("does not renumber over existing migrations", () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) =>
      f.endsWith(".sql"),
    );
    expect(files.filter((f) => f.startsWith("0041_"))).toEqual([
      MIGRATION_NAME,
    ]);
  });

  const sql = () => readMigration(MIGRATION_NAME);

  it("creates the function idempotently", () => {
    expect(sql()).toMatch(
      /create\s+or\s+replace\s+function\s+public\.reap_stale_processing_jobs\s*\(\s*p_stale_interval\s+interval\s+default/i,
    );
  });

  it("resets retryable stuck jobs to pending without touching attempts", () => {
    const content = sql();
    expect(content).toMatch(/j\.status\s*=\s*'running'/);
    expect(content).toMatch(/status\s*=\s*'pending'/);
    expect(content).toMatch(/j\.attempts\s*<\s*j\.max_attempts/);
    // Attempts must not be incremented here — claiming already did that.
    expect(content).not.toMatch(/attempts\s*=\s*(j\.)?attempts\s*\+/);
  });

  it("marks exhausted stuck jobs dead (mirrors markJobFailed)", () => {
    const content = sql();
    expect(content).toMatch(/status\s*=\s*'dead'/);
    expect(content).toMatch(/j\.attempts\s*>=\s*j\.max_attempts/);
  });

  it("only touches jobs running longer than the stale interval", () => {
    expect(sql()).toMatch(
      /coalesce\(j\.started_at,\s*j\.updated_at\)\s*<\s*now\(\)\s*-\s*p_stale_interval/,
    );
  });

  it("revokes execute from public/anon/authenticated and grants service_role", () => {
    const content = sql();
    expect(content).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.reap_stale_processing_jobs\(interval\)\s+from\s+public/i,
    );
    expect(content).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.reap_stale_processing_jobs\(interval\)\s+from\s+anon,\s*authenticated/i,
    );
    expect(content).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.reap_stale_processing_jobs\(interval\)\s+to\s+service_role/i,
    );
    expect(content).not.toMatch(/grant\s+execute.*reap_stale.*to\s+anon/i);
    expect(content).not.toMatch(
      /grant\s+execute.*reap_stale.*to\s+authenticated/i,
    );
  });
});

// ---------------------------------------------------------------------------
// TS wiring
// ---------------------------------------------------------------------------

type Client = SupabaseClient<Database>;

function mockClient(
  rpc: ReturnType<typeof vi.fn>,
): Client {
  return { rpc } as unknown as Client;
}

describe("reapStaleProcessingJobs", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls the RPC with the default stale interval and returns counts", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ reaped_pending: 2, marked_dead: 1 }],
      error: null,
    });

    const summary = await reapStaleProcessingJobs(mockClient(rpc));

    expect(rpc).toHaveBeenCalledWith("reap_stale_processing_jobs", {
      p_stale_interval: "15 minutes",
    });
    expect(summary).toEqual({ reaped_pending: 2, marked_dead: 1 });
  });

  it("returns zero counts when nothing was reaped", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });

    const summary = await reapStaleProcessingJobs(mockClient(rpc));

    expect(summary).toEqual({ reaped_pending: 0, marked_dead: 0 });
  });

  it("swallows RPC errors (best-effort, never blocks the run)", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "boom" } });

    const summary = await reapStaleProcessingJobs(mockClient(rpc));

    expect(summary).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("runPendingJobs reaper wiring", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reaps stuck jobs before claiming due jobs", async () => {
    const calls: string[] = [];
    const rpc = vi.fn().mockImplementation((fn: string) => {
      calls.push(fn);
      if (fn === "reap_stale_processing_jobs") {
        return Promise.resolve({
          data: [{ reaped_pending: 0, marked_dead: 0 }],
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });

    const summary = await runPendingJobs(mockClient(rpc), 5);

    expect(calls).toEqual([
      "reap_stale_processing_jobs",
      "claim_processing_jobs",
    ]);
    expect(summary.claimed).toBe(0);
  });

  it("still claims jobs when the reaper RPC fails", async () => {
    const rpc = vi.fn().mockImplementation((fn: string) => {
      if (fn === "reap_stale_processing_jobs") {
        return Promise.resolve({
          data: null,
          error: { message: "function missing" },
        });
      }
      return Promise.resolve({ data: [], error: null });
    });

    const summary = await runPendingJobs(mockClient(rpc), 5);

    expect(rpc).toHaveBeenCalledWith("claim_processing_jobs", { p_limit: 5 });
    expect(summary.claimed).toBe(0);
  });
});
