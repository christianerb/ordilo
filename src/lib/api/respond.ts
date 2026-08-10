import type { ApiErrorResponse } from "@/lib/schemas/api";

/**
 * Shared response helpers for API route handlers.
 *
 * Every route returns errors as `{ error, code }` JSON (see
 * src/lib/schemas/api.ts). These helpers replace the previously
 * copy-pasted `Response.json({ error, code }, { status })` blocks.
 */

/**
 * Build a structured JSON error response.
 *
 * @param error - German, user-facing message (never a raw Error.message).
 * @param code - Machine-readable error code (SCREAMING_SNAKE_CASE).
 * @param status - HTTP status code.
 */
export function jsonError(
  error: string,
  code: string,
  status: number,
): Response {
  const body: ApiErrorResponse = { error, code };
  return Response.json(body, { status });
}

/** Default German message for 405 responses (POST-only routes). */
export const METHOD_NOT_ALLOWED_MESSAGE =
  "Methode nicht erlaubt. Bitte POST verwenden.";

/**
 * Standard 405 response for the GET handler of POST-only routes.
 *
 * @param message - Override when a route historically used a shorter
 *                  variant (e.g. "Methode nicht erlaubt.").
 */
export function methodNotAllowed(
  message: string = METHOD_NOT_ALLOWED_MESSAGE,
): Response {
  return jsonError(message, "METHOD_NOT_ALLOWED", 405);
}
