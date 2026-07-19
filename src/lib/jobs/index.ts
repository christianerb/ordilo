import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { performOcrStep } from "@/lib/pipeline/ocr-step";
import { performAnalyzeStep } from "@/lib/pipeline/analyze-step";
import { buildDocumentEmbeddings } from "@/lib/pipeline/embed-step";
import { PIPELINE_VERSION } from "@/lib/ai/models";
import {
  OCR_ALLOWED_SOURCE_STATUSES,
  ANALYZE_ALLOWED_SOURCE_STATUSES,
} from "@/lib/schemas/document";
import {
  CLEAR_DOCUMENT_FAILURE,
  getErrorCode,
  reportPipelineFailure,
  type PipelineFailureStage,
} from "@/lib/pipeline/failure-tracking";

/**
 * Background job queue for the document pipeline.
 *
 * Jobs live in `processing_jobs` (migration 0025). Workers claim due jobs
 * atomically via the `claim_processing_jobs` RPC (FOR UPDATE SKIP LOCKED),
 * so any number of concurrent worker invocations is safe.
 *
 * Job types:
 *   - 'ocr'     — Datalab OCR for an uploaded document; enqueues 'analyze'
 *                 on success.
 *   - 'analyze' — LLM extraction; leaves the document in 'analyzed' for the
 *                 user's review (confirm stays a user action).
 *   - 'reindex' — re-embed a confirmed document with the current
 *                 PIPELINE_VERSION (transactional replacement via the
 *                 `replace_document_embeddings` RPC).
 *
 * Retry policy: failed jobs go back to 'pending' with exponential backoff
 * (30s · 2^attempts) until max_attempts, then 'dead' (and the document is
 * marked 'failed' so the user can retry manually).
 *
 * The worker runs with the service-role client (bypasses RLS) — it is only
 * ever invoked from `/api/jobs/run`, which requires JOBS_RUNNER_SECRET.
 */

type Client = SupabaseClient<Database>;
type JobRow = Database["public"]["Tables"]["processing_jobs"]["Row"];

export type JobType = "ocr" | "analyze" | "reindex";

/** Base backoff delay in seconds (doubled per attempt). */
const RETRY_BASE_DELAY_SECONDS = 30;

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

export interface EnqueueJobParams {
  family_id: string;
  document_id: string;
  job_type: JobType;
  payload?: Record<string, unknown>;
  /** Delay before the job becomes due (seconds). Default: immediately. */
  delaySeconds?: number;
}

/**
 * Enqueue a processing job (idempotent).
 *
 * A partial unique index allows at most one pending/running job per
 * (document, job_type); a duplicate enqueue is treated as success.
 *
 * @param adminClient - Service-role client (authenticated users cannot
 *                      write to processing_jobs).
 * @returns true when a job is pending after the call (inserted or already
 *          present), false on unexpected DB error.
 */
export async function enqueueJob(
  adminClient: Client,
  params: EnqueueJobParams,
): Promise<boolean> {
  const runAfter = params.delaySeconds
    ? new Date(Date.now() + params.delaySeconds * 1000).toISOString()
    : undefined;

  const { error } = await adminClient.from("processing_jobs").insert({
    family_id: params.family_id,
    document_id: params.document_id,
    job_type: params.job_type,
    payload: params.payload ?? {},
    ...(runAfter ? { run_after: runAfter } : {}),
  });

  if (!error) return true;
  // 23505 = unique_violation → an active job for this (document, type)
  // already exists; the work will happen, so this enqueue succeeded.
  if (error.code === "23505") return true;

  reportPipelineFailure(error, {
    stage: getJobFailureStage(params.job_type),
    code: getErrorCode(error, "JOB_ENQUEUE_FAILED"),
    documentId: params.document_id,
    familyId: params.family_id,
    source: "job",
    jobType: params.job_type,
  });
  return false;
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export interface RunJobsSummary {
  claimed: number;
  succeeded: number;
  failed: number;
  results: Array<{
    job_id: string;
    job_type: string;
    document_id: string | null;
    outcome: "done" | "retry" | "dead" | "skipped";
    error?: string;
  }>;
}

/**
 * Claim and process up to `limit` due jobs.
 *
 * Called from `POST /api/jobs/run` (scheduled via Vercel Cron / pg_cron /
 * any external scheduler). Safe to invoke concurrently.
 */
export async function runPendingJobs(
  adminClient: Client,
  limit = 5,
): Promise<RunJobsSummary> {
  const { data: jobs, error } = await adminClient.rpc("claim_processing_jobs", {
    p_limit: limit,
  });

  if (error) {
    throw new Error(`Jobs konnten nicht geladen werden: ${error.message}`);
  }

  const summary: RunJobsSummary = {
    claimed: (jobs ?? []).length,
    succeeded: 0,
    failed: 0,
    results: [],
  };

  for (const job of jobs ?? []) {
    try {
      const outcome = await executeJob(adminClient, job);
      await markJobDone(adminClient, job.id);
      summary.succeeded += 1;
      summary.results.push({
        job_id: job.id,
        job_type: job.job_type,
        document_id: job.document_id,
        outcome,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unbekannter Fehler.";
      const code = getErrorCode(
        err,
        `${job.job_type.toUpperCase()}_JOB_FAILED`,
      );
      reportPipelineFailure(err, {
        stage: getJobFailureStage(job.job_type),
        code,
        documentId: job.document_id ?? "unknown",
        familyId: job.family_id,
        source: "job",
        jobId: job.id,
        jobType: job.job_type,
        attempt: job.attempts,
      });
      const outcome = await markJobFailed(adminClient, job, message);
      summary.failed += 1;
      summary.results.push({
        job_id: job.id,
        job_type: job.job_type,
        document_id: job.document_id,
        outcome,
        error: message,
      });
    }
  }

  return summary;
}

/**
 * Execute a single claimed job. Throws on failure (caller handles retry).
 *
 * Status transitions use conditional updates, so a job racing with the
 * client-orchestrated pipeline (a user watching the scan wizard) is safe:
 * whoever transitions first does the work, the other becomes a no-op skip.
 */
async function executeJob(
  adminClient: Client,
  job: JobRow,
): Promise<"done" | "skipped"> {
  if (!job.document_id) {
    throw new Error("Job hat keine document_id.");
  }

  switch (job.job_type) {
    case "ocr":
      return executeOcrJob(adminClient, job.document_id, job.family_id);
    case "analyze":
      return executeAnalyzeJob(adminClient, job.document_id);
    case "reindex":
      return executeReindexJob(adminClient, job.document_id, job.family_id);
    default:
      throw new Error(`Unbekannter Job-Typ: ${job.job_type}`);
  }
}

function getJobFailureStage(jobType: string): PipelineFailureStage {
  if (jobType === "ocr") return "ocr";
  if (jobType === "analyze") return "analysis";
  return "embedding";
}

async function executeOcrJob(
  adminClient: Client,
  documentId: string,
  familyId: string,
): Promise<"done" | "skipped"> {
  // Atomic conditional transition (same guard as the OCR route).
  const { data: document, error } = await adminClient
    .from("documents")
    .update({ status: "ocr_processing", ...CLEAR_DOCUMENT_FAILURE })
    .eq("id", documentId)
    .in("status", [...OCR_ALLOWED_SOURCE_STATUSES])
    .select()
    .maybeSingle();

  if (error) throw new Error("Status konnte nicht aktualisiert werden.");
  if (!document) {
    // Already processed (or being processed) by another worker/the route.
    return "skipped";
  }

  try {
    await performOcrStep(adminClient, adminClient, document);
  } catch (err) {
    await markDocumentFailedAdmin(adminClient, documentId, err, {
      stage: "ocr",
      code: getErrorCode(err, "OCR_FAILED"),
      familyId,
    });
    throw err;
  }

  // Chain: OCR done → analyze.
  await enqueueJob(adminClient, {
    family_id: familyId,
    document_id: documentId,
    job_type: "analyze",
  });

  return "done";
}

async function executeAnalyzeJob(
  adminClient: Client,
  documentId: string,
): Promise<"done" | "skipped"> {
  const { data: document, error: readError } = await adminClient
    .from("documents")
    .select("id, family_id, status, ocr_text")
    .eq("id", documentId)
    .maybeSingle();

  if (readError || !document) {
    throw new Error("Dokument konnte nicht geladen werden.");
  }

  if (!ANALYZE_ALLOWED_SOURCE_STATUSES.has(document.status)) {
    return "skipped";
  }

  const wasConfirmed = document.status === "confirmed";

  const { data: transitioned, error: transitionError } = await adminClient
    .from("documents")
    .update({ status: "analyzing", ...CLEAR_DOCUMENT_FAILURE })
    .eq("id", documentId)
    .in("status", [...ANALYZE_ALLOWED_SOURCE_STATUSES])
    .select("id")
    .maybeSingle();

  if (transitionError) {
    throw new Error("Status konnte nicht aktualisiert werden.");
  }
  if (!transitioned) return "skipped";

  try {
    await performAnalyzeStep(adminClient, {
      id: documentId,
      family_id: document.family_id,
      ocr_text: document.ocr_text,
      wasConfirmed,
    });
  } catch (err) {
    await markDocumentFailedAdmin(adminClient, documentId, err, {
      stage: "analysis",
      code: getErrorCode(err, "ANALYSIS_FAILED"),
      familyId: document.family_id,
    });
    throw err;
  }

  return "done";
}

async function executeReindexJob(
  adminClient: Client,
  documentId: string,
  familyId: string,
): Promise<"done" | "skipped"> {
  // Only confirmed documents are searchable — nothing to reindex otherwise.
  const { data: document, error: readError } = await adminClient
    .from("documents")
    .select("id, status")
    .eq("id", documentId)
    .maybeSingle();

  if (readError || !document) {
    throw new Error("Dokument konnte nicht geladen werden.");
  }
  if (document.status !== "confirmed") return "skipped";

  // Generate embeddings OUTSIDE the DB transaction, then replace
  // transactionally so the document never loses its embeddings mid-reindex.
  const embeddings = await buildDocumentEmbeddings(adminClient, documentId);

  const { error: rpcError } = await adminClient.rpc(
    "replace_document_embeddings",
    {
      p_document_id: documentId,
      p_family_id: familyId,
      p_embeddings: embeddings,
      p_pipeline_version: PIPELINE_VERSION,
    },
  );

  if (rpcError) {
    throw new Error(`Embeddings konnten nicht ersetzt werden: ${rpcError.message}`);
  }

  return "done";
}

// ---------------------------------------------------------------------------
// Job state helpers
// ---------------------------------------------------------------------------

async function markJobDone(adminClient: Client, jobId: string): Promise<void> {
  await adminClient
    .from("processing_jobs")
    .update({
      status: "done",
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", jobId);
}

/**
 * Mark a job failed: back to 'pending' with exponential backoff while
 * attempts remain, otherwise 'dead'.
 */
async function markJobFailed(
  adminClient: Client,
  job: JobRow,
  message: string,
): Promise<"retry" | "dead"> {
  const exhausted = job.attempts >= job.max_attempts;
  const delaySeconds = RETRY_BASE_DELAY_SECONDS * Math.pow(2, job.attempts);

  await adminClient
    .from("processing_jobs")
    .update(
      exhausted
        ? {
            status: "dead",
            last_error: message,
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        : {
            status: "pending",
            last_error: message,
            run_after: new Date(Date.now() + delaySeconds * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          },
    )
    .eq("id", job.id);

  return exhausted ? "dead" : "retry";
}

/** Best-effort: mark the document failed so the user can retry manually. */
async function markDocumentFailedAdmin(
  adminClient: Client,
  documentId: string,
  err: unknown,
  context: {
    stage: PipelineFailureStage;
    code: string;
    familyId: string;
  },
): Promise<void> {
  const message =
    err instanceof Error ? err.message : "Verarbeitung fehlgeschlagen.";
  const { error } = await adminClient
    .from("documents")
    .update({
      status: "failed",
      error_message: message,
      failure_stage: context.stage,
      failure_code: context.code,
      failed_at: new Date().toISOString(),
    })
    .eq("id", documentId);
  if (error) {
    reportPipelineFailure(error, {
      stage: context.stage,
      code: "FAILURE_PERSIST_FAILED",
      documentId,
      familyId: context.familyId,
      source: "job",
    });
  }
}
