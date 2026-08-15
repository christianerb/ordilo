import { describe, it, expect, vi } from "vitest";

// factSearch itself makes no OpenAI calls, but importing the search module
// pulls in the embedding/expansion helpers — stub them out.
vi.mock("@/lib/ai/embeddings", () => ({
  generateQueryEmbedding: vi.fn(),
  generateEmbeddings: vi.fn(),
  embeddingToVectorString: vi.fn(),
}));
vi.mock("@/lib/ai/query-expansion", () => ({
  expandQuery: vi.fn(),
}));

import { factSearch } from "@/lib/ai/search";
import type { createClient as createServerClient } from "@/lib/supabase/server";

const FAMILY_ID = "660e8400-e29b-41d4-a716-446655440001";

type FactRow = {
  document_id: string;
  label: string;
  value: string;
  normalized_value: string;
  confidence: number;
  confirmed: boolean;
};

/** Chainable query builder that ignores filters and resolves to `result`. */
function chainableQuery(result: { data: unknown; error: unknown }) {
  const self: Record<string, unknown> = {
    select: vi.fn(() => self),
    eq: vi.fn(() => self),
    ilike: vi.fn(() => self),
    in: vi.fn(() => self),
    or: vi.fn(() => self),
    then: vi.fn(
      (resolve: (value: unknown) => void, reject?: (reason?: unknown) => void) =>
        Promise.resolve(result).then(resolve, reject),
    ),
  };
  return self;
}

function mockClient(options: {
  facts: FactRow[];
  documents?: { id: string; title: string | null; status: string }[];
  members?: { name: string }[];
  entities?: { document_id: string; normalized_value: string }[];
}) {
  const {
    facts,
    documents = facts.map((f) => ({
      id: f.document_id,
      title: `Doc ${f.document_id}`,
      status: "confirmed",
    })),
    members = [{ name: "Emma" }, { name: "Hanna" }],
    entities = [],
  } = options;

  return {
    from: vi.fn((table: string) => {
      switch (table) {
        case "document_facts":
          return chainableQuery({ data: facts, error: null });
        case "documents":
          return chainableQuery({ data: documents, error: null });
        case "family_members":
          return chainableQuery({ data: members, error: null });
        case "extracted_entities":
          return chainableQuery({ data: entities, error: null });
        default:
          throw new Error(`Unexpected table: ${table}`);
      }
    }),
  } as unknown as Awaited<ReturnType<typeof createServerClient>>;
}

function fact(overrides: Partial<FactRow> & { document_id: string }): FactRow {
  return {
    label: "Steuer-ID",
    value: "74 031 832 353",
    normalized_value: "74031832353",
    confidence: 1,
    confirmed: true,
    ...overrides,
  };
}

describe("factSearch", () => {
  it("finds a Steuer-ID when the family asks for the 'Steuernummer'", async () => {
    const client = mockClient({
      facts: [fact({ document_id: "doc-1" })],
    });

    const results = await factSearch(
      client,
      "Wie ist die Steuernummer von Hanna?",
      FAMILY_ID,
    );

    expect(results).toHaveLength(1);
    expect(results[0].document_id).toBe("doc-1");
    expect(results[0].chunk_text).toContain("74 031 832 353");
    expect(results[0].source).toBe("fact");
  });

  it("answers with the named person's number, not a sibling's", async () => {
    const client = mockClient({
      facts: [
        fact({ document_id: "doc-hanna" }),
        fact({
          document_id: "doc-emma",
          value: "12 345 678 901",
          normalized_value: "12345678901",
        }),
      ],
      entities: [
        { document_id: "doc-hanna", normalized_value: "hanna" },
        { document_id: "doc-emma", normalized_value: "emma" },
      ],
    });

    const results = await factSearch(
      client,
      "Wie ist die Steuernummer von Hanna?",
      FAMILY_ID,
    );

    expect(results.map((r) => r.document_id)).toEqual(["doc-hanna"]);
  });

  it("scopes by the fact label when the person is only named there", async () => {
    const client = mockClient({
      facts: [
        fact({ document_id: "doc-1", label: "Steuer-ID Hanna" }),
        fact({
          document_id: "doc-2",
          label: "Steuer-ID Emma",
          value: "12 345 678 901",
          normalized_value: "12345678901",
        }),
      ],
    });

    const results = await factSearch(
      client,
      "Wie ist die Steuer-ID von Hanna?",
      FAMILY_ID,
    );

    expect(results.map((r) => r.document_id)).toEqual(["doc-1"]);
  });

  it("keeps every candidate when the query names nobody", async () => {
    const client = mockClient({
      facts: [
        fact({ document_id: "doc-1" }),
        fact({
          document_id: "doc-2",
          value: "12 345 678 901",
          normalized_value: "12345678901",
        }),
      ],
    });

    const results = await factSearch(client, "Wo sind die Steuer-IDs?", FAMILY_ID);

    expect(results).toHaveLength(2);
  });

  it("keeps every candidate when the named person matches nothing", async () => {
    // A wrong guess must never swallow the only answer there is.
    const client = mockClient({
      facts: [
        fact({ document_id: "doc-1" }),
        fact({
          document_id: "doc-2",
          value: "12 345 678 901",
          normalized_value: "12345678901",
        }),
      ],
      entities: [{ document_id: "doc-1", normalized_value: "papa" }],
    });

    const results = await factSearch(
      client,
      "Wie ist die Steuernummer von Hanna?",
      FAMILY_ID,
    );

    expect(results).toHaveLength(2);
  });

  it("finds a number nobody put in a category, by its label alone", async () => {
    // There is no type list to fall into — "Zählernummer Keller" is found
    // because that is what it is called.
    const client = mockClient({
      facts: [
        fact({
          document_id: "doc-1",
          label: "Zählernummer Keller",
          value: "1ESY1161234567",
          normalized_value: "1esy1161234567",
        }),
      ],
    });

    const results = await factSearch(
      client,
      "Wie ist die Zählernummer im Keller?",
      FAMILY_ID,
    );

    expect(results).toHaveLength(1);
    expect(results[0].chunk_text).toBe("Zählernummer Keller: 1ESY1161234567");
  });

  it("finds a shorter label from a longer compound question", async () => {
    // The question is broader than the label — "Aktenzeichennummer" has
    // to reach a fact simply called "Aktenzeichen Jugendamt".
    const client = mockClient({
      facts: [
        fact({
          document_id: "doc-1",
          label: "Aktenzeichen Jugendamt",
          value: "JA-2026-4471",
          normalized_value: "ja20264471",
        }),
      ],
    });

    const results = await factSearch(
      client,
      "Wie ist die Aktenzeichennummer?",
      FAMILY_ID,
    );

    expect(results).toHaveLength(1);
    expect(results[0].chunk_text).toBe("Aktenzeichen Jugendamt: JA-2026-4471");
  });

  it("ignores facts whose document is not confirmed", async () => {
    const client = mockClient({
      facts: [fact({ document_id: "doc-1" })],
      documents: [],
    });

    const results = await factSearch(
      client,
      "Wie ist die Steuernummer von Hanna?",
      FAMILY_ID,
    );

    expect(results).toEqual([]);
  });
});
