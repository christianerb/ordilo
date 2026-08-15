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
  members?: { name: string; role?: string | null }[];
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

  it("separates two people's numbers on the SAME document", async () => {
    // A Steuerbescheid lists both children. The document-level person
    // signal cannot tell them apart — only the labels can.
    const client = mockClient({
      facts: [
        fact({ document_id: "doc-1", label: "Steuer-ID Emma", value: "12 345 678 901", normalized_value: "12345678901" }),
        fact({ document_id: "doc-1", label: "Steuer-ID Hanna" }),
      ],
      entities: [
        { document_id: "doc-1", normalized_value: "emma" },
        { document_id: "doc-1", normalized_value: "hanna" },
      ],
    });

    const results = await factSearch(
      client,
      "Wie ist die Steuer-ID von Hanna?",
      FAMILY_ID,
    );

    expect(results).toHaveLength(1);
    expect(results[0].chunk_text).toBe("Steuer-ID Hanna: 74 031 832 353");
  });

  it("does not answer with the person's other numbers", async () => {
    // "… von Hanna" makes "hanna" a search term too, so Hanna's other
    // numbers come back as candidates. They are the wrong KIND.
    const client = mockClient({
      facts: [
        fact({ document_id: "doc-1", label: "Kundennummer Hanna", value: "K-9912", normalized_value: "k9912" }),
        fact({ document_id: "doc-2", label: "Versichertennummer Hanna", value: "A123456789", normalized_value: "a123456789" }),
        fact({ document_id: "doc-3", label: "Steuer-ID Hanna" }),
      ],
    });

    const results = await factSearch(
      client,
      "Wie ist die Steuer-ID von Hanna?",
      FAMILY_ID,
    );

    expect(results.map((r) => r.chunk_text)).toEqual([
      "Steuer-ID Hanna: 74 031 832 353",
    ]);
  });

  it("still answers what a number IS, whatever kind it is", async () => {
    // A value hit survives the kind filter — otherwise "wem gehört diese
    // Nummer?" would be unanswerable for anything but the asked-for kind.
    const client = mockClient({
      facts: [
        fact({ document_id: "doc-1", label: "Kundennummer Hanna", value: "74 031 832 353" }),
        fact({ document_id: "doc-2", label: "Steuer-ID Emma", value: "12 345 678 901", normalized_value: "12345678901" }),
      ],
    });

    const results = await factSearch(
      client,
      "Was ist die Nummer 74 031 832 353?",
      FAMILY_ID,
    );

    expect(results.map((r) => r.chunk_text)).toContain(
      "Kundennummer Hanna: 74 031 832 353",
    );
  });

  it("understands the possessive families ask in", async () => {
    // "Hannas Steuer-ID" is how this question gets asked out loud.
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

    const results = await factSearch(client, "Wie ist Hannas Steuer-ID?", FAMILY_ID);

    expect(results.map((r) => r.chunk_text)).toEqual([
      "Steuer-ID Hanna: 74 031 832 353",
    ]);
  });

  it("answers a question asked by relationship, not by name", async () => {
    // "die Steuer-ID meiner Tochter" — the way this actually gets asked.
    const client = mockClient({
      facts: [
        fact({ document_id: "doc-1", label: "Steuer-ID Hanna" }),
        fact({
          document_id: "doc-2",
          label: "Steuer-ID Papa",
          value: "12 345 678 901",
          normalized_value: "12345678901",
        }),
      ],
      members: [
        { name: "Hanna", role: "Tochter" },
        { name: "Papa", role: "Vater" },
      ],
    });

    const results = await factSearch(
      client,
      "Wie ist die Steuer-ID meiner Tochter?",
      FAMILY_ID,
    );

    expect(results.map((r) => r.chunk_text)).toEqual([
      "Steuer-ID Hanna: 74 031 832 353",
    ]);
  });

  it("keeps both daughters when the question is plural", async () => {
    const client = mockClient({
      facts: [
        fact({ document_id: "doc-1", label: "Steuer-ID Hanna" }),
        fact({
          document_id: "doc-2",
          label: "Steuer-ID Mia",
          value: "12 345 678 901",
          normalized_value: "12345678901",
        }),
        fact({
          document_id: "doc-3",
          label: "Steuer-ID Papa",
          value: "98 765 432 100",
          normalized_value: "98765432100",
        }),
      ],
      members: [
        { name: "Hanna", role: "Tochter" },
        { name: "Mia", role: "Tochter" },
        { name: "Papa", role: "Vater" },
      ],
    });

    const results = await factSearch(
      client,
      "Wie sind die Steuer-IDs meiner Töchter?",
      FAMILY_ID,
    );

    expect(results.map((r) => r.chunk_text).sort()).toEqual([
      "Steuer-ID Hanna: 74 031 832 353",
      "Steuer-ID Mia: 12 345 678 901",
    ]);
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
