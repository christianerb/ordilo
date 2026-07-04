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

  it("falls back to single page when no delimiters but page_count > 1", () => {
    const md = "All content on one string";
    const result = splitMarkdownByPages(md, 3);
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
    expect(formData.get("output_format")).toBe("markdown");
    expect(formData.get("use_llm")).toBe("true");
    expect(formData.get("paginate")).toBe("true");
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
// runOcr
// ---------------------------------------------------------------------------

describe("runOcr", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    setApiKey();
  });

  it("returns single-page result for a photo (no page delimiter)", async () => {
    // Submit returns request_id.
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        success: true,
        request_id: "req-456",
        request_check_url: "https://www.datalab.to/api/v1/convert/req-456",
      }),
    );
    // Poll returns complete with single page.
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: "complete",
        success: true,
        markdown: "# Rechnung\n\nStromrechnung",
        page_count: 1,
        metadata: { quality: 4.8 },
      }),
    );

    const result = await runOcr(createBlob(), "photo.jpg");

    expect(result.page_count).toBe(1);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].page_number).toBe(1);
    expect(result.pages[0].ocr_markdown).toBe("# Rechnung\n\nStromrechnung");
    expect(result.full_markdown).toBe("# Rechnung\n\nStromrechnung");
    expect(result.metadata).toEqual({ quality: 4.8 });
  });

  it("returns multi-page result for a PDF with page delimiters", async () => {
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
        metadata: { quality: 4.2 },
      }),
    );

    const result = await runOcr(createBlob(), "doc.pdf");

    expect(result.page_count).toBe(3);
    expect(result.pages).toHaveLength(3);
    expect(result.pages[0].page_number).toBe(1);
    expect(result.pages[0].ocr_markdown).toBe("Page 1");
    expect(result.pages[1].page_number).toBe(2);
    expect(result.pages[1].ocr_markdown).toBe("Page 2");
    expect(result.pages[2].page_number).toBe(3);
    expect(result.pages[2].ocr_markdown).toBe("Page 3");
    expect(result.full_markdown).toBe("Page 1\n\nPage 2\n\nPage 3");
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
