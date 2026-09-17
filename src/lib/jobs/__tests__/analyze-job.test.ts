import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Partial mock: the real PipelineStepError / isDestructiveAnalysisFailure
// pair is what the worker branches on, so only the step itself is faked.
vi.mock("@/lib/pipeline/analyze-step", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/pipeline/analyze-step")>();
  return { ...actual, performAnalyzeStep: vi.fn() };
});

// The worker skips a job when the uploader has no recorded AI consent;
// tests in this file run with consent granted.
vi.mock("@/lib/ai/consent", () => ({
  hasAiDataSharingConsent: vi.fn(async () => true),
}));

import { runPendingJobs } from "@/lib/jobs";
import { hasAiDataSharingConsent } from "@/lib/ai/consent";
import {
  performAnalyzeStep,
  PipelineStepError,
} from "@/lib/pipeline/analyze-step";

type Client = SupabaseClient<Database>;

const DOC_ID = "550e8400-e29b-41d4-a716-446655440000";
const FAMILY_ID = "660e8400-e29b-41d4-a716-446655440001";

/**
 * A worker client with one claimable `analyze` job for a document in the
 * given status. Every `documents` update payload is recorded so the test
 * can assert which status the failed analysis left behind.
 */
function mockWorkerClient(docStatus: string) {
  const documentUpdates: Record<string, unknown>[] = [];
  const jobUpdates: Record<string, unknown>[] = [];

  const rpc = vi.fn().mockImplementation((fn: string) => {
    if (fn === "reap_stale_processing_jobs") {
      return Promise.resolve({
        data: [{ reaped_pending: 0, marked_dead: 0 }],
        error: null,
      });
    }
    if (fn === "claim_processing_jobs") {
      return Promise.resolve({
        data: [
          {
            id: "job-1",
            job_type: "analyze",
            document_id: DOC_ID,
            family_id: FAMILY_ID,
            attempts: 1,
            max_attempts: 3,
          },
        ],
        error: null,
      });
    }
    return Promise.resolve({ data: [], error: null });
  });

  const client = {
    rpc,
    from: vi.fn((table: string) => {
      if (table === "documents") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: DOC_ID,
                  family_id: FAMILY_ID,
                  status: docStatus,
                  ocr_text: "74 031 832 353",
                  category: null,
                  uploaded_by: "user-1",
                },
                error: null,
              }),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => {
            documentUpdates.push(payload);
            // Transition chain: .update().eq().in().select().maybeSingle()
            // Plain chain:      .update().eq() → thenable
            const result = { data: { id: DOC_ID }, error: null };
            const chain = {
              eq: vi.fn(() => chain),
              in: vi.fn(() => chain),
              select: vi.fn(() => chain),
              maybeSingle: vi.fn().mockResolvedValue(result),
              then: (resolve: (value: typeof result) => unknown) =>
                Promise.resolve(result).then(resolve),
            };
            return chain;
          }),
        };
      }
      if (table === "processing_jobs") {
        return {
          update: vi.fn((payload: Record<string, unknown>) => {
            jobUpdates.push(payload);
            return {
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as Client;

  return { client, documentUpdates, jobUpdates };
}

describe("analyze job failure handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rolls a confirmed document back to confirmed instead of failing it", async () => {
    // Every manual note is created as `confirmed` — analysis only enriches
    // it. A failing analysis used to leave the note showing "Hat nicht
    // geklappt" although the text the user typed was stored intact.
    vi.mocked(performAnalyzeStep).mockRejectedValue(new Error("OpenAI down"));
    const { client, documentUpdates } = mockWorkerClient("confirmed");

    const summary = await runPendingJobs(client, 1);

    // The job itself still fails, so the retry/backoff worker takes another
    // run at the enrichment.
    expect(summary.failed).toBe(1);
    // The document is never written as failed …
    expect(documentUpdates.some((u) => u.status === "failed")).toBe(false);
    // … it goes back to confirmed with the failure fields cleared.
    expect(documentUpdates.at(-1)).toMatchObject({
      status: "confirmed",
      error_message: null,
      failure_stage: null,
      failure_code: null,
      failed_at: null,
    });
  });

  it("marks a confirmed document failed when the failure was destructive", async () => {
    // Replacing the stored results is not transactional: a failure inside
    // it can leave the document without entities/tasks/facts it used to
    // have. Such a document must stay visibly failed and retryable.
    vi.mocked(performAnalyzeStep).mockRejectedValue(
      new PipelineStepError("Speichern fehlgeschlagen", "DB_STORE_FAILED", {
        destructive: true,
      }),
    );
    const { client, documentUpdates } = mockWorkerClient("confirmed");

    const summary = await runPendingJobs(client, 1);

    expect(summary.failed).toBe(1);
    expect(documentUpdates.at(-1)).toMatchObject({ status: "failed" });
  });

  it("still marks a non-confirmed document failed", async () => {
    // A scanned document that has never been reviewed genuinely failed —
    // it must keep showing the error so the user can retry it.
    vi.mocked(performAnalyzeStep).mockRejectedValue(new Error("OpenAI down"));
    const { client, documentUpdates } = mockWorkerClient("ocr_done");

    const summary = await runPendingJobs(client, 1);

    expect(summary.failed).toBe(1);
    expect(documentUpdates.at(-1)).toMatchObject({ status: "failed" });
  });

  it("defers the job when the uploader has no AI consent, keeping it retryable", async () => {
    // Apple 5.1.2(i): without the uploader's explicit consent no content
    // leaves for OpenAI — not even from the background worker. The job goes
    // back to pending (claim attempt refunded, next run pushed out) instead
    // of being completed: granting consent later lets the next worker run
    // pick it up, and the document is never stranded without an active job.
    vi.mocked(hasAiDataSharingConsent).mockResolvedValueOnce(false);
    const { client, documentUpdates, jobUpdates } = mockWorkerClient("ocr_done");

    const summary = await runPendingJobs(client, 1);

    expect(summary.failed).toBe(0);
    expect(summary.succeeded).toBe(0);
    expect(summary.deferred).toBe(1);
    expect(summary.results[0]?.outcome).toBe("deferred");
    expect(performAnalyzeStep).not.toHaveBeenCalled();
    expect(documentUpdates.some((u) => u.status === "analyzing")).toBe(false);
    // Back to pending — never done — with the claim attempt (1) refunded.
    expect(jobUpdates.some((u) => u.status === "done")).toBe(false);
    const deferred = jobUpdates.at(-1);
    expect(deferred).toMatchObject({
      status: "pending",
      attempts: 0,
      started_at: null,
    });
    expect(
      new Date(deferred?.run_after as string).getTime(),
    ).toBeGreaterThan(Date.now());
  });
});
