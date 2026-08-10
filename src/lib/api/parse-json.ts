import { z } from "zod";
import { jsonError } from "@/lib/api/respond";

/**
 * Discriminated result of {@link parseJsonBody}: either the validated
 * payload or a ready-to-return 400 error response.
 */
export type ParseJsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

/** Optional per-route overrides for the error copy and payload code. */
export interface ParseJsonMessages {
  /** Message when the body is not valid JSON. Default: "Anfrage konnte nicht gelesen werden." */
  invalidJson?: string;
  /** Message when the JSON fails schema validation. Default: "Ungültige Anfrage." */
  invalidPayload?: string;
  /** Error code for schema validation failures. Default: "INVALID_PAYLOAD". */
  payloadCode?: string;
}

/**
 * Parse and Zod-validate a JSON request body.
 *
 * Replaces the copy-pasted `try { request.json() + safeParse } catch`
 * blocks in API routes. Usage:
 *
 * ```ts
 * const parsed = await parseJsonBody(request, mySchema, {
 *   invalidPayload: "Anfrage ungültig (message und family_id erforderlich).",
 *   payloadCode: "INVALID_CHAT_INPUT",
 * });
 * if (!parsed.ok) return parsed.response;
 * const { message } = parsed.data;
 * ```
 */
export async function parseJsonBody<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
  messages: ParseJsonMessages = {},
): Promise<ParseJsonResult<z.output<Schema>>> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return {
      ok: false,
      response: jsonError(
        messages.invalidJson ?? "Anfrage konnte nicht gelesen werden.",
        "INVALID_JSON",
        400,
      ),
    };
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    return {
      ok: false,
      response: jsonError(
        messages.invalidPayload ?? "Ungültige Anfrage.",
        messages.payloadCode ?? "INVALID_PAYLOAD",
        400,
      ),
    };
  }

  return { ok: true, data: result.data };
}
