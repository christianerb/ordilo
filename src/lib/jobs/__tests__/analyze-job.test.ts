import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

vi.mock("@/lib/pipeline/analyze-step", () => ({
  performAnalyzeStep: vi.fn(),
}));

import { runPendingJobs } from "@/lib/jobs";
import { performAnalyzeStep } from "@/lib/pipeline/analyze-step";

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
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as Client;

  return { client, documentUpdates };
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

  it("still marks a non-confirmed document failed", async () => {
    // A scanned document that has never been reviewed genuinely failed —
    // it must keep showing the error so the user can retry it.
    vi.mocked(performAnalyzeStep).mockRejectedValue(new Error("OpenAI down"));
    const { client, documentUpdates } = mockWorkerClient("ocr_done");

    const summary = await runPendingJobs(client, 1);

    expect(summary.failed).toBe(1);
    expect(documentUpdates.at(-1)).toMatchObject({ status: "failed" });
  });
});
