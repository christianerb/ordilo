import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch.
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// Import after mocking fetch.
import {
  submitConversion,
  pollConversion,
  runOcr,
  splitMarkdownByPages,
  extractPerPageLayout,
  buildPages,
  DatalabOcrError,
} from "@/lib/ai/ocr";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Set the DATALAB_API_KEY env var for tests. */
function setApiKey(key: string = "test-api-key") {
  process.env.DATALAB_API_KEY = key;
}

/** Create a mock Response object. */
function mockResponse(
  body: unknown,
  options: { status?: number; ok?: boolean } = {},
): Response {
  const status = options.status ?? 200;
  return {
    ok: options.ok ?? (status >= 200 && status < 300),
    status,
    json: async () => body,
  } as Response;
}

/** Create a minimal Blob for testing. */
function createBlob(content: string = "fake pdf content"): Blob {
  return new Blob([content], { type: "application/pdf" });
}

// ---------------------------------------------------------------------------
// splitMarkdownByPages
// ---------------------------------------------------------------------------

describe("splitMarkdownByPages", () => {
  it("returns empty array for empty markdown", () => {
    expect(splitMarkdownByPages("", 1)).toEqual([]);
  });

  it("returns empty array for whitespace-only markdown", () => {
    expect(splitMarkdownByPages("   \n\n  ", 1)).toEqual([]);
  });

  it("returns single page when no delimiter is present", () => {
    const md = "# Heading\n\nSome text.";
    const result = splitMarkdownByPages(md, 1);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("# Heading\n\nSome text.");
  });

  it("splits multi-page markdown by {PAGE_BREAK} delimiter", () => {
    const md = "Page 1 content{PAGE_BREAK}Page 2 content{PAGE_BREAK}Page 3 content";
    const result = splitMarkdownByPages(md, 3);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("Page 1 content");
    expect(result[1]).toBe("Page 2 content");
    expect(result[2]).toBe("Page 3 content");
  });

  it("trims whitespace around each page", () => {
    const md = "  Page 1  {PAGE_BREAK}  Page 2  ";
    const result = splitMarkdownByPages(md, 2);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("Page 1");
    expect(result[1]).toBe("Page 2");
  });

  it("handles trailing delimiter by slicing to page_count", () => {
    const md = "Page 1{PAGE_BREAK}Page 2{PAGE_BREAK}";
    const result = splitMarkdownByPages(md, 2);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("Page 1");
    expect(result[1]).toBe("Page 2");
  });

  it("returns single element when no delimiters but page_count > 1 (caller handles mismatch)", () => {
    const md = "All content on one string";
    const result = splitMarkdownByPages(md, 3);
    // splitMarkdownByPages no longer silently undercounts. It returns
    // what it found (1 part). The caller (buildPages) is responsible
    // for reconciling with page_count and failing explicitly.
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("All content on one string");
  });

  it("handles photo (single page, no delimiter)", () => {
    const md = "# Rechnung\n\nStromrechnung Juli 2026";
    const result = splitMarkdownByPages(md, 1);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("# Rechnung\n\nStromrechnung Juli 2026");
  });
});

// ---------------------------------------------------------------------------
// submitConversion
// ---------------------------------------------------------------------------

describe("submitConversion", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    setApiKey();
  });

  it("submits file and returns request_id on success", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({
        success: true,
        request_id: "req-123",
        request_check_url: "https://www.datalab.to/api/v1/convert/req-123",
      }),
    );

    const requestId = await submitConversion(
      createBlob(),
      "test.pdf",
    );

    expect(requestId).toBe("req-123");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Verify the request used the correct URL, method, and headers.
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://www.datalab.to/api/v1/convert");
    expect(options.method).toBe("POST");
    expect(options.headers["X-API-Key"]).toBe("test-api-key");

    // Verify the form data includes the required fields.
    const formData = options.body as FormData;
    expect(formData.get("file")).toBeInstanceOf(Blob);
    expect(formData.get("output_format")).toBe("markdown,json");
    expect(formData.get("use_llm")).toBe("true");
    expect(formData.get("paginate")).toBe("true");
    expect(formData.get("include_markdown_in_chunks")).toBe("true");
  });

  it("throws DatalabOcrError when API key is missing", async () => {
    delete process.env.DATALAB_API_KEY;

    await expect(
      submitConversion(createBlob(), "test.pdf"),
    ).rejects.toThrow(DatalabOcrError);

    try {
      delete process.env.DATALAB_API_KEY;
      await submitConversion(createBlob(), "test.pdf");
    } catch (err) {
      expect((err as DatalabOcrError).code).toBe("DATALAB_NOT_CONFIGURED");
    }
  });

  it("throws auth error on 401", async () => {
    fetchMock.mockResolvedValue(mockResponse({ detail: "Invalid key" }, { status: 401 }));

    await expect(
      submitConversion(createBlob(), "test.pdf"),
    ).rejects.toThrow(DatalabOcrError);

    try {
      await submitConversion(createBlob(), "test.pdf");
    } catch (err) {
      expect((err as DatalabOcrError).code).toBe("DATALAB_AUTH_ERROR");
    }
  });

  it("throws rate limit error on 429", async () => {
    fetchMock.mockResolvedValue(mockResponse({ detail: "Too many requests" }, { status: 429 }));

    try {
      await submitConversion(createBlob(), "test.pdf");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DatalabOcrError);
      expect((err as DatalabOcrError).code).toBe("DATALAB_RATE_LIMITED");
    }
  });

  it("throws submit failed error on other non-OK status", async () => {
    fetchMock.mockResolvedValue(mockResponse({ detail: "Bad request" }, { status: 400 }));

    try {
      await submitConversion(createBlob(), "test.pdf");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DatalabOcrError);
      expect((err as DatalabOcrError).code).toBe("DATALAB_SUBMIT_FAILED");
    }
  });

  it("throws network error when fetch rejects", async () => {
    fetchMock.mockRejectedValue(new Error("Connection refused"));

    try {
      await submitConversion(createBlob(), "test.pdf");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DatalabOcrError);
      expect((err as DatalabOcrError).code).toBe("DATALAB_NETWORK_ERROR");
    }
  });

  it("throws invalid response when request_id is missing", async () => {
    fetchMock.mockResolvedValue(mockResponse({ success: true }));

    try {
      await submitConversion(createBlob(), "test.pdf");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DatalabOcrError);
      expect((err as DatalabOcrError).code).toBe("DATALAB_INVALID_RESPONSE");
    }
  });
});

// ---------------------------------------------------------------------------
// pollConversion
// ---------------------------------------------------------------------------

describe("pollConversion", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    setApiKey();
  });

  it("returns complete result immediately when status is complete", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({
        status: "complete",
        success: true,
        markdown: "# Test\n\nContent",
        page_count: 1,
        metadata: { quality: 4.5 },
      }),
    );

    const result = await pollConversion("req-123");

    expect(result.status).toBe("complete");
    expect(result.markdown).toBe("# Test\n\nContent");
    expect(result.page_count).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("polls until status becomes complete", async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse({ status: "processing" }))
      .mockResolvedValueOnce(mockResponse({ status: "processing" }))
      .mockResolvedValueOnce(
        mockResponse({
          status: "complete",
          success: true,
          markdown: "Done",
          page_count: 1,
        }),
      );

    const result = await pollConversion("req-123");

    expect(result.status).toBe("complete");
    expect(result.markdown).toBe("Done");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws conversion failed when status is failed", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({ status: "failed", error: "Could not parse" }),
    );

    try {
      await pollConversion("req-123");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DatalabOcrError);
      expect((err as DatalabOcrError).code).toBe("DATALAB_CONVERSION_FAILED");
    }
  });

  it("throws when complete but success is false", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({ status: "complete", success: false, error: "Parse error" }),
    );

    try {
      await pollConversion("req-123");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DatalabOcrError);
      expect((err as DatalabOcrError).code).toBe("DATALAB_CONVERSION_FAILED");
    }
  });

  it("throws result expired on 404", async () => {
    fetchMock.mockResolvedValue(mockResponse({}, { status: 404 }));

    try {
      await pollConversion("req-123");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DatalabOcrError);
      expect((err as DatalabOcrError).code).toBe("DATALAB_RESULT_EXPIRED");
    }
  });

  it("throws network error when fetch rejects", async () => {
    fetchMock.mockRejectedValue(new Error("Connection lost"));

    try {
      await pollConversion("req-123");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DatalabOcrError);
      expect((err as DatalabOcrError).code).toBe("DATALAB_NETWORK_ERROR");
    }
  });
});

// ---------------------------------------------------------------------------
// extractPerPageLayout
// ---------------------------------------------------------------------------

/** Build a Marker-style JSON output with per-page Page blocks. */
function buildJsonOutput(pageCount: number): unknown {
  return {
    children: Array.from({ length: pageCount }, (_, i) => ({
      block_type: "Page",
      page_id: i,
      children: [
        {
          block_type: "Text",
          html: `<p>Content for page ${i + 1}</p>`,
          bbox: [0, i * 100, 500, i * 100 + 100],
        },
      ],
    })),
  };
}

describe("extractPerPageLayout", () => {
  it("extracts page blocks from a Marker JSON object with children", () => {
    const json = buildJsonOutput(3);
    const pages = extractPerPageLayout(json);

    expect(pages).not.toBeNull();
    expect(pages).toHaveLength(3);
    // Pages should be sorted by page_id (0, 1, 2)
    expect((pages![0] as Record<string, unknown>).page_id).toBe(0);
    expect((pages![1] as Record<string, unknown>).page_id).toBe(1);
    expect((pages![2] as Record<string, unknown>).page_id).toBe(2);
  });

  it("returns null for null/undefined json", () => {
    expect(extractPerPageLayout(null)).toBeNull();
    expect(extractPerPageLayout(undefined)).toBeNull();
  });

  it("returns null for empty or whitespace string", () => {
    expect(extractPerPageLayout("")).toBeNull();
    expect(extractPerPageLayout("   ")).toBeNull();
  });

  it("parses JSON-encoded string", () => {
    const json = JSON.stringify(buildJsonOutput(2));
    const pages = extractPerPageLayout(json);

    expect(pages).not.toBeNull();
    expect(pages).toHaveLength(2);
  });

  it("returns null for invalid JSON string", () => {
    expect(extractPerPageLayout("not valid json")).toBeNull();
  });

  it("returns null when children has no Page blocks", () => {
    const json = {
      children: [
        { block_type: "Text", html: "<p>No pages here</p>" },
        { block_type: "Table", rows: [] },
      ],
    };
    expect(extractPerPageLayout(json)).toBeNull();
  });

  it("returns null for non-object json", () => {
    expect(extractPerPageLayout(42)).toBeNull();
    expect(extractPerPageLayout(true)).toBeNull();
  });

  it("handles direct array of page blocks", () => {
    const json = [
      { block_type: "Page", page_id: 0, children: [] },
      { block_type: "Page", page_id: 1, children: [] },
    ];
    const pages = extractPerPageLayout(json);

    expect(pages).not.toBeNull();
    expect(pages).toHaveLength(2);
  });

  it("sorts page blocks by page_id", () => {
    const json = {
      children: [
        { block_type: "Page", page_id: 2, children: [] },
        { block_type: "Page", page_id: 0, children: [] },
        { block_type: "Page", page_id: 1, children: [] },
      ],
    };
    const pages = extractPerPageLayout(json);

    expect(pages).not.toBeNull();
    expect((pages![0] as Record<string, unknown>).page_id).toBe(0);
    expect((pages![1] as Record<string, unknown>).page_id).toBe(1);
    expect((pages![2] as Record<string, unknown>).page_id).toBe(2);
  });

  it("falls back to page_id when block_type is not Page", () => {
    const json = {
      children: [
        { page_id: 0, content: "page 0" },
        { page_id: 1, content: "page 1" },
      ],
    };
    const pages = extractPerPageLayout(json);

    expect(pages).not.toBeNull();
    expect(pages).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// buildPages
// ---------------------------------------------------------------------------

describe("buildPages", () => {
  it("builds pages with per-page layout_json from JSON page blocks", () => {
    const markdown = "Page 1{PAGE_BREAK}Page 2{PAGE_BREAK}Page 3";
    const json = buildJsonOutput(3);

    const pages = buildPages(markdown, json, 3);

    expect(pages).toHaveLength(3);
    expect(pages[0].page_number).toBe(1);
    expect(pages[0].ocr_markdown).toBe("Page 1");
    // layout_json should be the page-specific block data, not document metadata
    expect(pages[0].layout_json).not.toBeNull();
    expect((pages[0].layout_json as Record<string, unknown>).block_type).toBe("Page");
    expect((pages[0].layout_json as Record<string, unknown>).page_id).toBe(0);

    expect(pages[1].page_number).toBe(2);
    expect(pages[1].ocr_markdown).toBe("Page 2");
    expect((pages[1].layout_json as Record<string, unknown>).page_id).toBe(1);

    expect(pages[2].page_number).toBe(3);
    expect(pages[2].ocr_markdown).toBe("Page 3");
    expect((pages[2].layout_json as Record<string, unknown>).page_id).toBe(2);
  });

  it("stores different layout_json per page (not shared document metadata)", () => {
    const markdown = "A{PAGE_BREAK}B";
    const json = buildJsonOutput(2);

    const pages = buildPages(markdown, json, 2);

    expect(pages).toHaveLength(2);
    // Each page must have its OWN layout_json (page-specific block data)
    expect(pages[0].layout_json).not.toBe(pages[1].layout_json);
    expect((pages[0].layout_json as Record<string, unknown>).page_id).toBe(0);
    expect((pages[1].layout_json as Record<string, unknown>).page_id).toBe(1);
  });

  it("builds single page with layout_json from JSON", () => {
    const markdown = "# Rechnung\n\nStromrechnung";
    const json = buildJsonOutput(1);

    const pages = buildPages(markdown, json, 1);

    expect(pages).toHaveLength(1);
    expect(pages[0].page_number).toBe(1);
    expect(pages[0].ocr_markdown).toBe("# Rechnung\n\nStromrechnung");
    expect(pages[0].layout_json).not.toBeNull();
    expect((pages[0].layout_json as Record<string, unknown>).block_type).toBe("Page");
  });

  it("sets layout_json to null when no JSON page data but markdown splits correctly", () => {
    const markdown = "Page 1{PAGE_BREAK}Page 2";
    const pages = buildPages(markdown, null, 2);

    expect(pages).toHaveLength(2);
    expect(pages[0].ocr_markdown).toBe("Page 1");
    expect(pages[0].layout_json).toBeNull();
    expect(pages[1].ocr_markdown).toBe("Page 2");
    expect(pages[1].layout_json).toBeNull();
  });

  it("creates all pages from JSON when markdown lacks {PAGE_BREAK}", () => {
    // Multi-page document where markdown has no delimiters but JSON has
    // per-page blocks. All pages should be created.
    const markdown = "All content together without page breaks";
    const json = buildJsonOutput(3);

    const pages = buildPages(markdown, json, 3);

    expect(pages).toHaveLength(3);
    // Page 1 gets the full markdown; pages 2-3 get empty markdown
    expect(pages[0].ocr_markdown).toBe("All content together without page breaks");
    expect(pages[1].ocr_markdown).toBe("");
    expect(pages[2].ocr_markdown).toBe("");
    // All pages have per-page layout_json
    expect(pages[0].layout_json).not.toBeNull();
    expect(pages[1].layout_json).not.toBeNull();
    expect(pages[2].layout_json).not.toBeNull();
  });

  it("fails explicitly (PAGE_COUNT_MISMATCH) when multi-page, no delimiters, no JSON", () => {
    // This is the critical scrutiny fix: instead of undercounting (returning
    // 1 page when page_count is 3), the function should throw PAGE_COUNT_MISMATCH.
    const markdown = "All content on one string";

    try {
      buildPages(markdown, null, 3);
      expect.fail("Should have thrown PAGE_COUNT_MISMATCH");
    } catch (err) {
      expect(err).toBeInstanceOf(DatalabOcrError);
      expect((err as DatalabOcrError).code).toBe("PAGE_COUNT_MISMATCH");
    }
  });

  it("fails explicitly when JSON has fewer pages than reported", () => {
    const markdown = "Page 1{PAGE_BREAK}Page 2";
    const json = buildJsonOutput(2); // Only 2 page blocks

    try {
      buildPages(markdown, json, 5); // But 5 pages reported
      expect.fail("Should have thrown PAGE_COUNT_MISMATCH");
    } catch (err) {
      expect(err).toBeInstanceOf(DatalabOcrError);
      expect((err as DatalabOcrError).code).toBe("PAGE_COUNT_MISMATCH");
    }
  });

  it("returns empty array for empty markdown", () => {
    const pages = buildPages("", null, 1);
    expect(pages).toHaveLength(0);
  });

  it("returns empty array for whitespace-only markdown", () => {
    const pages = buildPages("   \n\n  ", null, 1);
    expect(pages).toHaveLength(0);
  });

  it("builds single page with null layout when no JSON and no delimiters", () => {
    const markdown = "# Single page content";
    const pages = buildPages(markdown, null, 1);

    expect(pages).toHaveLength(1);
    expect(pages[0].page_number).toBe(1);
    expect(pages[0].ocr_markdown).toBe("# Single page content");
    expect(pages[0].layout_json).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// runOcr
// ---------------------------------------------------------------------------

describe("runOcr", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    setApiKey();
  });

  it("returns single-page result with per-page layout_json from JSON", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        success: true,
        request_id: "req-456",
        request_check_url: "https://www.datalab.to/api/v1/convert/req-456",
      }),
    );
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: "complete",
        success: true,
        markdown: "# Rechnung\n\nStromrechnung",
        page_count: 1,
        json: buildJsonOutput(1),
        metadata: { quality: 4.8 },
      }),
    );

    const result = await runOcr(createBlob(), "photo.jpg");

    expect(result.page_count).toBe(1);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].page_number).toBe(1);
    expect(result.pages[0].ocr_markdown).toBe("# Rechnung\n\nStromrechnung");
    // layout_json should be page-specific block data, NOT document metadata
    expect(result.pages[0].layout_json).not.toBeNull();
    expect((result.pages[0].layout_json as Record<string, unknown>).block_type).toBe("Page");
    // metadata is still available on the result, separate from layout_json
    expect(result.metadata).toEqual({ quality: 4.8 });
    expect(result.full_markdown).toBe("# Rechnung\n\nStromrechnung");
  });

  it("returns multi-page result with per-page layout_json (not shared metadata)", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        success: true,
        request_id: "req-789",
        request_check_url: "https://www.datalab.to/api/v1/convert/req-789",
      }),
    );
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: "complete",
        success: true,
        markdown: "Page 1{PAGE_BREAK}Page 2{PAGE_BREAK}Page 3",
        page_count: 3,
        json: buildJsonOutput(3),
        metadata: { quality: 4.2 },
      }),
    );

    const result = await runOcr(createBlob(), "doc.pdf");

    expect(result.page_count).toBe(3);
    expect(result.pages).toHaveLength(3);

    // Each page has its own page-specific layout_json
    expect(result.pages[0].page_number).toBe(1);
    expect(result.pages[0].ocr_markdown).toBe("Page 1");
    expect((result.pages[0].layout_json as Record<string, unknown>).page_id).toBe(0);

    expect(result.pages[1].page_number).toBe(2);
    expect(result.pages[1].ocr_markdown).toBe("Page 2");
    expect((result.pages[1].layout_json as Record<string, unknown>).page_id).toBe(1);

    expect(result.pages[2].page_number).toBe(3);
    expect(result.pages[2].ocr_markdown).toBe("Page 3");
    expect((result.pages[2].layout_json as Record<string, unknown>).page_id).toBe(2);

    // layout_json is NOT the document-level metadata
    expect(result.pages[0].layout_json).not.toEqual(result.metadata);
    expect(result.full_markdown).toBe("Page 1\n\nPage 2\n\nPage 3");
  });

  it("creates all pages from JSON when markdown lacks {PAGE_BREAK}", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        success: true,
        request_id: "req-nobreak",
        request_check_url: "https://www.datalab.to/api/v1/convert/req-nobreak",
      }),
    );
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: "complete",
        success: true,
        // Multi-page but no {PAGE_BREAK} delimiters in markdown
        markdown: "All content without any page break delimiters",
        page_count: 3,
        json: buildJsonOutput(3),
        metadata: { quality: 3.9 },
      }),
    );

    const result = await runOcr(createBlob(), "multi.pdf");

    // Should have 3 pages (one per page), NOT 1 (undercounting)
    expect(result.page_count).toBe(3);
    expect(result.pages).toHaveLength(3);
    // Page 1 gets the full markdown; pages 2-3 get empty markdown
    expect(result.pages[0].ocr_markdown).toBe("All content without any page break delimiters");
    expect(result.pages[1].ocr_markdown).toBe("");
    expect(result.pages[2].ocr_markdown).toBe("");
    // All pages have per-page layout from JSON
    expect(result.pages[0].layout_json).not.toBeNull();
    expect(result.pages[1].layout_json).not.toBeNull();
    expect(result.pages[2].layout_json).not.toBeNull();
  });

  it("throws PAGE_COUNT_MISMATCH when multi-page, no {PAGE_BREAK}, no JSON", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        success: true,
        request_id: "req-mismatch",
        request_check_url: "https://www.datalab.to/api/v1/convert/req-mismatch",
      }),
    );
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: "complete",
        success: true,
        // Multi-page but no delimiters and no JSON layout data
        markdown: "All content without delimiters",
        page_count: 3,
        metadata: { quality: 3.0 },
      }),
    );

    try {
      await runOcr(createBlob(), "problematic.pdf");
      expect.fail("Should have thrown PAGE_COUNT_MISMATCH");
    } catch (err) {
      expect(err).toBeInstanceOf(DatalabOcrError);
      expect((err as DatalabOcrError).code).toBe("PAGE_COUNT_MISMATCH");
    }
  });

  it("propagates DatalabOcrError when submit fails", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ detail: "Bad" }, { status: 401 }));

    try {
      await runOcr(createBlob(), "test.pdf");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DatalabOcrError);
      expect((err as DatalabOcrError).code).toBe("DATALAB_AUTH_ERROR");
    }
  });

  it("propagates DatalabOcrError when poll fails", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        success: true,
        request_id: "req-fail",
        request_check_url: "https://www.datalab.to/api/v1/convert/req-fail",
      }),
    );
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: "failed", error: "Conversion error" }),
    );

    try {
      await runOcr(createBlob(), "test.pdf");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DatalabOcrError);
      expect((err as DatalabOcrError).code).toBe("DATALAB_CONVERSION_FAILED");
    }
  });

  it("handles empty markdown gracefully", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        success: true,
        request_id: "req-empty",
        request_check_url: "https://www.datalab.to/api/v1/convert/req-empty",
      }),
    );
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: "complete",
        success: true,
        markdown: "",
        page_count: 1,
      }),
    );

    const result = await runOcr(createBlob(), "blank.pdf");

    expect(result.page_count).toBe(0);
    expect(result.pages).toHaveLength(0);
    expect(result.full_markdown).toBe("");
  });
});

// ---------------------------------------------------------------------------
// DatalabOcrError
// ---------------------------------------------------------------------------

describe("DatalabOcrError", () => {
  it("creates an error with message, code, and statusCode", () => {
    const err = new DatalabOcrError("Test error", "TEST_CODE", 502);
    expect(err.message).toBe("Test error");
    expect(err.code).toBe("TEST_CODE");
    expect(err.statusCode).toBe(502);
    expect(err.name).toBe("DatalabOcrError");
  });

  it("creates an error without statusCode", () => {
    const err = new DatalabOcrError("Test error", "TEST_CODE");
    expect(err.message).toBe("Test error");
    expect(err.code).toBe("TEST_CODE");
    expect(err.statusCode).toBeUndefined();
  });
});
