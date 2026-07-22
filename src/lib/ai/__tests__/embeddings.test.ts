import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the OpenAI module.
const mockCreate = vi.fn();
vi.mock("openai", () => {
  class MockAPIError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
      super(message);
      this.name = "APIError";
      this.status = status;
    }
  }
  class MockOpenAI {
    static APIError = MockAPIError;
    embeddings: { create: typeof mockCreate };
    constructor(_config: { apiKey: string }) {
      void _config;
      this.embeddings = {
        create: mockCreate,
      };
    }
  }
  return {
    default: MockOpenAI,
    APIError: MockAPIError,
  };
});

import {
  chunkText,
  chunkPages,
  generateEmbeddings,
  generateQueryEmbedding,
  embeddingToVectorString,
  EmbeddingError,
  EMBEDDING_DIMENSIONS,
} from "@/lib/ai/embeddings";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setApiKey(key: string = "test-openai-key") {
  process.env.OPENAI_API_KEY = key;
}

function clearApiKey() {
  delete process.env.OPENAI_API_KEY;
}

/** Generate a fake embedding vector of the given dimension. */
function fakeEmbedding(dim: number = EMBEDDING_DIMENSIONS): number[] {
  return Array.from({ length: dim }, (_, i) => i * 0.001);
}

/** Create a mock OpenAI embeddings response. */
function mockEmbeddingsResponse(inputs: string[], dim: number = EMBEDDING_DIMENSIONS) {
  return {
    data: inputs.map((_, index) => ({
      index,
      object: "embedding" as const,
      embedding: fakeEmbedding(dim),
    })),
  };
}

// ---------------------------------------------------------------------------
// chunkText
// ---------------------------------------------------------------------------

describe("chunkText", () => {
  it("returns empty array for empty string", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(chunkText("   \n\n\t  ")).toEqual([]);
  });

  it("returns single chunk for text shorter than chunk size", () => {
    const text = "This is a short text.";
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(text);
    expect(chunks[0].index).toBe(0);
  });

  it("splits long text into multiple chunks", () => {
    // Create text longer than the default chunk size (2000 chars).
    const word = "word ";
    const text = word.repeat(600); // ~3000 chars
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("chunks have contiguous indices starting at 0", () => {
    const text = "word ".repeat(600);
    const chunks = chunkText(text);
    chunks.forEach((c, i) => {
      expect(c.index).toBe(i);
    });
  });

  it("creates overlap between chunks", () => {
    // Create text long enough for multiple chunks.
    const text = Array.from({ length: 600 }, (_, i) => `word${i}`).join(" ");
    const chunks = chunkText(text);

    if (chunks.length < 2) return; // Guard: need at least 2 chunks.

    // The overlap means the end of chunk[i-1] should appear near the
    // start of chunk[i]. We check that some words from the end of the
    // first chunk appear in the second chunk.
    const firstChunkWords = chunks[0].text.split(" ");
    const secondChunkWords = chunks[1].text.split(" ");
    const lastWordsOfFirst = firstChunkWords.slice(-5);

    // At least one of the last words of the first chunk should appear
    // in the second chunk (due to overlap).
    const overlapFound = lastWordsOfFirst.some((w) =>
      secondChunkWords.includes(w),
    );
    expect(overlapFound).toBe(true);
  });

  it("breaks at word boundaries (does not split words)", () => {
    // Create text with clear word boundaries near the chunk size.
    // Chunk size is 2000 chars. Put a space at position ~1995 so the
    // chunker should break there rather than mid-word.
    const word1 = "a".repeat(1990);
    const word2 = "wordboundary";
    const word3 = "b".repeat(100);
    const text = `${word1} ${word2} ${word3}`;
    const chunks = chunkText(text);

    // The first chunk should end at the space before "wordboundary",
    // not in the middle of "a".repeat(1990).
    // After trimming, the first chunk should not contain a partial "wordboundary".
    expect(chunks[0].text).not.toContain("wordbounda");
    expect(chunks[0].text).not.toMatch(/a{1990}w/); // No "a"s joined to "w"
  });

  it("handles custom chunk and overlap sizes", () => {
    const text = "word ".repeat(100); // ~500 chars
    const chunks = chunkText(text, 50, 5); // 200 chars per chunk, 20 overlap
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("handles text with newlines and special characters", () => {
    const text = "Line 1\nLine 2\nLine 3\n" + "x".repeat(2100);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].text).toContain("Line 1");
  });

  it("does not produce empty chunks", () => {
    const text = "x".repeat(5000);
    const chunks = chunkText(text);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// chunkPages
// ---------------------------------------------------------------------------

describe("chunkPages", () => {
  it("returns empty array for no pages", () => {
    expect(chunkPages([])).toEqual([]);
  });

  it("returns empty array when all pages are empty", () => {
    expect(chunkPages([
      { text: "", page_number: 1 },
      { text: "   ", page_number: 2 },
    ])).toEqual([]);
  });

  it("produces a single chunk for a single short page", () => {
    const chunks = chunkPages([
      { text: "Short page text", page_number: 1 },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("Short page text");
    expect(chunks[0].page_number).toBe(1);
    expect(chunks[0].index).toBe(0);
  });

  it("preserves page_number across multiple pages", () => {
    const chunks = chunkPages([
      { text: "Page one content", page_number: 1 },
      { text: "Page two content", page_number: 2 },
      { text: "Page three content", page_number: 3 },
    ]);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].page_number).toBe(1);
    expect(chunks[1].page_number).toBe(2);
    expect(chunks[2].page_number).toBe(3);
  });

  it("assigns global continuous indices across pages", () => {
    const chunks = chunkPages([
      { text: "Page one content", page_number: 1 },
      { text: "Page two content", page_number: 2 },
    ]);
    expect(chunks[0].index).toBe(0);
    expect(chunks[1].index).toBe(1);
  });

  it("handles a long page that produces multiple chunks, all with same page_number", () => {
    const longText = "x ".repeat(3000); // > 2000 chars → multiple chunks
    const chunks = chunkPages([
      { text: longText, page_number: 5 },
    ]);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.page_number).toBe(5);
    }
    // Indices should be continuous.
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].index).toBe(i);
    }
  });

  it("assigns continuous global indices across multi-chunk pages", () => {
    const longText = "x ".repeat(3000);
    const chunks = chunkPages([
      { text: longText, page_number: 1 },
      { text: "short page", page_number: 2 },
    ]);
    // First page produces multiple chunks, second page produces one.
    const firstPageChunkCount = chunks.filter((c) => c.page_number === 1).length;
    expect(firstPageChunkCount).toBeGreaterThan(1);
    // Global indices should be continuous.
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].index).toBe(i);
    }
    // The last chunk should be from page 2.
    expect(chunks[chunks.length - 1].page_number).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// generateEmbeddings
// ---------------------------------------------------------------------------

describe("generateEmbeddings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setApiKey();
  });

  it("returns empty array for no chunks", async () => {
    const result = await generateEmbeddings([]);
    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns embeddings for a single chunk", async () => {
    const chunks = chunkText("This is a test document.");
    mockCreate.mockResolvedValueOnce(mockEmbeddingsResponse(["This is a test document."]));

    const result = await generateEmbeddings(chunks);

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it("calls OpenAI with correct model and input", async () => {
    const chunks = chunkText("Test text for embedding.");
    mockCreate.mockResolvedValueOnce(mockEmbeddingsResponse(["Test text for embedding."]));

    await generateEmbeddings(chunks);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe("text-embedding-3-large");
    expect(callArgs.input).toBeInstanceOf(Array);
    expect(callArgs.input.length).toBe(chunks.length);
    expect(callArgs.dimensions).toBe(EMBEDDING_DIMENSIONS);
  });

  it("returns embeddings in correct order for multiple chunks", async () => {
    const chunks = [
      { text: "chunk zero", index: 0 },
      { text: "chunk one", index: 1 },
      { text: "chunk two", index: 2 },
    ];
    mockCreate.mockResolvedValueOnce(mockEmbeddingsResponse(["chunk zero", "chunk one", "chunk two"]));

    const result = await generateEmbeddings(chunks);

    expect(result).toHaveLength(3);
    // Each result should be an array of numbers.
    for (const emb of result) {
      expect(Array.isArray(emb)).toBe(true);
      expect(emb).toHaveLength(EMBEDDING_DIMENSIONS);
    }
  });

  it("throws EmbeddingError when API key is missing", async () => {
    clearApiKey();
    const chunks = chunkText("test");

    await expect(generateEmbeddings(chunks)).rejects.toThrow(EmbeddingError);

    try {
      clearApiKey();
      await generateEmbeddings(chunks);
    } catch (err) {
      expect((err as EmbeddingError).code).toBe("OPENAI_NOT_CONFIGURED");
    }
  });

  it("throws EmbeddingError on OpenAI auth error (401)", async () => {
    const { APIError } = await import("openai");
    const MockErr = APIError as unknown as new (msg: string, status?: number) => Error;
    mockCreate.mockRejectedValueOnce(new MockErr("Unauthorized", 401));

    const chunks = chunkText("test");
    try {
      await generateEmbeddings(chunks);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(EmbeddingError);
      expect((err as EmbeddingError).code).toBe("OPENAI_AUTH_ERROR");
    }
  });

  it("throws EmbeddingError on OpenAI rate limit (429)", async () => {
    const { APIError } = await import("openai");
    const MockErr = APIError as unknown as new (msg: string, status?: number) => Error;
    mockCreate.mockRejectedValueOnce(new MockErr("Rate limited", 429));

    const chunks = chunkText("test");
    try {
      await generateEmbeddings(chunks);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(EmbeddingError);
      expect((err as EmbeddingError).code).toBe("OPENAI_RATE_LIMITED");
    }
  });

  it("throws EmbeddingError on generic OpenAI API error", async () => {
    const { APIError } = await import("openai");
    const MockErr = APIError as unknown as new (msg: string, status?: number) => Error;
    mockCreate.mockRejectedValueOnce(new MockErr("Internal error", 500));

    const chunks = chunkText("test");
    try {
      await generateEmbeddings(chunks);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(EmbeddingError);
      expect((err as EmbeddingError).code).toBe("OPENAI_API_ERROR");
    }
  });

  it("throws EmbeddingError on network error (non-APIError)", async () => {
    mockCreate.mockRejectedValueOnce(new Error("fetch failed"));

    const chunks = chunkText("test");
    try {
      await generateEmbeddings(chunks);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(EmbeddingError);
      expect((err as EmbeddingError).code).toBe("OPENAI_NETWORK_ERROR");
    }
  });

  it("throws EmbeddingError on wrong dimensionality", async () => {
    const chunks = chunkText("test");
    // Return 512-dim instead of 1536.
    mockCreate.mockResolvedValueOnce({
      data: [{ index: 0, object: "embedding", embedding: fakeEmbedding(512) }],
    });

    try {
      await generateEmbeddings(chunks);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(EmbeddingError);
      expect((err as EmbeddingError).code).toBe("OPENAI_INVALID_DIMENSIONS");
    }
  });

  it("does not include the API key in the result or error", async () => {
    setApiKey("sk-secret-embeddings-key");
    const chunks = chunkText("test");
    mockCreate.mockResolvedValueOnce(mockEmbeddingsResponse(["test"]));

    const result = await generateEmbeddings(chunks);

    expect(JSON.stringify(result)).not.toContain("sk-secret-embeddings-key");
  });

  it("batches large numbers of chunks", async () => {
    // Create 150 chunks (more than MAX_BATCH_SIZE=100).
    const chunks = Array.from({ length: 150 }, (_, i) => ({
      text: `chunk ${i}`,
      index: i,
    }));

    // Mock two batch responses.
    mockCreate.mockResolvedValueOnce(
      mockEmbeddingsResponse(Array.from({ length: 100 }, (_, i) => `chunk ${i}`)),
    );
    mockCreate.mockResolvedValueOnce(
      mockEmbeddingsResponse(Array.from({ length: 50 }, (_, i) => `chunk ${i + 100}`)),
    );

    const result = await generateEmbeddings(chunks);

    expect(result).toHaveLength(150);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// generateQueryEmbedding
// ---------------------------------------------------------------------------

describe("generateQueryEmbedding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setApiKey();
  });

  it("returns a 1536-dimensional embedding for a valid query", async () => {
    mockCreate.mockResolvedValueOnce(
      mockEmbeddingsResponse(["Stromrechnung"]),
    );

    const result = await generateQueryEmbedding("Stromrechnung");

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it("calls OpenAI with the correct model", async () => {
    mockCreate.mockResolvedValueOnce(
      mockEmbeddingsResponse(["test query"]),
    );

    await generateQueryEmbedding("test query");

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe("text-embedding-3-large");
    expect(callArgs.input).toBeInstanceOf(Array);
    expect(callArgs.input).toHaveLength(1);
    expect(callArgs.dimensions).toBe(EMBEDDING_DIMENSIONS);
  });

  it("trims whitespace from the query before embedding", async () => {
    mockCreate.mockResolvedValueOnce(
      mockEmbeddingsResponse(["Stromrechnung"]),
    );

    await generateQueryEmbedding("  Stromrechnung  ");

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.input[0]).toBe("Stromrechnung");
  });

  it("throws EmbeddingError for empty query", async () => {
    await expect(generateQueryEmbedding("")).rejects.toThrow(EmbeddingError);
    try {
      await generateQueryEmbedding("");
    } catch (err) {
      expect((err as EmbeddingError).code).toBe("EMPTY_QUERY");
    }
  });

  it("throws EmbeddingError for whitespace-only query", async () => {
    await expect(generateQueryEmbedding("   ")).rejects.toThrow(EmbeddingError);
    try {
      await generateQueryEmbedding("   ");
    } catch (err) {
      expect((err as EmbeddingError).code).toBe("EMPTY_QUERY");
    }
  });

  it("does not call OpenAI for empty query", async () => {
    try {
      await generateQueryEmbedding("");
    } catch {
      // expected
    }
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("propagates OpenAI API errors as EmbeddingError", async () => {
    const { APIError } = await import("openai");
    const MockErr = APIError as unknown as new (msg: string, status?: number) => Error;
    mockCreate.mockRejectedValueOnce(new MockErr("Unauthorized", 401));

    try {
      await generateQueryEmbedding("test");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(EmbeddingError);
      expect((err as EmbeddingError).code).toBe("OPENAI_AUTH_ERROR");
    }
  });

  it("does not expose the API key in the result", async () => {
    setApiKey("sk-secret-query-key");
    mockCreate.mockResolvedValueOnce(
      mockEmbeddingsResponse(["test"]),
    );

    const result = await generateQueryEmbedding("test");

    expect(JSON.stringify(result)).not.toContain("sk-secret-query-key");
  });
});

// ---------------------------------------------------------------------------
// embeddingToVectorString
// ---------------------------------------------------------------------------

describe("embeddingToVectorString", () => {
  it("converts an embedding array to pgvector string format", () => {
    const embedding = [0.1, 0.2, 0.3];
    const result = embeddingToVectorString(embedding);
    expect(result).toBe("[0.1,0.2,0.3]");
  });

  it("handles single-element array", () => {
    const result = embeddingToVectorString([0.5]);
    expect(result).toBe("[0.5]");
  });

  it("handles empty array", () => {
    const result = embeddingToVectorString([]);
    expect(result).toBe("[]");
  });

  it("handles 1536-dimensional array", () => {
    const embedding = Array.from({ length: 1536 }, (_, i) => i * 0.001);
    const result = embeddingToVectorString(embedding);
    expect(result.startsWith("[")).toBe(true);
    expect(result.endsWith("]")).toBe(true);
    expect(result.split(",").length).toBe(1536);
  });
});

// ---------------------------------------------------------------------------
// EmbeddingError
// ---------------------------------------------------------------------------

describe("EmbeddingError", () => {
  it("stores message, code, and statusCode", () => {
    const err = new EmbeddingError("Test error", "TEST_CODE", 500);
    expect(err.message).toBe("Test error");
    expect(err.code).toBe("TEST_CODE");
    expect(err.statusCode).toBe(500);
    expect(err.name).toBe("EmbeddingError");
  });

  it("works without statusCode", () => {
    const err = new EmbeddingError("Test error", "TEST_CODE");
    expect(err.statusCode).toBeUndefined();
  });
});
