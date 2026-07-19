import * as Sentry from "@sentry/nextjs";

export type PipelineFailureStage =
  | "upload"
  | "ocr"
  | "analysis"
  | "confirmation"
  | "embedding";

export interface PipelineFailureContext {
  stage: PipelineFailureStage;
  code: string;
  documentId: string;
  familyId?: string | null;
  source: "api" | "job";
  jobId?: string;
  jobType?: string;
  attempt?: number;
}

export const CLEAR_DOCUMENT_FAILURE = {
  error_message: null,
  failure_stage: null,
  failure_code: null,
  failed_at: null,
} as const;

export function getErrorCode(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code
  ) {
    return error.code;
  }
  return fallback;
}

export function reportPipelineFailure(
  error: unknown,
  context: PipelineFailureContext,
): void {
  const message =
    error instanceof Error
      ? error.message
      : error &&
          typeof error === "object" &&
          "message" in error &&
          typeof error.message === "string"
        ? error.message
        : String(error);

  if (process.env.NODE_ENV !== "test") {
    console.error("[document-pipeline]", {
      event: "document_pipeline_failed",
      ...context,
      message,
    });
  }

  Sentry.withScope((scope) => {
    scope.setTag("pipeline.stage", context.stage);
    scope.setTag("pipeline.code", context.code);
    scope.setTag("pipeline.source", context.source);
    if (context.jobType) scope.setTag("pipeline.job_type", context.jobType);
    scope.setContext("document_pipeline", {
      document_id: context.documentId,
      family_id: context.familyId ?? undefined,
      job_id: context.jobId,
      attempt: context.attempt,
    });
    Sentry.captureException(
      error instanceof Error ? error : new Error(message),
    );
  });
}
