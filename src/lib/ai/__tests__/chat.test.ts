import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the OpenAI module.
// We replace the default export with a mock class that has a
// chat.completions.create method we control per-test via `mockCreate`.
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
  // Mock OpenAI class — must be a class so `new` works.
  // APIError is a static property on the real OpenAI class, so we add it
  // here for the `instanceof OpenAI.APIError` check in chat.ts.
  class MockOpenAI {
    static APIError = MockAPIError;
    chat: { completions: { create: typeof mockCreate } };
    constructor(_config: { apiKey: string }) {
      void _config;
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
  combineSearchResults,
  buildChatSystemPrompt,
  buildChatUserMessage,
  generateChatAnswer,
  ChatError,
} from "@/lib/ai/chat";
import { NO_RESULTS_FALLBACK } from "@/lib/schemas/chat";
import type { SearchResult } from "@/lib/schemas/search";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setApiKey(key: string = "test-openai-key") {
  process.env.OPENAI_API_KEY = key;
}

function clearApiKey() {
  delete process.env.OPENAI_API_KEY;
}

function makeSemanticResult(
  docId: string,
  title: string,
  chunkText: string,
  score: number,
): SearchResult {
  return {
    document_id: docId,
    title,
    chunk_text: chunkText,
    score,
    source: "semantic",
  };
}

function makeGraphPersonResult(
  docId: string,
  title: string,
  personName: string,
  score: number,
): SearchResult {
  return {
    document_id: docId,
    title,
    chunk_text: `Person: ${personName}`,
    score,
    source: "graph:person",
  };
}

function makeGraphTaskResult(
  docId: string,
  title: string,
  taskTitle: string,
  score: number,
): SearchResult {
  return {
    document_id: docId,
    title,
    chunk_text: `Aufgabe: ${taskTitle}`,
    score,
    source: "graph:task",
  };
}

function mockChatResponse(content: string): {
  choices: { message: { content: string } }[];
} {
  return {
    choices: [{ message: { content } }],
  };
}

// ---------------------------------------------------------------------------
// combineSearchResults
// ---------------------------------------------------------------------------

describe("combineSearchResults", () => {
  it("returns empty array when both inputs are empty", () => {
    expect(combineSearchResults([], [])).toEqual([]);
  });

  it("returns semantic results when graph results are empty", () => {
    const semantic = [
      makeSemanticResult("doc-1", "Stromrechnung", "Betrag: 45 EUR", 0.85),
    ];
    const result = combineSearchResults(semantic, []);
    expect(result).toHaveLength(1);
    expect(result[0].document_id).toBe("doc-1");
    expect(result[0].excerpt).toBe("Betrag: 45 EUR");
    expect(result[0].score).toBe(0.85);
  });

  it("returns graph results when semantic results are empty", () => {
    const graph = [
      makeGraphPersonResult("doc-1", "Kita-Brief", "Emma", 0.9),
    ];
    const result = combineSearchResults([], graph);
    expect(result).toHaveLength(1);
    expect(result[0].document_id).toBe("doc-1");
    expect(result[0].excerpt).toBe("Person: Emma");
  });

  it("deduplicates by document_id when both searches find the same document", () => {
    const semantic = [
      makeSemanticResult("doc-1", "Kita-Brief", "Einschulung Emma", 0.85),
    ];
    const graph = [
      makeGraphPersonResult("doc-1", "Kita-Brief", "Emma", 0.95),
    ];
    const result = combineSearchResults(semantic, graph);

    expect(result).toHaveLength(1);
    expect(result[0].document_id).toBe("doc-1");
    // Should prefer the semantic excerpt (document content) over graph metadata
    expect(result[0].excerpt).toBe("Einschulung Emma");
    // Should take the max score
    expect(result[0].score).toBe(0.95);
  });

  it("includes documents from both semantic and graph results", () => {
    const semantic = [
      makeSemanticResult("doc-1", "Stromrechnung", "Betrag: 45 EUR", 0.8),
    ];
    const graph = [
      makeGraphPersonResult("doc-2", "Kita-Brief", "Emma", 0.9),
    ];
    const result = combineSearchResults(semantic, graph);

    expect(result).toHaveLength(2);
    const docIds = result.map((s) => s.document_id);
    expect(docIds).toContain("doc-1");
    expect(docIds).toContain("doc-2");
  });

  it("sorts results by score descending", () => {
    const semantic = [
      makeSemanticResult("doc-1", "A", "text a", 0.5),
      makeSemanticResult("doc-2", "B", "text b", 0.9),
      makeSemanticResult("doc-3", "C", "text c", 0.7),
    ];
    const result = combineSearchResults(semantic, []);

    expect(result[0].score).toBe(0.9);
    expect(result[1].score).toBe(0.7);
    expect(result[2].score).toBe(0.5);
  });

  it("prefers semantic excerpt even when graph score is higher", () => {
    const semantic = [
      makeSemanticResult("doc-1", "Brief", "Wichtiger Inhalt", 0.7),
    ];
    const graph = [
      makeGraphPersonResult("doc-1", "Brief", "Emma", 0.95),
      makeGraphTaskResult("doc-1", "Brief", "Frist abgeben", 0.9),
    ];
    const result = combineSearchResults(semantic, graph);

    expect(result).toHaveLength(1);
    expect(result[0].excerpt).toBe("Wichtiger Inhalt");
    expect(result[0].score).toBe(0.95);
  });

  it("uses graph excerpt when no semantic result exists for the document", () => {
    const graph = [
      makeGraphPersonResult("doc-1", "Brief", "Hanna", 0.85),
      makeGraphTaskResult("doc-1", "Brief", "Schulranzen kaufen", 0.9),
    ];
    const result = combineSearchResults([], graph);

    expect(result).toHaveLength(1);
    // Should use the graph result with the highest score
    expect(result[0].excerpt).toBe("Aufgabe: Schulranzen kaufen");
    expect(result[0].score).toBe(0.9);
  });

  it("limits results to MAX_SOURCES (10)", () => {
    const semantic = Array.from({ length: 15 }, (_, i) =>
      makeSemanticResult(`doc-${i}`, `Title ${i}`, `text ${i}`, 0.9 - i * 0.01),
    );
    const result = combineSearchResults(semantic, []);

    expect(result).toHaveLength(10);
  });

  it("preserves null title from search results", () => {
    const semantic = [
      makeSemanticResult("doc-1", "", "content", 0.8),
    ];
    semantic[0].title = null;
    const result = combineSearchResults(semantic, []);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBeNull();
  });

  it("combines graph:person and graph:task for different documents", () => {
    const graph = [
      makeGraphPersonResult("doc-1", "Brief für Emma", "Emma", 0.9),
      makeGraphTaskResult("doc-2", "Aufgabenliste", "Frist abgeben", 0.85),
    ];
    const result = combineSearchResults([], graph);

    expect(result).toHaveLength(2);
    expect(result[0].document_id).toBe("doc-1");
    expect(result[1].document_id).toBe("doc-2");
  });
});

// ---------------------------------------------------------------------------
// buildChatSystemPrompt
// ---------------------------------------------------------------------------

describe("buildChatSystemPrompt", () => {
  const prompt = buildChatSystemPrompt();

  it("instructs to answer in German", () => {
    expect(prompt).toContain("Deutsch");
  });

  it("instructs to use only provided sources", () => {
    expect(prompt).toContain("NUR");
    expect(prompt.toLowerCase()).toContain("quelle");
  });

  it("forbids hedging language explicitly", () => {
    expect(prompt).toContain("Ich glaube");
    expect(prompt).toContain("Vermutlich");
    expect(prompt).toContain("Wahrscheinlich");
    expect(prompt).toContain("Könnte sein");
  });

  it("includes the hallucination fallback instruction", () => {
    expect(prompt).toContain(NO_RESULTS_FALLBACK);
  });

  it("forbids internal terminology", () => {
    expect(prompt).toContain("Knowledge Graph");
    expect(prompt).toContain("pgvector");
    expect(prompt).toContain("embedding");
  });

  it("instructs to cite sources for factual claims", () => {
    expect(prompt.toLowerCase()).toContain("quelle");
    expect(prompt).toContain("sachliche Aussage");
  });
});

// ---------------------------------------------------------------------------
// buildChatUserMessage
// ---------------------------------------------------------------------------

describe("buildChatUserMessage", () => {
  it("includes the user query", () => {
    const message = buildChatUserMessage("Was muss ich erledigen?", [
      {
        document_id: "doc-1",
        title: "Brief",
        excerpt: "Inhalt",
        score: 0.9,
      },
    ]);

    expect(message).toContain("Was muss ich erledigen?");
  });

  it("includes the source title and excerpt", () => {
    const message = buildChatUserMessage("Frage", [
      {
        document_id: "doc-1",
        title: "Stromrechnung",
        excerpt: "Betrag: 45 EUR",
        score: 0.85,
      },
    ]);

    expect(message).toContain("Stromrechnung");
    expect(message).toContain("Betrag: 45 EUR");
  });

  it("includes the relevance score as percentage", () => {
    const message = buildChatUserMessage("Frage", [
      {
        document_id: "doc-1",
        title: "Brief",
        excerpt: "Inhalt",
        score: 0.856,
      },
    ]);

    expect(message).toContain("86%");
  });

  it("handles multiple sources", () => {
    const message = buildChatUserMessage("Frage", [
      {
        document_id: "doc-1",
        title: "A",
        excerpt: "text a",
        score: 0.9,
      },
      {
        document_id: "doc-2",
        title: "B",
        excerpt: "text b",
        score: 0.8,
      },
    ]);

    expect(message).toContain("[1]");
    expect(message).toContain("[2]");
    expect(message).toContain("text a");
    expect(message).toContain("text b");
  });

  it("handles null title", () => {
    const message = buildChatUserMessage("Frage", [
      {
        document_id: "doc-1",
        title: null,
        excerpt: "Inhalt",
        score: 0.9,
      },
    ]);

    expect(message).toContain("Ohne Titel");
  });

  it("handles umlauts and special characters", () => {
    const message = buildChatUserMessage("Zeig mir Müller & Söhne", [
      {
        document_id: "doc-1",
        title: "Rechnung Müller & Söhne",
        excerpt: "Betrag: 45 € — äöü",
        score: 0.9,
      },
    ]);

    expect(message).toContain("Müller & Söhne");
    expect(message).toContain("äöü");
  });
});

// ---------------------------------------------------------------------------
// generateChatAnswer
// ---------------------------------------------------------------------------

describe("generateChatAnswer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setApiKey();
  });

  it("calls OpenAI and returns the answer", async () => {
    mockCreate.mockResolvedValue(
      mockChatResponse(
        "Laut dem Kita-Brief wird Emma am 15. August eingeschult.",
      ),
    );

    const answer = await generateChatAnswer("Wann wird Emma eingeschult?", [
      {
        document_id: "doc-1",
        title: "Kita-Brief",
        excerpt: "Einschulung am 15. August",
        score: 0.9,
      },
    ]);

    expect(answer).toBe(
      "Laut dem Kita-Brief wird Emma am 15. August eingeschult.",
    );
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("uses gpt-4.1-mini model", async () => {
    mockCreate.mockResolvedValue(mockChatResponse("Antwort"));

    await generateChatAnswer("Frage", [
      { document_id: "d", title: "T", excerpt: "E", score: 0.9 },
    ]);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0] as {
      model: string;
      messages: { role: string; content: string }[];
    };
    expect(callArgs.model).toBe("gpt-4.1-mini");
  });

  it("sends system and user messages", async () => {
    mockCreate.mockResolvedValue(mockChatResponse("Antwort"));

    await generateChatAnswer("Testfrage", [
      { document_id: "d", title: "T", excerpt: "E", score: 0.9 },
    ]);

    const callArgs = mockCreate.mock.calls[0][0] as {
      messages: { role: string; content: string }[];
    };
    expect(callArgs.messages).toHaveLength(2);
    expect(callArgs.messages[0].role).toBe("system");
    expect(callArgs.messages[1].role).toBe("user");
    expect(callArgs.messages[1].content).toContain("Testfrage");
  });

  it("retries once when the answer contains hedging language", async () => {
    mockCreate
      .mockResolvedValueOnce(
        mockChatResponse("Ich glaube, das ist ein Brief."),
      )
      .mockResolvedValueOnce(
        mockChatResponse("Das Dokument ist ein Brief für Emma."),
      );

    const answer = await generateChatAnswer("Was ist das?", [
      {
        document_id: "doc-1",
        title: "Brief",
        excerpt: "Inhalt",
        score: 0.9,
      },
    ]);

    expect(answer).toBe("Das Dokument ist ein Brief für Emma.");
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("does not retry when the answer is clean", async () => {
    mockCreate.mockResolvedValue(
      mockChatResponse("Das Dokument ist ein Brief für Emma."),
    );

    await generateChatAnswer("Was ist das?", [
      { document_id: "doc-1", title: "Brief", excerpt: "Inhalt", score: 0.9 },
    ]);

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("throws ChatError when OPENAI_API_KEY is not set", async () => {
    clearApiKey();

    await expect(
      generateChatAnswer("Frage", [
        { document_id: "d", title: "T", excerpt: "E", score: 0.9 },
      ]),
    ).rejects.toThrow(ChatError);

    try {
      await generateChatAnswer("Frage", [
        { document_id: "d", title: "T", excerpt: "E", score: 0.9 },
      ]);
    } catch (err) {
      expect((err as ChatError).code).toBe("OPENAI_NOT_CONFIGURED");
    }
  });

  it("throws ChatError on OpenAI API error (401)", async () => {
    const { APIError } = await import("openai");
    const MockErr = APIError as unknown as new (
      msg: string,
      status?: number,
    ) => Error;
    mockCreate.mockRejectedValue(new MockErr("Unauthorized", 401));

    try {
      await generateChatAnswer("Frage", [
        { document_id: "d", title: "T", excerpt: "E", score: 0.9 },
      ]);
      throw new Error("Should have thrown ChatError");
    } catch (err) {
      expect(err).toBeInstanceOf(ChatError);
      expect((err as ChatError).code).toBe("OPENAI_AUTH_ERROR");
      expect((err as ChatError).statusCode).toBe(401);
    }
  });

  it("throws ChatError on rate limit (429)", async () => {
    const { APIError } = await import("openai");
    const MockErr = APIError as unknown as new (
      msg: string,
      status?: number,
    ) => Error;
    mockCreate.mockRejectedValue(new MockErr("Rate limited", 429));

    try {
      await generateChatAnswer("Frage", [
        { document_id: "d", title: "T", excerpt: "E", score: 0.9 },
      ]);
      throw new Error("Should have thrown ChatError");
    } catch (err) {
      expect(err).toBeInstanceOf(ChatError);
      expect((err as ChatError).code).toBe("OPENAI_RATE_LIMITED");
    }
  });

  it("throws ChatError on generic API error (500)", async () => {
    const { APIError } = await import("openai");
    const MockErr = APIError as unknown as new (
      msg: string,
      status?: number,
    ) => Error;
    mockCreate.mockRejectedValue(new MockErr("Server error", 500));

    try {
      await generateChatAnswer("Frage", [
        { document_id: "d", title: "T", excerpt: "E", score: 0.9 },
      ]);
      throw new Error("Should have thrown ChatError");
    } catch (err) {
      expect(err).toBeInstanceOf(ChatError);
      expect((err as ChatError).code).toBe("OPENAI_API_ERROR");
      expect((err as ChatError).statusCode).toBe(500);
    }
  });

  it("throws ChatError on empty response", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: null } }],
    });

    try {
      await generateChatAnswer("Frage", [
        { document_id: "d", title: "T", excerpt: "E", score: 0.9 },
      ]);
      throw new Error("Should have thrown ChatError");
    } catch (err) {
      expect(err).toBeInstanceOf(ChatError);
      expect((err as ChatError).code).toBe("OPENAI_EMPTY_RESPONSE");
    }
  });

  it("throws ChatError on whitespace-only response", async () => {
    mockCreate.mockResolvedValue(
      mockChatResponse("   "),
    );

    try {
      await generateChatAnswer("Frage", [
        { document_id: "d", title: "T", excerpt: "E", score: 0.9 },
      ]);
      throw new Error("Should have thrown ChatError");
    } catch (err) {
      expect(err).toBeInstanceOf(ChatError);
      expect((err as ChatError).code).toBe("OPENAI_EMPTY_RESPONSE");
    }
  });

  it("throws ChatError on network error (non-APIError)", async () => {
    mockCreate.mockRejectedValue(new Error("Connection refused"));

    try {
      await generateChatAnswer("Frage", [
        { document_id: "d", title: "T", excerpt: "E", score: 0.9 },
      ]);
      throw new Error("Should have thrown ChatError");
    } catch (err) {
      expect(err).toBeInstanceOf(ChatError);
      expect((err as ChatError).code).toBe("OPENAI_NETWORK_ERROR");
    }
  });

  it("does not expose the API key in the request content", async () => {
    mockCreate.mockResolvedValue(mockChatResponse("Antwort"));

    await generateChatAnswer("Frage", [
      { document_id: "d", title: "T", excerpt: "E", score: 0.9 },
    ]);

    const callArgs = mockCreate.mock.calls[0][0] as {
      messages: { content: string }[];
    };
    const allContent = callArgs.messages.map((m) => m.content).join(" ");
    expect(allContent).not.toContain("test-openai-key");
    expect(allContent).not.toContain("OPENAI_API_KEY");
  });
});
