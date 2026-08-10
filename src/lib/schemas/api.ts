/**
 * Shared API response envelopes.
 *
 * Every API route returns errors in the same shape: a German, user-facing
 * `error` message plus a machine-readable `code`. Route-specific response
 * types (UploadErrorResponse, ChatErrorResponse, …) are aliases of this
 * single source of truth.
 */
export interface ApiErrorResponse {
  error: string;
  code: string;
}
