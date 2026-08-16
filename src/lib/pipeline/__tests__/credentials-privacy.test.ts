import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A login's URL and user name must not reach OpenAI or the search index.
 *
 * They stay in `documents.ocr_text` (the detail panel and the chat card
 * read them there, server-side) but are stripped from the two paths that
 * hand document text to the model: the analysis and the embeddings.
 */

const runExtraction = vi.fn();
vi.mock("@/lib/ai/extraction", () => ({
  runExtraction: (...args: unknown[]) => runExtraction(...args),
  ExtractionError: class ExtractionError extends Error {},
}));

const generateEmbeddings = vi.fn();
vi.mock("@/lib/ai/embeddings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/embeddings")>();
  return {
    ...actual,
    generateEmbeddings: (...args: unknown[]) => generateEmbeddings(...args),
    generateSyntheticQuestions: () => [],
  };
});

import { performAnalyzeStep } from "@/lib/pipeline/analyze-step";
import { buildDocumentEmbeddings } from "@/lib/pipeline/embed-step";

const CREDENTIALS_BODY =
  "- **URL:** https://www.netflix.com\n" +
  "- **Benutzername:** familie@example.de\n\n" +
  "Familienaccount, vier Profile";

/**
 * Client mock covering the reads both steps make: a documents row, page
 * rows, and the empty list results every other query resolves to.
 */
function makeClient({
  documentType = "credentials",
  pageMarkdown = CREDENTIALS_BODY,
}: { documentType?: string; pageMarkdown?: string } = {}) {
  const documentRow = {
    id: "doc-1",
    title: "Netflix",
    summary: "Streaming-Zugang",
    document_type: documentType,
    ocr_text: pageMarkdown,
  };

  const chain = (rows: unknown[]) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      is: () => builder,
      not: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => Promise.resolve({ data: documentRow, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return builder;
  };

  return {
    from: (table: string) =>
      chain(
        table === "document_pages"
          ? [{ ocr_markdown: pageMarkdown, page_number: 1 }]
          : [],
      ),
  } as unknown as Parameters<typeof buildDocumentEmbeddings>[0];
}

/** Sentinel that stops the analysis right after the extraction call. */
const STOP = new Error("stop-after-extraction");

describe("credentials stay out of the analysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runExtraction.mockRejectedValue(STOP);
  });

  it("hands the description to the LLM, never URL or user name", async () => {
    await expect(
      performAnalyzeStep(makeClient(), {
        id: "doc-1",
        family_id: "fam-1",
        ocr_text: CREDENTIALS_BODY,
        source: "manual",
        title: "Netflix",
        document_type: "credentials",
        wasConfirmed: true,
      }),
    ).rejects.toBe(STOP);

    const text = runExtraction.mock.calls[0][0] as string;
    expect(text).toBe("Familienaccount, vier Profile");
    expect(text).not.toContain("familie@example.de");
    expect(text).not.toContain("netflix.com");
  });

  it("falls back to the title when the login had no description", async () => {
    const onlyFields = "- **Benutzername:** admin";

    await expect(
      performAnalyzeStep(makeClient({ pageMarkdown: onlyFields }), {
        id: "doc-1",
        family_id: "fam-1",
        ocr_text: onlyFields,
        source: "manual",
        title: "WLAN",
        document_type: "credentials",
        wasConfirmed: true,
      }),
    ).rejects.toBe(STOP);

    // Empty text would throw NoOcrTextError — the name carries it instead.
    expect(runExtraction.mock.calls[0][0]).toBe("WLAN");
  });

  it("leaves an ordinary document's text untouched", async () => {
    const note = "- **URL:** https://example.de steht hier als Zitat";

    await expect(
      performAnalyzeStep(makeClient({ documentType: "note", pageMarkdown: note }), {
        id: "doc-1",
        family_id: "fam-1",
        ocr_text: note,
        source: "manual",
        title: "Notiz",
        document_type: "note",
        wasConfirmed: true,
      }),
    ).rejects.toBe(STOP);

    expect(runExtraction.mock.calls[0][0]).toBe(note);
  });
});

describe("credentials stay out of the search index", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateEmbeddings.mockImplementation((chunks: { text: string }[]) =>
      Promise.resolve(chunks.map(() => [0.1, 0.2, 0.3])),
    );
  });

  it("embeds and stores the description only", async () => {
    const rows = await buildDocumentEmbeddings(makeClient(), "doc-1");

    const stored = JSON.stringify(rows);
    expect(stored).not.toContain("familie@example.de");
    expect(stored).not.toContain("netflix.com");
    expect(stored).toContain("Familienaccount");

    // Not even the text sent to OpenAI carries them.
    const embedded = JSON.stringify(generateEmbeddings.mock.calls);
    expect(embedded).not.toContain("familie@example.de");
  });

  it("indexes nothing rather than the login when there is no description", async () => {
    const rows = await buildDocumentEmbeddings(
      makeClient({ pageMarkdown: "- **Benutzername:** admin" }),
      "doc-1",
    );

    expect(rows).toEqual([]);
    expect(generateEmbeddings).not.toHaveBeenCalled();
  });

  it("indexes an ordinary document in full", async () => {
    const note = "Zettel am Router mit dem WLAN-Code";
    const rows = await buildDocumentEmbeddings(
      makeClient({ documentType: "note", pageMarkdown: note }),
      "doc-1",
    );

    expect(JSON.stringify(rows)).toContain("Zettel am Router");
  });
});
