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
 *
 * Per-page layout data: we request `output_format=markdown,json` so the
 * response includes both the paginated markdown (with {PAGE_BREAK}
 * delimiters) and the structured JSON output (Marker block tree with
 * per-page layout blocks, bounding boxes, and block types). Each page's
 * `layout_json` is the page-specific block data from the JSON output —
 * NOT the document-level `metadata` object.
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
 * single element (which is correct for single-page documents like photos,
 * or for multi-page documents where the markdown lacks delimiters — in
 * that case the caller is responsible for reconciling with `page_count`
 * and the per-page JSON layout data, or failing explicitly).
 *
 * This function does NOT silently undercount pages. If the split produces
 * fewer parts than `page_count`, the caller must handle the mismatch.
 *
 * @param markdown - The full markdown string (with page delimiters).
 * @param page_count - The page count reported by Datalab (used to trim
 *                     excess parts from trailing delimiters).
 * @returns An array of per-page markdown strings (in order, may be fewer
 *          than `page_count` if delimiters are missing).
 */
export function splitMarkdownByPages(
  markdown: string,
  page_count: number,
): string[] {
  // If the markdown is empty, return empty array.
  if (!markdown || !markdown.trim()) {
    return [];
  }

  const parts = markdown.split(PAGE_DELIMITER);

  // Trim each page.
  const trimmed = parts.map((p) => p.trim());

  // If splitting produced more parts than page_count (e.g. a trailing empty
  // page from a trailing delimiter), trim to page_count.
  if (trimmed.length > page_count) {
    return trimmed.slice(0, page_count);
  }

  // Return all parts found. The caller is responsible for reconciling
  // the part count with page_count and the per-page JSON layout data,
  // and for failing explicitly if the pages cannot be mapped safely.
  return trimmed;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Submit a document to Datalab for OCR conversion.
 *
 * Sends a multipart/form-data POST to `/api/v1/convert` with:
 *   - file: the document file
 *   - output_format: "markdown,json" (gets both paginated markdown and
 *     per-page JSON layout data with block types and bounding boxes)
 *   - use_llm: "true" (per the feature contract — enables LLM-enhanced layout)
 *   - paginate: "true" (adds {PAGE_BREAK} delimiters for per-page splitting)
 *   - include_markdown_in_chunks: "true" (includes markdown in JSON output)
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
  formData.append("output_format", "markdown,json");
  formData.append("use_llm", "true");
  formData.append("paginate", "true");
  formData.append("include_markdown_in_chunks", "true");
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
 * Extract per-page layout blocks from the Datalab JSON output.
 *
 * The Marker JSON output (requested via `output_format=markdown,json`) has
 * a tree structure where top-level children are Page blocks. Each Page
 * block contains the layout blocks (text, tables, images) for that page
 * with bounding boxes, block types, and other structural metadata.
 *
 * This function defensively parses the JSON to find page-level blocks,
 * handling both object and string (JSON-encoded) formats, and various
 * structural shapes the API may return.
 *
 * @param json - The `json` field from the Datalab poll response.
 * @returns Array of page block objects (sorted by page_id, in page order),
 *          or null if the JSON doesn't contain recognizable per-page block
 *          data.
 */
export function extractPerPageLayout(json: unknown): unknown[] | null {
  if (!json) return null;

  // The json field may be a JSON-encoded string or an object.
  let parsed: unknown = json;
  if (typeof json === "string") {
    if (!json.trim()) return null;
    try {
      parsed = JSON.parse(json);
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== "object") return null;

  // The Marker JSON output has a top-level object with a `children` array
  // of page blocks. Handle both { children: [...] } and direct array forms.
  let candidates: unknown[] | undefined;
  if (Array.isArray(parsed)) {
    candidates = parsed;
  } else if (
    Array.isArray((parsed as Record<string, unknown>).children)
  ) {
    candidates = (parsed as Record<string, unknown>).children as unknown[];
  }

  if (!candidates || candidates.length === 0) return null;

  // Filter for page-like blocks. Marker uses block_type: "Page".
  const pageBlocks = candidates.filter(
    (child): child is Record<string, unknown> => {
      if (!child || typeof child !== "object") return false;
      const blockType = (child as Record<string, unknown>).block_type;
      return (
        typeof blockType === "string" &&
        (blockType === "Page" || blockType === "page")
      );
    },
  );

  // Sort page blocks by page_id (0-indexed in the API, returned in order).
  const sortByPageId = (a: Record<string, unknown>, b: Record<string, unknown>) => {
    const aId = a.page_id;
    const bId = b.page_id;
    return (
      (typeof aId === "number" ? aId : 0) -
      (typeof bId === "number" ? bId : 0)
    );
  };

  if (pageBlocks.length > 0) {
    return pageBlocks.sort(sortByPageId);
  }

  // Fallback: if no explicit Page block_type, look for objects with page_id.
  const pageIdObjects = candidates.filter(
    (child): child is Record<string, unknown> => {
      if (!child || typeof child !== "object") return false;
      return "page_id" in (child as Record<string, unknown>);
    },
  );

  if (pageIdObjects.length > 0) {
    return pageIdObjects.sort(sortByPageId);
  }

  return null;
}

/**
 * Build per-page OCR results from the Datalab response data.
 *
 * Reconciles three data sources to produce one `OcrPage` per page:
 *   1. The paginated markdown (with `{PAGE_BREAK}` delimiters)
 *   2. The JSON page blocks (per-page layout data from the Marker output)
 *   3. The reported `page_count` from the Datalab response
 *
 * Each page's `layout_json` is the page-specific block data from the JSON
 * output (NOT the document-level `metadata` object). When no JSON page
 * data is available, `layout_json` is null.
 *
 * If the response data cannot be mapped safely to all reported pages
 * (e.g. `page_count > 1` but the markdown has no `{PAGE_BREAK}` and no
 * JSON page blocks are available), this function throws a
 * `DatalabOcrError` with code `PAGE_COUNT_MISMATCH` instead of
 * silently undercounting pages.
 *
 * @param markdown - The full markdown string (may contain {PAGE_BREAK}).
 * @param json - The `json` field from the Datalab poll response.
 * @param pageCount - The page_count reported by Datalab.
 * @returns Array of OcrPage objects (one per page, 1-based page numbers).
 * @throws {DatalabOcrError} with code PAGE_COUNT_MISMATCH if the data
 *         cannot be safely mapped to all reported pages.
 */
export function buildPages(
  markdown: string,
  json: unknown,
  pageCount: number,
): OcrPage[] {
  // Extract per-page layout blocks from the JSON output.
  const pageLayouts = extractPerPageLayout(json);

  // Split markdown by {PAGE_BREAK} delimiter.
  const pageMarkdowns = splitMarkdownByPages(markdown, Math.max(pageCount, 1));

  // --- Case 1: Per-page layout data available from JSON ---
  // This is the preferred path: we have page-specific block data from the
  // Marker JSON output, which gives us accurate per-page layout_json.
  //
  // The Datalab `page_count` field is the authoritative page count reported
  // by the upstream OCR service. The JSON page layouts (Marker block tree)
  // must match this count exactly. If the JSON has fewer OR more page
  // blocks than `page_count`, the response is inconsistent/impossible and
  // we reject it with PAGE_COUNT_MISMATCH rather than silently storing
  // a wrong number of pages.
  if (pageLayouts && pageLayouts.length > 0) {
    const numPages = pageLayouts.length;

    // Reject if JSON page layouts don't match the reported page_count.
    // Both fewer (undercounting) and more (overcounting) are impossible
    // responses unless the upstream contract is explicitly documented
    // otherwise.
    if (numPages !== pageCount) {
      throw new DatalabOcrError(
        "OCR-Ergebnisse konnten nicht sicher auf alle gemeldeten Seiten abgebildet werden.",
        "PAGE_COUNT_MISMATCH",
      );
    }

    // Build one page per JSON page block. Use markdown from {PAGE_BREAK}
    // splitting when available; for pages without split markdown, assign
    // the full markdown to page 1 and empty string to the rest.
    return pageLayouts.map((pageLayout, index) => ({
      page_number: index + 1,
      ocr_markdown:
        pageMarkdowns[index] ?? (index === 0 ? markdown.trim() : ""),
      layout_json: pageLayout as Record<string, unknown>,
    }));
  }

  // --- Case 2: No per-page JSON data, rely on {PAGE_BREAK} splitting ---
  // This handles single-page documents (photos) and multi-page documents
  // where the markdown has proper {PAGE_BREAK} delimiters.
  if (pageMarkdowns.length === pageCount) {
    return pageMarkdowns.map((md, index) => ({
      page_number: index + 1,
      ocr_markdown: md,
      layout_json: null, // No per-page layout data available.
    }));
  }

  // --- Case 3: Empty markdown (blank or unreadable document) ---
  if (pageMarkdowns.length === 0) {
    return [];
  }

  // --- Case 4: Cannot reconcile — fail explicitly ---
  // This handles the critical case: page_count > 1 but the markdown has no
  // {PAGE_BREAK} delimiters AND no JSON page blocks are available.
  // Rather than silently undercounting (storing 1 row instead of N), we
  // fail explicitly so the caller can mark the document as failed.
  throw new DatalabOcrError(
    "OCR-Ergebnisse konnten nicht sicher auf alle gemeldeten Seiten abgebildet werden.",
    "PAGE_COUNT_MISMATCH",
  );
}

/**
 * Run the full OCR pipeline: submit the file, poll until complete, and
 * return structured per-page results.
 *
 * This is the high-level entry point used by the OCR API route. It:
 *   1. Submits the file to Datalab (returns request_id)
 *   2. Polls until status=complete (or fails/times out)
 *   3. Extracts per-page layout data from the JSON output
 *   4. Splits the markdown into per-page chunks
 *   5. Reconciles page counts and builds one OcrPage per page
 *
 * Each page's `layout_json` contains page-specific block data from the
 * Datalab JSON output (bounding boxes, block types, etc.) — NOT the
 * document-level `metadata` object. The document-level metadata is
 * available separately on the `OcrResult.metadata` field.
 *
 * Results must be persisted immediately by the caller — Datalab deletes
 * results 1 hour after completion.
 *
 * @param file - The file content as a Blob.
 * @param filename - The original filename.
 * @returns The OCR result with per-page markdown, per-page layout, and
 *          document-level metadata.
 * @throws {DatalabOcrError} on any failure (network, auth, timeout,
 *         conversion, or page-count mismatch).
 */
export async function runOcr(
  file: Blob,
  filename: string,
): Promise<OcrResult> {
  // 1. Submit the file for conversion.
  const requestId = await submitConversion(file, filename);

  // 2. Poll until complete.
  const result = await pollConversion(requestId);

  // 3. Extract markdown, JSON layout data, and page count.
  const markdown = result.markdown || "";
  const pageCount = result.page_count ?? 1;
  const metadata = result.metadata ?? null;
  const json = result.json ?? null;

  // 4. Build per-page results with proper page-specific layout data.
  //    This reconciles the markdown, JSON page blocks, and page_count,
  //    and throws PAGE_COUNT_MISMATCH if the data can't be safely mapped.
  const pages = buildPages(markdown, json, pageCount);

  // 5. Build the full concatenated markdown.
  const fullMarkdown = pages.map((p) => p.ocr_markdown).join("\n\n");

  return {
    pages,
    page_count: pages.length,
    full_markdown: fullMarkdown,
    metadata,
  };
}
