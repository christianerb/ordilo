import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the OpenAI module.
// We replace the default export with a mock class that has a
// chat.completions.create method we control per-test.
const mockCreate = vi.fn();
vi.mock("openai", () => {
  // Reproduce a minimal APIError shape for testing error handling.
  class MockAPIError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
      super(message);
      this.name = "APIError";
      this.status = status;
    }
  }
  // Mock OpenAI class — must be a class (not arrow function) so `new` works.
  // APIError is a static property on the real OpenAI class, so we add it
  // here too for the `instanceof OpenAI.APIError` check in extraction.ts.
  class MockOpenAI {
    static APIError = MockAPIError;
    chat: { completions: { create: typeof mockCreate } };
    constructor(_config: { apiKey: string }) {
      void _config; // Intentionally unused — just matches real constructor signature.
      this.chat = {
        completions: {
          create: mockCreate,
        },
      };
    }
  }
  return {
    default: MockOpenAI,
    APIError: MockAPIError,
  };
});

import {
  buildSystemPrompt,
  runExtraction,
  ExtractionError,
} from "@/lib/ai/extraction";
import type { FamilyContext, DocumentAnalysis } from "@/lib/schemas/extraction";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setApiKey(key: string = "test-openai-key") {
  process.env.OPENAI_API_KEY = key;
}

function clearApiKey() {
  delete process.env.OPENAI_API_KEY;
}

/** Create a valid family context for testing. */
function validFamilyContext(): FamilyContext {
  return {
    members: [
      { id: "member-1", name: "Emma", role: "Kind" },
      { id: "member-2", name: "Hanna", role: "Kind" },
      { id: "member-3", name: "Thomas", role: "Vater" },
    ],
    categories: ["Kita", "Rechnungen", "Arztbriefe"],
    knowledgeNodes: [
      { type: "organization", label: "Kita Sonnenblume" },
      { type: "organization", label: "Kinderarztpraxis Dr. Müller" },
    ],
  };
}

/** Create a valid DocumentAnalysis object. */
function validAnalysis(): DocumentAnalysis {
  return {
    document_type: "letter",
    title: "Einladung zum Elternabend",
    summary: "Elternabend in der Kita Sonnenblume am 15. Juli 2026.",
    family_members: [
      { person_id: "member-1", name: "Emma", confidence: 0.95 },
    ],
    organizations: [
      { name: "Kita Sonnenblume", type: "Kita", confidence: 0.9 },
    ],
    dates: [
      { date: "2026-07-15", type: "event", label: "Elternabend", confidence: 0.88 },
    ],
    amounts: [],
    tasks: [
      { title: "Elternabend besuchen", due_date: "2026-07-15", priority: "medium", confidence: 0.8 },
    ],
    suggested_category: "Kita",
    tags: ["Elternabend", "Kita"],
    needs_user_review: false,
  };
}

/** Create a mock OpenAI chat completion response. */
function mockChatResponse(content: string) {
  return {
    choices: [
      {
        message: {
          content,
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// buildSystemPrompt
// ---------------------------------------------------------------------------

describe("buildSystemPrompt", () => {
  it("includes the assistant role description", () => {
    const prompt = buildSystemPrompt({
      members: [],
      categories: [],
      knowledgeNodes: [],
    });
    expect(prompt).toContain("Ordilo");
    expect(prompt).toContain("Familienassistent");
  });

  it("includes family members with names and roles", () => {
    const prompt = buildSystemPrompt(validFamilyContext());
    expect(prompt).toContain("Emma");
    expect(prompt).toContain("Hanna");
    expect(prompt).toContain("Thomas");
    expect(prompt).toContain("Kind");
    expect(prompt).toContain("Vater");
  });

  it("includes member IDs for person matching", () => {
    const prompt = buildSystemContextWithIds();
    expect(prompt).toContain("member-1");
    expect(prompt).toContain("member-2");
  });

  it("includes existing categories", () => {
    const prompt = buildSystemPrompt(validFamilyContext());
    expect(prompt).toContain("Kita");
    expect(prompt).toContain("Rechnungen");
    expect(prompt).toContain("Arztbriefe");
  });

  it("includes knowledge nodes", () => {
    const prompt = buildSystemPrompt(validFamilyContext());
    expect(prompt).toContain("Kita Sonnenblume");
    expect(prompt).toContain("Kinderarztpraxis Dr. Müller");
  });

  it("handles empty family context gracefully", () => {
    const prompt = buildSystemPrompt({
      members: [],
      categories: [],
      knowledgeNodes: [],
    });
    expect(prompt).toContain("keine bekannt");
    // Should not crash, should still include extraction instructions.
    expect(prompt).toContain("Dokumenttyp");
  });

  it("includes German language instruction", () => {
    const prompt = buildSystemPrompt(validFamilyContext());
    expect(prompt).toContain("deutsch");
  });

  it("includes document type enum values in instructions", () => {
    const prompt = buildSystemPrompt(validFamilyContext());
    expect(prompt).toContain("invoice");
    expect(prompt).toContain("letter");
    expect(prompt).toContain("medical");
    expect(prompt).toContain("school");
  });

  it("handles members without roles", () => {
    const prompt = buildSystemPrompt({
      members: [{ id: "m1", name: "Emma", role: null }],
      categories: [],
      knowledgeNodes: [],
    });
    expect(prompt).toContain("Emma");
    // Should not contain "null" or "undefined" for the role.
    expect(prompt).not.toContain("(null)");
    expect(prompt).not.toContain("(undefined)");
  });
});

// Helper for the ID test.
function buildSystemContextWithIds(): string {
  return buildSystemPrompt(validFamilyContext());
}

// ---------------------------------------------------------------------------
// runExtraction
// ---------------------------------------------------------------------------

describe("runExtraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setApiKey();
  });

  it("returns validated analysis on success", async () => {
    const analysis = validAnalysis();
    mockCreate.mockResolvedValueOnce(
      mockChatResponse(JSON.stringify(analysis)),
    );

    const result = await runExtraction("OCR markdown text", validFamilyContext());

    expect(result.document_type).toBe("letter");
    expect(result.title).toBe("Einladung zum Elternabend");
    expect(result.family_members).toHaveLength(1);
    expect(result.tasks).toHaveLength(1);
  });

  it("calls OpenAI with correct model and strict json_schema", async () => {
    const analysis = validAnalysis();
    mockCreate.mockResolvedValueOnce(
      mockChatResponse(JSON.stringify(analysis)),
    );

    await runExtraction("OCR text", validFamilyContext());

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe("gpt-5.4-mini");
    expect(callArgs.response_format.type).toBe("json_schema");
    expect(callArgs.response_format.json_schema.strict).toBe(true);
    expect(callArgs.response_format.json_schema.name).toBe("document_analysis");
  });

  it("includes system prompt with family context in messages", async () => {
    const analysis = validAnalysis();
    mockCreate.mockResolvedValueOnce(
      mockChatResponse(JSON.stringify(analysis)),
    );

    await runExtraction("OCR text", validFamilyContext());

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages).toHaveLength(2);
    expect(callArgs.messages[0].role).toBe("system");
    expect(callArgs.messages[0].content).toContain("Emma");
    expect(callArgs.messages[1].role).toBe("user");
    expect(callArgs.messages[1].content).toBe("OCR text");
  });

  it("throws ExtractionError when API key is missing", async () => {
    clearApiKey();

    await expect(
      runExtraction("OCR text", validFamilyContext()),
    ).rejects.toThrow(ExtractionError);

    try {
      clearApiKey();
      await runExtraction("OCR text", validFamilyContext());
    } catch (err) {
      expect(err).toBeInstanceOf(ExtractionError);
      expect((err as ExtractionError).code).toBe("OPENAI_NOT_CONFIGURED");
    }
  });

  it("throws ExtractionError on empty response content", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
    });

    await expect(
      runExtraction("OCR text", validFamilyContext()),
    ).rejects.toThrow(ExtractionError);

    try {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: null } }],
      });
      await runExtraction("OCR text", validFamilyContext());
    } catch (err) {
      expect((err as ExtractionError).code).toBe("OPENAI_EMPTY_RESPONSE");
    }
  });

  it("throws ExtractionError on invalid JSON response", async () => {
    mockCreate.mockResolvedValueOnce(
      mockChatResponse("not valid json {{{"),
    );

    await expect(
      runExtraction("OCR text", validFamilyContext()),
    ).rejects.toThrow(ExtractionError);

    try {
      mockCreate.mockResolvedValueOnce(
        mockChatResponse("also not json"),
      );
      await runExtraction("OCR text", validFamilyContext());
    } catch (err) {
      expect((err as ExtractionError).code).toBe("OPENAI_INVALID_JSON");
    }
  });

  it("throws ExtractionError on schema validation failure", async () => {
    // Valid JSON but wrong schema — document_type not in enum.
    mockCreate.mockResolvedValueOnce(
      mockChatResponse(
        JSON.stringify({ ...validAnalysis(), document_type: "blog" }),
      ),
    );

    await expect(
      runExtraction("OCR text", validFamilyContext()),
    ).rejects.toThrow(ExtractionError);

    try {
      mockCreate.mockResolvedValueOnce(
        mockChatResponse(
          JSON.stringify({ ...validAnalysis(), document_type: "blog" }),
        ),
      );
      await runExtraction("OCR text", validFamilyContext());
    } catch (err) {
      expect((err as ExtractionError).code).toBe(
        "OPENAI_SCHEMA_VALIDATION_FAILED",
      );
    }
  });

  it("throws ExtractionError on OpenAI auth error (401)", async () => {
    const { APIError } = await import("openai");
    // Cast to match our mock constructor signature (message, status).
    const MockErr = APIError as unknown as new (msg: string, status?: number) => Error;
    mockCreate.mockRejectedValueOnce(
      new MockErr("Unauthorized", 401),
    );

    try {
      await runExtraction("OCR text", validFamilyContext());
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ExtractionError);
      expect((err as ExtractionError).code).toBe("OPENAI_AUTH_ERROR");
    }
  });

  it("throws ExtractionError on OpenAI rate limit (429)", async () => {
    const { APIError } = await import("openai");
    const MockErr = APIError as unknown as new (msg: string, status?: number) => Error;
    mockCreate.mockRejectedValueOnce(
      new MockErr("Rate limited", 429),
    );

    try {
      await runExtraction("OCR text", validFamilyContext());
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ExtractionError);
      expect((err as ExtractionError).code).toBe("OPENAI_RATE_LIMITED");
    }
  });

  it("throws ExtractionError on generic OpenAI API error", async () => {
    const { APIError } = await import("openai");
    const MockErr = APIError as unknown as new (msg: string, status?: number) => Error;
    mockCreate.mockRejectedValueOnce(
      new MockErr("Internal error", 500),
    );

    try {
      await runExtraction("OCR text", validFamilyContext());
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ExtractionError);
      expect((err as ExtractionError).code).toBe("OPENAI_API_ERROR");
    }
  });

  it("throws ExtractionError on network error (non-APIError)", async () => {
    mockCreate.mockRejectedValueOnce(new Error("fetch failed"));

    try {
      await runExtraction("OCR text", validFamilyContext());
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ExtractionError);
      expect((err as ExtractionError).code).toBe("OPENAI_NETWORK_ERROR");
    }
  });

  it("does not include the API key in the response or error message", async () => {
    setApiKey("sk-secret-key-12345");
    mockCreate.mockResolvedValueOnce(
      mockChatResponse(JSON.stringify(validAnalysis())),
    );

    const result = await runExtraction("OCR text", validFamilyContext());

    // The analysis result should not contain the key.
    expect(JSON.stringify(result)).not.toContain("sk-secret-key-12345");
  });
});

// ---------------------------------------------------------------------------
// ExtractionError
// ---------------------------------------------------------------------------

describe("ExtractionError", () => {
  it("stores message, code, and statusCode", () => {
    const err = new ExtractionError("Test error", "TEST_CODE", 500);
    expect(err.message).toBe("Test error");
    expect(err.code).toBe("TEST_CODE");
    expect(err.statusCode).toBe(500);
    expect(err.name).toBe("ExtractionError");
  });

  it("works without statusCode", () => {
    const err = new ExtractionError("Test error", "TEST_CODE");
    expect(err.statusCode).toBeUndefined();
  });
});
