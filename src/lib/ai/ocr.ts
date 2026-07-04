/**
 * Datalab OCR client (Chandra OCR 2).
 *
 * Wraps the Datalab document conversion API:
 *   1. POST /api/v1/convert  — submit a file for OCR (async, returns request_id)
 *   2. GET  /api/v1/convert/{request_id} — poll until status=complete|failed
 *
 * Auth is via the `X-API-Key` header (NOT Bearer). The API key is read
 * from `DATALAB_API_KEY` (server-only env var) and is never exposed to
 * the client.
 *
 * Results are deleted from Datalab servers 1 hour after completion, so
 * callers must persist them immediately upon receiving the complete
 * response.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DATALAB_BASE_URL = "https://www.datalab.to";

/** Polling interval in milliseconds (2 seconds). */
const POLL_INTERVAL_MS = 2000;

/** Maximum polling duration before we give up (5 minutes). */
const MAX_POLL_DURATION_MS = 5 * 60 * 1000;

/** Page delimiter used by Datalab when `paginate=true`. */
const PAGE_DELIMITER = "{PAGE_BREAK}";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single OCR page result.
 */
export interface OcrPage {
  /** 1-based page number (contiguous from 1). */
  page_number: number;
  /** Markdown content for this page. */
  ocr_markdown: string;
  /** Layout / metadata for this page (from Datalab metadata). */
  layout_json: Record<string, unknown> | null;
}

/**
 * The complete OCR result returned by `runOcr`.
 */
export interface OcrResult {
  /** One entry per page, ordered by page_number (1-based). */
  pages: OcrPage[];
  /** Total number of pages. */
  page_count: number;
  /** Full concatenated markdown (all pages joined). */
  full_markdown: string;
  /** Datalab metadata object (quality score, cost, etc.). */
  metadata: Record<string, unknown> | null;
}

/**
 * Error thrown when the Datalab API returns a failure or the poll times out.
 */
export class DatalabOcrError extends Error {
  /** Machine-readable error code for structured API responses. */
  readonly code: string;
  /** HTTP status from Datalab (if applicable). */
  readonly statusCode?: number;

  constructor(message: string, code: string, statusCode?: number) {
    super(message);
    this.name = "DatalabOcrError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Get the API key from the environment, throwing a typed error if missing.
 * This ensures we never accidentally send an empty/undefined key.
 */
function getApiKey(): string {
  const key = process.env.DATALAB_API_KEY;
  if (!key) {
    throw new DatalabOcrError(
      "Datalab API key is not configured.",
      "DATALAB_NOT_CONFIGURED",
    );
  }
  return key;
}

/**
 * Response from the POST /api/v1/convert submit call.
 */
interface ConvertSubmitResponse {
  success: boolean;
  request_id: string;
  request_check_url: string;
}

/**
 * Response from the GET /api/v1/convert/{request_id} poll call.
 */
interface ConvertPollResponse {
  status: "processing" | "complete" | "failed";
  success?: boolean;
  markdown?: string;
  html?: string;
  json?: unknown;
  chunks?: unknown;
  images?: Record<string, string>;
  metadata?: Record<string, unknown>;
  page_count?: number;
  parse_quality_score?: number;
  cost_breakdown?: Record<string, unknown>;
  error?: string;
}

/**
 * Sleep for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Split a paginated markdown string into per-page markdown chunks.
 *
 * Datalab inserts `{PAGE_BREAK}` delimiters between pages when
 * `paginate=true`. This function splits on that delimiter and trims
 * whitespace from each page.
 *
 * If no delimiters are found, the entire markdown is returned as a
 * single page (which is correct for single-page documents like photos).
 *
 * @param markdown - The full markdown string (with page delimiters).
 * @param page_count - The page count reported by Datalab.
 * @returns An array of per-page markdown strings (1-based order).
 */
export function splitMarkdownByPages(
  markdown: string,
  page_count: number,
): string[] {
  // If the markdown is empty, return empty pages.
  if (!markdown || !markdown.trim()) {
    return [];
  }

  const parts = markdown.split(PAGE_DELIMITER);

  // Trim each page and filter out fully-empty trailing pages (Datalab may
  // append a trailing delimiter).
  const trimmed = parts.map((p) => p.trim());

  // If splitting produced the expected number of pages, return them.
  if (trimmed.length === page_count) {
    return trimmed;
  }

  // If splitting produced more parts than page_count (e.g. a trailing empty
  // page from a trailing delimiter), trim to page_count.
  if (trimmed.length > page_count) {
    return trimmed.slice(0, page_count);
  }

  // If splitting produced fewer parts than page_count, we cannot reliably
  // distribute. Fall back: return what we have (at least 1 page).
  // This handles single-page documents (no delimiter) and edge cases.
  if (trimmed.length === 1 && page_count > 1) {
    // No delimiters found but multi-page — store entire markdown as page 1
    // and create empty placeholder pages for the rest. This is a fallback;
    // the ocr_text will still contain the full content.
    return [trimmed[0]];
  }

  return trimmed.length > 0 ? trimmed : [markdown];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Submit a document to Datalab for OCR conversion.
 *
 * Sends a multipart/form-data POST to `/api/v1/convert` with:
 *   - file: the document file
 *   - output_format: "markdown"
 *   - use_llm: "true" (per the feature contract — enables LLM-enhanced layout)
 *   - paginate: "true" (adds page delimiters for per-page splitting)
 *   - mode: "accurate" (best for scanned documents and complex layouts)
 *
 * @param file - The file content as a Blob.
 * @param filename - The original filename (used in the multipart form).
 * @returns The request_id for polling.
 * @throws {DatalabOcrError} if the submit fails or the API key is missing.
 */
export async function submitConversion(
  file: Blob,
  filename: string,
): Promise<string> {
  const apiKey = getApiKey();

  const formData = new FormData();
  formData.append("file", file, filename);
  formData.append("output_format", "markdown");
  formData.append("use_llm", "true");
  formData.append("paginate", "true");
  formData.append("mode", "accurate");

  let response: Response;
  try {
    response = await fetch(`${DATALAB_BASE_URL}/api/v1/convert`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
      },
      body: formData,
    });
  } catch {
    throw new DatalabOcrError(
      "Netzwerkfehler beim Kontaktieren des OCR-Dienstes.",
      "DATALAB_NETWORK_ERROR",
    );
  }

  if (!response.ok) {
    // Read the error body for a more descriptive message.
    let detail = "";
    try {
      const errorBody = await response.json();
      detail = errorBody?.detail || errorBody?.error || "";
    } catch {
      // Ignore JSON parse errors — use the status text.
    }

    if (response.status === 401 || response.status === 403) {
      throw new DatalabOcrError(
        "OCR-Dienst: Authentifizierung fehlgeschlagen.",
        "DATALAB_AUTH_ERROR",
        response.status,
      );
    }
    if (response.status === 429) {
      throw new DatalabOcrError(
        "OCR-Dienst: Rate-Limit erreicht. Bitte später erneut versuchen.",
        "DATALAB_RATE_LIMITED",
        response.status,
      );
    }

    throw new DatalabOcrError(
      `OCR-Dienst hat den Antrag abgelehnt${detail ? `: ${detail}` : "."}`,
      "DATALAB_SUBMIT_FAILED",
      response.status,
    );
  }

  let data: ConvertSubmitResponse;
  try {
    data = await response.json();
  } catch {
    throw new DatalabOcrError(
      "OCR-Dienst: Ungültige Antwort erhalten.",
      "DATALAB_INVALID_RESPONSE",
    );
  }

  if (!data.success || !data.request_id) {
    throw new DatalabOcrError(
      "OCR-Dienst: Antrag-ID fehlt in der Antwort.",
      "DATALAB_INVALID_RESPONSE",
    );
  }

  return data.request_id;
}

/**
 * Poll the Datalab convert endpoint until the request completes or fails.
 *
 * Polls `GET /api/v1/convert/{request_id}` every `POLL_INTERVAL_MS` until
 * `status` is `complete` or `failed`, or until `MAX_POLL_DURATION_MS`
 * elapses (which raises a timeout error).
 *
 * @param requestId - The request_id returned by `submitConversion`.
 * @returns The complete poll response with markdown and page metadata.
 * @throws {DatalabOcrError} if the poll times out, the API returns
 *         `status: failed`, or a network error occurs.
 */
export async function pollConversion(
  requestId: string,
): Promise<ConvertPollResponse> {
  const apiKey = getApiKey();
  const startTime = Date.now();

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed > MAX_POLL_DURATION_MS) {
      throw new DatalabOcrError(
        "OCR-Dienst: Zeitüberschreitung beim Warten auf Ergebnisse.",
        "DATALAB_TIMEOUT",
      );
    }

    let response: Response;
    try {
      response = await fetch(
        `${DATALAB_BASE_URL}/api/v1/convert/${requestId}`,
        {
          method: "GET",
          headers: {
            "X-API-Key": apiKey,
          },
        },
      );
    } catch {
      throw new DatalabOcrError(
        "Netzwerkfehler beim Abrufen der OCR-Ergebnisse.",
        "DATALAB_NETWORK_ERROR",
      );
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new DatalabOcrError(
          "OCR-Ergebnis nicht mehr verfügbar (abgelaufen). Bitte erneut versuchen.",
          "DATALAB_RESULT_EXPIRED",
          404,
        );
      }
      throw new DatalabOcrError(
        `OCR-Dienst: Abruf fehlgeschlagen (Status ${response.status}).`,
        "DATALAB_POLL_FAILED",
        response.status,
      );
    }

    let data: ConvertPollResponse;
    try {
      data = await response.json();
    } catch {
      throw new DatalabOcrError(
        "OCR-Dienst: Ungültige Polling-Antwort.",
        "DATALAB_INVALID_RESPONSE",
      );
    }

    if (data.status === "complete") {
      if (data.success === false) {
        throw new DatalabOcrError(
          data.error || "OCR-Dienst: Konvertierung fehlgeschlagen.",
          "DATALAB_CONVERSION_FAILED",
        );
      }
      return data;
    }

    if (data.status === "failed") {
      throw new DatalabOcrError(
        data.error || "OCR-Dienst: Konvertierung fehlgeschlagen.",
        "DATALAB_CONVERSION_FAILED",
      );
    }

    // status === "processing" — wait and poll again.
    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Run the full OCR pipeline: submit the file, poll until complete, and
 * return structured per-page results.
 *
 * This is the high-level entry point used by the OCR API route. It:
 *   1. Submits the file to Datalab (returns request_id)
 *   2. Polls until status=complete (or fails/times out)
 *   3. Splits the markdown into per-page chunks
 *   4. Returns an `OcrResult` with pages, page_count, and full_markdown
 *
 * Results must be persisted immediately by the caller — Datalab deletes
 * results 1 hour after completion.
 *
 * @param file - The file content as a Blob.
 * @param filename - The original filename.
 * @returns The OCR result with per-page markdown and metadata.
 * @throws {DatalabOcrError} on any failure (network, auth, timeout, conversion).
 */
export async function runOcr(
  file: Blob,
  filename: string,
): Promise<OcrResult> {
  // 1. Submit the file for conversion.
  const requestId = await submitConversion(file, filename);

  // 2. Poll until complete.
  const result = await pollConversion(requestId);

  // 3. Extract markdown and page count.
  const markdown = result.markdown || "";
  const pageCount = result.page_count ?? 1;
  const metadata = result.metadata ?? null;

  // 4. Split into per-page chunks.
  const pageMarkdowns = splitMarkdownByPages(markdown, pageCount);

  // 5. Build the pages array (1-based page numbers).
  const pages: OcrPage[] = pageMarkdowns.map((md, index) => ({
    page_number: index + 1,
    ocr_markdown: md,
    layout_json: metadata,
  }));

  // 6. Build the full concatenated markdown.
  const fullMarkdown = pages.map((p) => p.ocr_markdown).join("\n\n");

  return {
    pages,
    page_count: pages.length,
    full_markdown: fullMarkdown,
    metadata,
  };
}
