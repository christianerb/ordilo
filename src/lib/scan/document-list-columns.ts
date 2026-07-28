/**
 * Every documents column EXCEPT `ocr_text`. The list/detail polling runs
 * every 1.5s while anything is processing, and `ocr_text` is by far the
 * heaviest column (full document markdown, often tens of KB per row) —
 * pulling it for every document on every poll saturates mobile
 * connections. No client component renders `ocr_text`; the one consumer
 * (failed-stage retry routing) fetches it on demand in `handleRetryFailed`.
 *
 * Shared between the ScanProvider's client-side list fetches and the
 * Dokumente page's server-side initial load so both return the same shape.
 */
export const DOCUMENT_LIST_COLUMNS =
  "id, family_id, uploaded_by, title, document_type, category, status, " +
  "file_url, original_filename, mime_type, page_count, summary, " +
  "error_message, failure_stage, failure_code, failed_at, created_at, " +
  "confirmed_at, tags, source, extraction_version";
