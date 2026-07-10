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
  buildAgenticSystemPrompt,
  generateChatAnswer,
  filterByRelevanceThreshold,
  reconcileFallbackSources,
  streamAgenticAnswer,
  ChatError,
} from "@/lib/ai/chat";
import {
  NO_RESULTS_FALLBACK,
  FAIL_CLOSED_HEDGING,
  FAIL_CLOSED_CITATION,
  containsHedgingLanguage,
  type ChatSource,
} from "@/lib/schemas/chat";
import { RELEVANCE_THRESHOLD } from "@/lib/ai/search";
import type { SearchResult } from "@/lib/schemas/search";
import type { ToolContext } from "@/lib/ai/tools";

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

// --- Fake OpenAI streaming responses (for streamAgenticAnswer tests) -----

type FakeStreamChunk =
  | { content: string }
  | {
      toolCall: {
        index: number;
        id?: string;
        name?: string;
        argumentsChunk?: string;
      };
    };

/**
 * Build a fake async-iterable OpenAI streaming response from a simple
 * chunk description, matching the `chunk.choices[0].delta` shape that
 * `streamAgenticAnswer` reads.
 */
function fakeOpenAIStream(chunks: FakeStreamChunk[]) {
  async function* generator() {
    for (const chunk of chunks) {
      if ("content" in chunk) {
        yield { choices: [{ delta: { content: chunk.content } }] };
      } else {
        const { index, id, name, argumentsChunk } = chunk.toolCall;
        yield {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index,
                    id,
                    function: {
                      name,
                      arguments: argumentsChunk,
                    },
                  },
                ],
              },
            },
          ],
        };
      }
    }
  }
  return generator();
}

/** Consume a ReadableStream<Uint8Array> of NDJSON lines into parsed objects. */
async function readNdjsonStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Record<string, unknown>[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const lines: Record<string, unknown>[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
  }

  for (const line of buffer.split("\n")) {
    if (line.trim()) lines.push(JSON.parse(line));
  }
  return lines;
}

function makeToolContext(sources: ChatSource[] = []): ToolContext {
  // Minimal mock that supports loadFamilyContext queries.
  // Each .from() call returns a chainable builder that resolves to empty data.
  const chainable = {
    select: () => chainable,
    eq: () => chainable,
    order: () => chainable,
    limit: () => chainable,
    in: () => chainable,
    then: (resolve: (v: { data: unknown[]; error: null; count: number }) => void) =>
      Promise.resolve({ data: [], error: null, count: 0 }).then(resolve),
  };
  return {
    client: {
      from: () => chainable,
    } as unknown as ToolContext["client"],
    familyId: "660e8400-e29b-41d4-a716-446655440001",
    sources,
    speakerName: null,
  };
}

// ---------------------------------------------------------------------------
// filterByRelevanceThreshold
// ---------------------------------------------------------------------------

describe("filterByRelevanceThreshold", () => {
  it("keeps semantic results at or above the threshold", () => {
    const results = [
      makeSemanticResult("doc-1", "Brief", "Inhalt", RELEVANCE_THRESHOLD),
      makeSemanticResult("doc-2", "Brief 2", "Inhalt 2", 0.9),
    ];
    const filtered = filterByRelevanceThreshold(results);
    expect(filtered).toHaveLength(2);
  });

  it("drops semantic results below the threshold", () => {
    const results = [
      makeSemanticResult("doc-1", "Brief", "Inhalt", 0.1),
      makeSemanticResult("doc-2", "Brief 2", "Inhalt 2", 0.05),
    ];
    const filtered = filterByRelevanceThreshold(results);
    expect(filtered).toEqual([]);
  });

  it("returns empty when all semantic results are below the threshold", () => {
    const results = [
      makeSemanticResult("doc-1", "Brief", "Inhalt", 0.15),
      makeSemanticResult("doc-2", "Brief 2", "Inhalt 2", 0.2),
    ];
    const filtered = filterByRelevanceThreshold(results);
    expect(filtered).toEqual([]);
  });

  it("keeps above-threshold results and drops below-threshold results in a mixed set", () => {
    const results = [
      makeSemanticResult("doc-1", "Relevant", "Wichtiger Inhalt", 0.85),
      makeSemanticResult("doc-2", "Irrelevant", "Zufälliger Text", 0.1),
      makeSemanticResult("doc-3", "Also Relevant", "Passender Inhalt", 0.5),
    ];
    const filtered = filterByRelevanceThreshold(results);
    expect(filtered).toHaveLength(2);
    const docIds = filtered.map((r) => r.document_id);
    expect(docIds).toContain("doc-1");
    expect(docIds).toContain("doc-3");
    expect(docIds).not.toContain("doc-2");
  });

  it("returns empty for an empty input array", () => {
    expect(filterByRelevanceThreshold([])).toEqual([]);
  });

  it("uses a conservative threshold value (0.3) that does not regress genuine low-but-relevant matches", () => {
    // The threshold should be conservative — low enough to keep genuine
    // low-relevance matches (e.g. 0.35) while filtering clear noise
    // (e.g. 0.1–0.2). A threshold of 0.3 is the conventional cutoff for
    // text-embedding-3-small cosine similarity.
    expect(RELEVANCE_THRESHOLD).toBe(0.3);
  });
});

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

  // --- Origin marker population (VAL-SEARCH-023) ---

  it("populates origin 'semantic' for semantic-only results", () => {
    const semantic = [
      makeSemanticResult("doc-1", "Brief", "Inhalt", 0.85),
    ];
    const result = combineSearchResults(semantic, []);
    expect(result).toHaveLength(1);
    expect(result[0].origin).toBe("semantic");
  });

  it("populates origin 'graph' for graph:person results", () => {
    const graph = [
      makeGraphPersonResult("doc-1", "Brief", "Emma", 0.9),
    ];
    const result = combineSearchResults([], graph);
    expect(result).toHaveLength(1);
    expect(result[0].origin).toBe("graph");
  });

  it("populates origin 'graph' for graph:task results", () => {
    const graph = [
      makeGraphTaskResult("doc-1", "Aufgabenliste", "Frist abgeben", 0.85),
    ];
    const result = combineSearchResults([], graph);
    expect(result).toHaveLength(1);
    expect(result[0].origin).toBe("graph");
  });

  it("populates origin 'semantic' when a document has both semantic and graph results (semantic excerpt preferred)", () => {
    // When a document appears in both semantic and graph results, the
    // semantic excerpt is preferred. The origin should reflect the
    // semantic source (since the excerpt comes from semantic search).
    const semantic = [
      makeSemanticResult("doc-1", "Kita-Brief", "Einschulung Emma", 0.85),
    ];
    const graph = [
      makeGraphPersonResult("doc-1", "Kita-Brief", "Emma", 0.95),
    ];
    const result = combineSearchResults(semantic, graph);
    expect(result).toHaveLength(1);
    expect(result[0].origin).toBe("semantic");
  });

  it("populates origin 'graph' when a document has only graph results", () => {
    const graph = [
      makeGraphPersonResult("doc-1", "Brief", "Hanna", 0.85),
      makeGraphTaskResult("doc-1", "Brief", "Schulranzen kaufen", 0.9),
    ];
    const result = combineSearchResults([], graph);
    expect(result).toHaveLength(1);
    expect(result[0].origin).toBe("graph");
  });

  it("populates origin correctly for mixed semantic and graph documents", () => {
    const semantic = [
      makeSemanticResult("doc-1", "Stromrechnung", "Betrag: 45 EUR", 0.8),
    ];
    const graph = [
      makeGraphTaskResult("doc-2", "Aufgabenliste", "Frist abgeben", 0.85),
    ];
    const result = combineSearchResults(semantic, graph);
    expect(result).toHaveLength(2);

    const doc1 = result.find((s) => s.document_id === "doc-1");
    const doc2 = result.find((s) => s.document_id === "doc-2");
    expect(doc1?.origin).toBe("semantic");
    expect(doc2?.origin).toBe("graph");
  });
});

// ---------------------------------------------------------------------------
// reconcileFallbackSources
// ---------------------------------------------------------------------------

describe("reconcileFallbackSources", () => {
  function sources(): ChatSource[] {
    return [
      {
        document_id: "doc-1",
        title: "Kita-Brief",
        excerpt: "Einschulung am 15. August",
        score: 0.85,
      },
      {
        document_id: "doc-2",
        title: "Stromrechnung",
        excerpt: "Betrag: 45 EUR",
        score: 0.8,
      },
    ];
  }

  it("empties sources when the answer is the no-results fallback", () => {
    expect(reconcileFallbackSources(NO_RESULTS_FALLBACK, sources())).toEqual([]);
  });

  it("preserves sources when the answer is a normal cited answer", () => {
    const srcs = sources();
    expect(
      reconcileFallbackSources(
        "Laut dem Kita-Brief findet die Einschulung am 15. August statt.",
        srcs,
      ),
    ).toEqual(srcs);
  });

  it("empties sources when the answer is the fallback with surrounding whitespace", () => {
    expect(
      reconcileFallbackSources(`  ${NO_RESULTS_FALLBACK}  `, sources()),
    ).toEqual([]);
  });

  it("preserves sources when the answer is a fail-closed hedging message (not the fallback)", () => {
    // Fail-closed messages are not the fallback — sources are preserved.
    const srcs = sources();
    expect(reconcileFallbackSources(FAIL_CLOSED_HEDGING, srcs)).toEqual(srcs);
  });

  it("preserves sources when the answer is a fail-closed citation message (not the fallback)", () => {
    const srcs = sources();
    expect(reconcileFallbackSources(FAIL_CLOSED_CITATION, srcs)).toEqual(srcs);
  });

  it("preserves sources when the answer is an empty string", () => {
    const srcs = sources();
    expect(reconcileFallbackSources("", srcs)).toEqual(srcs);
  });

  it("returns empty array when sources are already empty and answer is fallback", () => {
    expect(reconcileFallbackSources(NO_RESULTS_FALLBACK, [])).toEqual([]);
  });

  it("returns the same array reference when sources are not reconciled", () => {
    // No unnecessary copy when the answer is not the fallback.
    const srcs = sources();
    expect(reconcileFallbackSources("Laut dem Brief...", srcs)).toBe(srcs);
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
// buildAgenticSystemPrompt
// ---------------------------------------------------------------------------

describe("buildAgenticSystemPrompt", () => {
  const prompt = buildAgenticSystemPrompt();

  it("instructs to answer in German", () => {
    expect(prompt).toContain("Deutsch");
  });

  it("instructs Markdown formatting for emphasis", () => {
    expect(prompt).toContain("Markdown");
    expect(prompt).toContain("**fett**");
  });

  it("instructs to use Markdown tables for multi-item, multi-field listings", () => {
    expect(prompt.toLowerCase()).toContain("markdown-tabelle");
  });

  it("instructs to avoid mentioning the same document twice", () => {
    expect(prompt.toLowerCase()).toContain("nur einmal");
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
    // mockReset clears the mockResolvedValueOnce queue so queued values
    // from a previous test do not leak into the next test.
    mockCreate.mockReset();
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

  it("uses gpt-5.4-mini model", async () => {
    mockCreate.mockResolvedValue(
      mockChatResponse("Laut dem Testdokument ist die Antwort 42."),
    );

    await generateChatAnswer("Frage", [
      { document_id: "d", title: "Testdokument", excerpt: "Inhalt", score: 0.9 },
    ]);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0] as {
      model: string;
      messages: { role: string; content: string }[];
    };
    expect(callArgs.model).toBe("gpt-5.4-mini");
  });

  it("sends system and user messages", async () => {
    mockCreate.mockResolvedValue(
      mockChatResponse("Laut dem Testdokument ist die Antwort 42."),
    );

    await generateChatAnswer("Testfrage", [
      { document_id: "d", title: "Testdokument", excerpt: "Inhalt", score: 0.9 },
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
    mockCreate.mockResolvedValue(
      mockChatResponse("Laut dem Testdokument ist die Antwort 42."),
    );

    await generateChatAnswer("Frage", [
      { document_id: "d", title: "Testdokument", excerpt: "Inhalt", score: 0.9 },
    ]);

    const callArgs = mockCreate.mock.calls[0][0] as {
      messages: { content: string }[];
    };
    const allContent = callArgs.messages.map((m) => m.content).join(" ");
    expect(allContent).not.toContain("test-openai-key");
    expect(allContent).not.toContain("OPENAI_API_KEY");
  });

  // --- Hedging rejection: fail-closed when hedging persists (chat-api-guardrails) ---

  it("returns fail-closed message when hedging persists after one regeneration", async () => {
    mockCreate
      .mockResolvedValueOnce(
        mockChatResponse("Ich glaube, das ist ein Brief für Emma."),
      )
      .mockResolvedValueOnce(
        mockChatResponse("Vermutlich ist das ein Brief für Emma."),
      );

    const answer = await generateChatAnswer("Was ist das?", [
      {
        document_id: "doc-1",
        title: "Brief",
        excerpt: "Inhalt",
        score: 0.9,
      },
    ]);

    expect(answer).toBe(FAIL_CLOSED_HEDGING);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("does not return a hedged answer under any circumstance", async () => {
    // First answer hedged, second also hedged → must NOT return either.
    mockCreate
      .mockResolvedValueOnce(
        mockChatResponse("Wahrscheinlich ist das eine Rechnung."),
      )
      .mockResolvedValueOnce(
        mockChatResponse("Könnte sein, dass das für Emma ist."),
      );

    const answer = await generateChatAnswer("Frage", [
      { document_id: "doc-1", title: "Brief", excerpt: "Inhalt", score: 0.9 },
    ]);

    expect(answer).toBe(FAIL_CLOSED_HEDGING);
    expect(containsHedgingLanguage(answer)).toBe(false);
  });

  it("regenerates when first answer is hedged and second is clean", async () => {
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

  // --- Missing-citation handling: regenerate or fail-closed (chat-api-guardrails) ---

  it("regenerates when the answer does not cite any source (first uncited, second cited)", async () => {
    mockCreate
      .mockResolvedValueOnce(
        // Answer asserts a fact but never references the source title.
        mockChatResponse("Die Einschulung findet am 15. August statt."),
      )
      .mockResolvedValueOnce(
        mockChatResponse(
          "Laut dem Kita-Brief findet die Einschulung am 15. August statt.",
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
      "Laut dem Kita-Brief findet die Einschulung am 15. August statt.",
    );
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("returns fail-closed message when citation is missing after one regeneration", async () => {
    mockCreate
      .mockResolvedValueOnce(
        mockChatResponse("Der Termin ist am 15. August."),
      )
      .mockResolvedValueOnce(
        mockChatResponse("Die Einschulung findet am 15. August statt."),
      );

    const answer = await generateChatAnswer("Wann wird Emma eingeschult?", [
      {
        document_id: "doc-1",
        title: "Kita-Brief",
        excerpt: "Einschulung am 15. August",
        score: 0.9,
      },
    ]);

    expect(answer).toBe(FAIL_CLOSED_CITATION);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("does not return an uncited factual answer", async () => {
    mockCreate
      .mockResolvedValueOnce(
        mockChatResponse("Die Rechnung beträgt 45 Euro."),
      )
      .mockResolvedValueOnce(
        mockChatResponse("Der Betrag wurde bereits bezahlt."),
      );

    const answer = await generateChatAnswer("Wie hoch ist die Rechnung?", [
      {
        document_id: "doc-1",
        title: "Stromrechnung",
        excerpt: "Betrag: 45 EUR",
        score: 0.9,
      },
    ]);

    expect(answer).toBe(FAIL_CLOSED_CITATION);
    // The fail-closed message should not contain the uncited factual claim.
    expect(answer).not.toContain("45 Euro");
  });

  it("does not trigger citation fail-closed when source titles are too short but the answer cites by content", async () => {
    // Title "T" is shorter than MIN_CITATION_TITLE_LENGTH → title matching
    // cannot fire, but the answer contains a distinctive content fragment
    // from the excerpt → content-based citation passes, no fail-closed.
    mockCreate.mockResolvedValueOnce(
      mockChatResponse("Die Einschulung am 15. August ist bestätigt."),
    );

    const answer = await generateChatAnswer("Frage", [
      {
        document_id: "d",
        title: "T",
        excerpt: "Einschulung am 15. August",
        score: 0.9,
      },
    ]);

    expect(answer).toBe("Die Einschulung am 15. August ist bestätigt.");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("triggers citation fail-closed when source titles are short and the answer does not match content", async () => {
    // Title "T" is too short and the answer does not contain a content
    // fragment from the excerpt → uncited → regenerate → still uncited →
    // fail-closed. The bypass is removed: short titles no longer get a
    // free pass.
    mockCreate
      .mockResolvedValueOnce(
        mockChatResponse("Die Antwort ist 42."),
      )
      .mockResolvedValueOnce(
        mockChatResponse("Der Termin ist bald."),
      );

    const answer = await generateChatAnswer("Frage", [
      {
        document_id: "d",
        title: "T",
        excerpt: "Einschulung am 15. August",
        score: 0.9,
      },
    ]);

    expect(answer).toBe(FAIL_CLOSED_CITATION);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("does not trigger citation fail-closed when source titles are null but the answer cites by content", async () => {
    // All titles are null → title matching cannot fire, but the answer
    // contains a distinctive content fragment → content-based citation
    // passes, no regeneration, no fail-closed.
    mockCreate.mockResolvedValueOnce(
      mockChatResponse("Die Einschulung am 15. August ist bestätigt."),
    );

    const answer = await generateChatAnswer("Frage", [
      {
        document_id: "d",
        title: null,
        excerpt: "Einschulung am 15. August",
        score: 0.9,
      },
    ]);

    expect(answer).toBe("Die Einschulung am 15. August ist bestätigt.");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("does not trigger citation fail-closed for the no-results fallback", async () => {
    // The model may respond with the fallback even when sources exist.
    mockCreate.mockResolvedValueOnce(
      mockChatResponse(NO_RESULTS_FALLBACK),
    );

    const answer = await generateChatAnswer("Frage", [
      { document_id: "doc-1", title: "Kita-Brief", excerpt: "Inhalt", score: 0.9 },
    ]);

    expect(answer).toBe(NO_RESULTS_FALLBACK);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  // --- Combined hedging + citation guardrails ---

  it("regenerates once when both hedging and citation fail, then succeeds", async () => {
    mockCreate
      .mockResolvedValueOnce(
        // Hedged AND uncited.
        mockChatResponse("Ich glaube, der Termin ist am 15. August."),
      )
      .mockResolvedValueOnce(
        // Clean and cited.
        mockChatResponse(
          "Laut dem Kita-Brief ist der Termin am 15. August.",
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

    expect(answer).toBe("Laut dem Kita-Brief ist der Termin am 15. August.");
    // Only ONE regeneration, not two.
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("returns hedging fail-closed when both hedging and citation persist after retry", async () => {
    mockCreate
      .mockResolvedValueOnce(
        mockChatResponse("Ich glaube, der Termin ist bald."),
      )
      .mockResolvedValueOnce(
        mockChatResponse("Vermutlich ist der Termin bald."),
      );

    const answer = await generateChatAnswer("Wann?", [
      {
        document_id: "doc-1",
        title: "Kita-Brief",
        excerpt: "Inhalt",
        score: 0.9,
      },
    ]);

    // Hedging takes priority for the fail-closed message.
    expect(answer).toBe(FAIL_CLOSED_HEDGING);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// streamAgenticAnswer — present_answer_card (structured answer cards)
// ---------------------------------------------------------------------------

describe("streamAgenticAnswer — present_answer_card", () => {
  beforeEach(() => {
    setApiKey();
    mockCreate.mockReset();
  });

  it("sends a card event and skips text/sources round when the card is valid", async () => {
    mockCreate.mockResolvedValueOnce(
      fakeOpenAIStream([
        {
          toolCall: {
            index: 0,
            id: "call_1",
            name: "present_answer_card",
            argumentsChunk: JSON.stringify({
              card_type: "termin",
              title: "Zahnarzttermin",
              subtitle: "Emma",
              fields: [{ label: "Datum", value: "12.08.2026" }],
            }),
          },
        },
      ]),
    );

    const toolContext = makeToolContext();
    const stream = await streamAgenticAnswer(
      "Wann ist der Zahnarzttermin?",
      [],
      toolContext,
    );
    const lines = await readNdjsonStream(stream);

    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({
      type: "card",
      card: { type: "termin", title: "Zahnarzttermin" },
    });
    expect(lines[1]).toMatchObject({ type: "sources", sources: [] });
    expect(lines[2]).toEqual({ type: "done" });
    // The card is a terminal action — only one round of the model is used.
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("keeps actionDocumentId when it matches an accumulated source", async () => {
    mockCreate.mockResolvedValueOnce(
      fakeOpenAIStream([
        {
          toolCall: {
            index: 0,
            id: "call_1",
            name: "present_answer_card",
            argumentsChunk: JSON.stringify({
              card_type: "dokument",
              title: "Stromrechnung",
              fields: [{ label: "Betrag", value: "45 EUR" }],
              source_document_id: "doc-1",
            }),
          },
        },
      ]),
    );

    const toolContext = makeToolContext([
      { document_id: "doc-1", title: "Stromrechnung", excerpt: "45 EUR", score: 0.9 },
    ]);
    const stream = await streamAgenticAnswer("Wie hoch ist die Stromrechnung?", [], toolContext);
    const lines = await readNdjsonStream(stream);

    expect(lines[0]).toMatchObject({
      type: "card",
      card: { actionDocumentId: "doc-1" },
    });
  });

  it("nulls out actionDocumentId when it does not match any accumulated source", async () => {
    mockCreate.mockResolvedValueOnce(
      fakeOpenAIStream([
        {
          toolCall: {
            index: 0,
            id: "call_1",
            name: "present_answer_card",
            argumentsChunk: JSON.stringify({
              card_type: "dokument",
              title: "Stromrechnung",
              fields: [{ label: "Betrag", value: "45 EUR" }],
              source_document_id: "doc-does-not-exist",
            }),
          },
        },
      ]),
    );

    const toolContext = makeToolContext([
      { document_id: "doc-1", title: "Stromrechnung", excerpt: "45 EUR", score: 0.9 },
    ]);
    const stream = await streamAgenticAnswer("Wie hoch ist die Stromrechnung?", [], toolContext);
    const lines = await readNdjsonStream(stream);

    expect(lines[0]).toMatchObject({
      type: "card",
      card: { actionDocumentId: null },
    });
  });

  it("falls back to a text answer when the card arguments are invalid", async () => {
    mockCreate
      .mockResolvedValueOnce(
        fakeOpenAIStream([
          {
            toolCall: {
              index: 0,
              id: "call_1",
              name: "present_answer_card",
              // Missing required "fields" → fails schema validation.
              argumentsChunk: JSON.stringify({
                card_type: "termin",
                title: "Zahnarzttermin",
              }),
            },
          },
        ]),
      )
      .mockResolvedValueOnce(
        fakeOpenAIStream([{ content: "Der Termin ist am 12.08.2026." }]),
      );

    const toolContext = makeToolContext();
    const stream = await streamAgenticAnswer("Wann?", [], toolContext);
    const lines = await readNdjsonStream(stream);

    expect(lines.some((l) => l.type === "card")).toBe(false);
    expect(lines).toContainEqual({
      type: "text",
      content: "Der Termin ist am 12.08.2026.",
    });
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("rejects a card whose text contains hedging language and asks for plain text instead", async () => {
    mockCreate
      .mockResolvedValueOnce(
        fakeOpenAIStream([
          {
            toolCall: {
              index: 0,
              id: "call_1",
              name: "present_answer_card",
              argumentsChunk: JSON.stringify({
                card_type: "termin",
                title: "Vermutlich ein Termin",
                fields: [{ label: "Datum", value: "12.08.2026" }],
              }),
            },
          },
        ]),
      )
      .mockResolvedValueOnce(
        fakeOpenAIStream([{ content: "Der Termin ist am 12.08.2026." }]),
      );

    const toolContext = makeToolContext();
    const stream = await streamAgenticAnswer("Wann?", [], toolContext);
    const lines = await readNdjsonStream(stream);

    expect(lines.some((l) => l.type === "card")).toBe(false);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});
