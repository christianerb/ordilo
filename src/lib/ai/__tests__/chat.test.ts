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
  buildAgenticSystemPrompt,
  filterByRelevanceThreshold,
  streamAgenticAnswer,
  ChatError,
} from "@/lib/ai/chat";
import {
  FAIL_CLOSED_HEDGING,
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

/**
 * Variant of fakeOpenAIStream that throws after yielding the given
 * chunks — simulates a dropped OpenAI connection mid-answer.
 */
function fakeOpenAIStreamThenThrow(chunks: FakeStreamChunk[], error: Error) {
  async function* generator() {
    yield* fakeOpenAIStream(chunks);
    throw error;
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
      makeSemanticResult("doc-1", "Brief", "Inhalt", 0.05),
      makeSemanticResult("doc-2", "Brief 2", "Inhalt 2", 0.1),
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

  it("uses a threshold value (0.2) calibrated for small family corpora", () => {
    // The threshold is set low (0.2) because a family has 20–100 documents,
    // so even marginal semantic matches are likely relevant. Larger corpora
    // would need 0.3+ to suppress noise.
    expect(RELEVANCE_THRESHOLD).toBe(0.2);
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

  it("prefers content chunks over synthetic questions for the excerpt", () => {
    // A synthetic question scores highest (0.9), but the content chunk (0.7)
    // has the actual answer. The excerpt should be the content, not the question.
    const semantic = [
      makeSemanticResult("doc-1", "Fluginfo", "Um wieviel Uhr war Fluginfo?", 0.9),
      makeSemanticResult("doc-1", "Fluginfo", "# Flug-Info\n\n19:25\n\nGeplant\n\n20:55\n\nTerminal 1", 0.7),
    ];
    const result = combineSearchResults(semantic, []);
    expect(result).toHaveLength(1);
    expect(result[0].excerpt).toContain("19:25");
    expect(result[0].excerpt).not.toContain("Um wieviel Uhr");
    // Score should still be the highest (from the question)
    expect(result[0].score).toBe(0.9);
  });

  it("falls back to question excerpt when no content chunk exists", () => {
    const semantic = [
      makeSemanticResult("doc-1", "Fluginfo", "Um wieviel Uhr war Fluginfo?", 0.9),
    ];
    const result = combineSearchResults(semantic, []);
    expect(result).toHaveLength(1);
    expect(result[0].excerpt).toBe("Um wieviel Uhr war Fluginfo?");
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

  it("instructs to answer directly without tools when the context already has the answer", () => {
    expect(prompt).toContain("DIREKT ohne Tool-Aufruf");
    expect(prompt).toContain("NICHT erneut");
  });

  it("instructs to call as few tools as possible per question", () => {
    expect(prompt).toContain("GENAU EINS pro Frage");
  });
});

describe("buildAgenticSystemPrompt — current date context", () => {
  // 14:30 UTC = 16:30 Europe/Berlin (CEST in August).
  const fixedNow = new Date("2026-08-12T14:30:00Z");
  const prompt = buildAgenticSystemPrompt(undefined, fixedNow);

  it("includes today's date in German long form and ISO format", () => {
    expect(prompt).toContain("Heute ist Mittwoch, 12.08.2026 (2026-08-12)");
  });

  it("includes the current time in Europe/Berlin", () => {
    expect(prompt).toContain("16:30 Uhr (Zeitzone Europe/Berlin)");
  });

  it("instructs to resolve relative dates itself and never ask for today's date", () => {
    expect(prompt).toContain("SELBST in ein konkretes Datum um");
    expect(prompt).toContain("NIEMALS, welches Datum heute ist");
  });

  it("defaults to the real clock when no date is injected", () => {
    // No fixed date — the prompt must still contain a plausible date line.
    expect(buildAgenticSystemPrompt()).toMatch(
      /Heute ist \w+, \d{2}\.\d{2}\.\d{4} \(\d{4}-\d{2}-\d{2}\), \d{2}:\d{2} Uhr/,
    );
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

  it("reports each real tool call so progress is not invented client-side", async () => {
    // The client used to tick steps off on a timer; it now renders exactly
    // what these events say ran.
    mockCreate
      .mockResolvedValueOnce(
        fakeOpenAIStream([
          {
            toolCall: {
              index: 0,
              id: "call_1",
              name: "list_tasks",
              argumentsChunk: "{}",
            },
          },
        ]),
      )
      .mockResolvedValueOnce(
        fakeOpenAIStream([{ content: "Diese Woche steht nichts an." }]),
      );

    const stream = await streamAgenticAnswer(
      "Was muss ich diese Woche erledigen?",
      [],
      makeToolContext(),
    );
    const lines = await readNdjsonStream(stream);

    const toolEvents = lines.filter((l) => l.type === "tool");
    expect(toolEvents).toEqual([
      { type: "tool", tool: "list_tasks", state: "start" },
      { type: "tool", tool: "list_tasks", state: "done" },
    ]);
    // No event claims a tool that was never called.
    expect(
      toolEvents.some((e) => e.tool === "search_documents"),
    ).toBe(false);
  });

  it("emits no tool events when the model answers without calling one", async () => {
    mockCreate.mockResolvedValueOnce(
      fakeOpenAIStream([{ content: "Hallo! Wie kann ich helfen?" }]),
    );

    const stream = await streamAgenticAnswer("Hallo", [], makeToolContext());
    const lines = await readNdjsonStream(stream);

    expect(lines.filter((l) => l.type === "tool")).toHaveLength(0);
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

// ---------------------------------------------------------------------------
// streamAgenticAnswer — text buffering + final-answer guardrails
// ---------------------------------------------------------------------------

describe("streamAgenticAnswer — text buffering and hedging guardrail", () => {
  beforeEach(() => {
    setApiKey();
    mockCreate.mockReset();
  });

  it("throws ChatError when OPENAI_API_KEY is not set", async () => {
    clearApiKey();

    await expect(
      streamAgenticAnswer("Frage", [], makeToolContext()),
    ).rejects.toThrow(ChatError);
  });

  it("never shows a short preamble on the way to a tool call", async () => {
    // Text below the release threshold stays in the hold-back buffer —
    // when the round ends with tool calls it is discarded silently, so
    // short preambles never flash on screen at all.
    mockCreate
      .mockResolvedValueOnce(
        fakeOpenAIStream([
          { content: "Ich schaue kurz nach" },
          {
            toolCall: {
              index: 0,
              id: "call_1",
              name: "list_tasks",
              argumentsChunk: "{}",
            },
          },
        ]),
      )
      .mockResolvedValueOnce(
        fakeOpenAIStream([{ content: "Diese Woche steht nichts an." }]),
      );

    const stream = await streamAgenticAnswer(
      "Was steht diese Woche an?",
      [],
      makeToolContext(),
    );
    const lines = await readNdjsonStream(stream);

    expect(
      lines.some(
        (l) => l.type === "text" && String(l.content).includes("schaue"),
      ),
    ).toBe(false);
    expect(lines.some((l) => l.type === "replace")).toBe(false);
    expect(lines).toContainEqual({
      type: "text",
      content: "Diese Woche steht nichts an.",
    });
  });

  it("retracts a long preamble once the round turns out to call tools", async () => {
    // A preamble past the release threshold already streamed (it looked
    // like a real answer). When the tool call arrives, it must be
    // retracted so only the final answer remains visible.
    const longPreamble =
      "Ich schaue kurz in deinen Dokumenten und Aufgaben nach.";
    mockCreate
      .mockResolvedValueOnce(
        fakeOpenAIStream([
          { content: longPreamble },
          {
            toolCall: {
              index: 0,
              id: "call_1",
              name: "list_tasks",
              argumentsChunk: "{}",
            },
          },
        ]),
      )
      .mockResolvedValueOnce(
        fakeOpenAIStream([{ content: "Diese Woche steht nichts an." }]),
      );

    const stream = await streamAgenticAnswer(
      "Was steht diese Woche an?",
      [],
      makeToolContext(),
    );
    const lines = await readNdjsonStream(stream);

    // The preamble streamed live, then was retracted when the tool call
    // arrived, then the final answer streamed.
    expect(lines).toContainEqual({ type: "text", content: longPreamble });
    expect(lines).toContainEqual({ type: "replace", content: "" });

    // Applying the events in order (text appends, replace overwrites)
    // leaves only the final answer visible.
    let visible = "";
    for (const line of lines) {
      if (line.type === "text") visible += line.content as string;
      if (line.type === "replace") visible = line.content as string;
    }
    expect(visible).toBe("Diese Woche steht nichts an.");
  });

  it("runs independent tool calls from the same round in parallel", async () => {
    mockCreate
      .mockResolvedValueOnce(
        fakeOpenAIStream([
          {
            toolCall: {
              index: 0,
              id: "call_1",
              name: "list_tasks",
              argumentsChunk: "{}",
            },
          },
          {
            toolCall: {
              index: 1,
              id: "call_2",
              name: "list_family_members",
              argumentsChunk: "{}",
            },
          },
        ]),
      )
      .mockResolvedValueOnce(
        fakeOpenAIStream([{ content: "Alles im Blick." }]),
      );

    const stream = await streamAgenticAnswer(
      "Wer gehört zur Familie und was steht an?",
      [],
      makeToolContext(),
    );
    const lines = await readNdjsonStream(stream);

    const toolEvents = lines.filter((l) => l.type === "tool");
    // Both tools start before either finishes — sequential execution
    // would interleave start/done pairs instead.
    expect(toolEvents.slice(0, 2)).toEqual([
      { type: "tool", tool: "list_tasks", state: "start" },
      { type: "tool", tool: "list_family_members", state: "start" },
    ]);
    expect(toolEvents.filter((e) => e.state === "done")).toHaveLength(2);
    expect(lines).toContainEqual({ type: "text", content: "Alles im Blick." });
  });

  it("streams a long final answer incrementally once past the release threshold", async () => {
    const firstChunk =
      "Das ist eine ausführliche Antwort, die mehr als achtundvierzig Zeichen hat, ";
    mockCreate.mockResolvedValueOnce(
      fakeOpenAIStream([
        { content: firstChunk },
        { content: "und sie geht noch weiter." },
      ]),
    );

    const stream = await streamAgenticAnswer("Hi", [], makeToolContext());
    const lines = await readNdjsonStream(stream);

    // The first chunk crosses the release threshold and streams
    // immediately; everything after streams piece by piece.
    expect(lines.filter((l) => l.type === "text")).toEqual([
      { type: "text", content: firstChunk },
      { type: "text", content: "und sie geht noch weiter." },
    ]);
    expect(lines[lines.length - 1]).toEqual({ type: "done" });
  });

  it("flushes a short final answer in one piece at the end of the round", async () => {
    // Answers below the release threshold are held back while the round
    // streams and flushed once the round proves to be tool-free.
    mockCreate.mockResolvedValueOnce(
      fakeOpenAIStream([{ content: "Hallo, " }, { content: "Emma!" }]),
    );

    const stream = await streamAgenticAnswer("Hi", [], makeToolContext());
    const lines = await readNdjsonStream(stream);

    expect(lines.filter((l) => l.type === "text")).toEqual([
      { type: "text", content: "Hallo, Emma!" },
    ]);
  });

  it("calls the model with low reasoning effort for snappy answers", async () => {
    mockCreate.mockResolvedValueOnce(
      fakeOpenAIStream([{ content: "Hallo!" }]),
    );

    const stream = await streamAgenticAnswer("Hi", [], makeToolContext());
    await readNdjsonStream(stream);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ reasoning_effort: "low" }),
    );
  });

  it("sends only the corrected answer when the first final answer hedges", async () => {
    // The hedged draft must never reach the client — only the regenerated
    // clean answer is streamed (as a single chunk).
    mockCreate
      .mockResolvedValueOnce(
        fakeOpenAIStream([
          { content: "Ich glaube, " },
          { content: "die Frist ist bald." },
        ]),
      )
      .mockResolvedValueOnce(
        mockChatResponse("Die Frist ist der 15. August."),
      );

    const stream = await streamAgenticAnswer(
      "Wann ist die Frist?",
      [],
      makeToolContext(),
    );
    const lines = await readNdjsonStream(stream);

    const textEvents = lines.filter((l) => l.type === "text");
    expect(textEvents).toEqual([
      { type: "text", content: "Die Frist ist der 15. August." },
    ]);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("sends only the fail-closed message when hedging persists after the retry", async () => {
    mockCreate
      .mockResolvedValueOnce(
        fakeOpenAIStream([{ content: "Vermutlich ist die Frist bald." }]),
      )
      .mockResolvedValueOnce(
        mockChatResponse("Wahrscheinlich ist die Frist bald."),
      );

    const stream = await streamAgenticAnswer("Wann?", [], makeToolContext());
    const lines = await readNdjsonStream(stream);

    const textEvents = lines.filter((l) => l.type === "text");
    expect(textEvents).toEqual([
      { type: "text", content: FAIL_CLOSED_HEDGING },
    ]);
    // Nothing hedged ever reached the client.
    const streamedText = textEvents.map((e) => e.content).join("");
    expect(containsHedgingLanguage(streamedText)).toBe(false);
  });

  it("replaces the partial answer when hedging is detected mid-stream", async () => {
    // The first chunk is past the release threshold and streams live; the
    // hedging phrase only completes in a later chunk. The already-visible
    // partial answer must be replaced by the regenerated one — the client
    // never keeps a mix.
    const cleanChunk =
      "Die Frist für das Kita-Formular läuft schon sehr bald ab, ";
    mockCreate
      .mockResolvedValueOnce(
        fakeOpenAIStream([
          { content: cleanChunk },
          { content: "vermutlich sogar morgen." },
        ]),
      )
      .mockResolvedValueOnce(
        mockChatResponse("Die Frist ist der 15. August."),
      );

    const stream = await streamAgenticAnswer(
      "Wann ist die Frist?",
      [],
      makeToolContext(),
    );
    const lines = await readNdjsonStream(stream);

    expect(lines).toContainEqual({ type: "text", content: cleanChunk });
    expect(lines.filter((l) => l.type === "replace")).toEqual([
      { type: "replace", content: "Die Frist ist der 15. August." },
    ]);

    // Reconstruct what the client shows: partial text, then replacement.
    let visible = "";
    for (const line of lines) {
      if (line.type === "text") visible += line.content as string;
      if (line.type === "replace") visible = line.content as string;
    }
    expect(visible).toBe("Die Frist ist der 15. August.");
    expect(containsHedgingLanguage(visible)).toBe(false);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("catches a hedging phrase split across chunk boundaries", async () => {
    // The first chunk ends with "Ich gla" and streams out (not yet a
    // forbidden phrase); the completing "ube, …" must be caught by the
    // rolling tail check before it shows.
    mockCreate
      .mockResolvedValueOnce(
        fakeOpenAIStream([
          { content: "Zum Thema Frist in deinen ganzen Unterlagen: Ich gla" },
          { content: "ube, die Frist ist bald." },
        ]),
      )
      .mockResolvedValueOnce(
        mockChatResponse("Die Frist ist der 15. August."),
      );

    const stream = await streamAgenticAnswer("Wann?", [], makeToolContext());
    const lines = await readNdjsonStream(stream);

    expect(lines.filter((l) => l.type === "replace")).toEqual([
      { type: "replace", content: "Die Frist ist der 15. August." },
    ]);
    // The completing chunk never reached the client as text.
    expect(
      lines.some(
        (l) => l.type === "text" && String(l.content).includes("ube"),
      ),
    ).toBe(false);
  });

  it("retracts the partial answer when the model stream fails mid-answer", async () => {
    // The connection drops after text already streamed — the partial,
    // unpersisted answer must not stay on screen next to the error.
    const cleanChunk =
      "Die Frist für das Kita-Formular läuft schon sehr bald ab, ";
    mockCreate.mockResolvedValueOnce(
      fakeOpenAIStreamThenThrow(
        [{ content: cleanChunk }],
        new Error("connection reset"),
      ),
    );

    const stream = await streamAgenticAnswer("Wann?", [], makeToolContext());
    const lines = await readNdjsonStream(stream);

    expect(lines).toContainEqual({ type: "text", content: cleanChunk });
    expect(lines).toContainEqual({ type: "replace", content: "" });
    expect(lines[lines.length - 1]).toMatchObject({
      type: "error",
      code: "CHAT_FAILED",
    });

    // Reconstructing the client view ends with an empty bubble.
    let visible = "";
    for (const line of lines) {
      if (line.type === "text") visible += line.content as string;
      if (line.type === "replace") visible = line.content as string;
    }
    expect(visible).toBe("");
  });

  it("emits no retraction when the stream fails before any text was released", async () => {
    mockCreate.mockResolvedValueOnce(
      fakeOpenAIStreamThenThrow(
        [{ content: "kurz" }],
        new Error("connection reset"),
      ),
    );

    const stream = await streamAgenticAnswer("Wann?", [], makeToolContext());
    const lines = await readNdjsonStream(stream);

    expect(lines.some((l) => l.type === "replace")).toBe(false);
    expect(lines[lines.length - 1]).toMatchObject({
      type: "error",
      code: "CHAT_FAILED",
    });
  });
});
