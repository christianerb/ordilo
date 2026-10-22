import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/embeddings", () => ({
  generateQueryEmbedding: vi.fn(async () => [0.1, 0.2]),
  generateEmbeddings: vi.fn(),
  embeddingToVectorString: vi.fn((v: number[]) => `[${v.join(",")}]`),
}));
vi.mock("@/lib/ai/query-expansion", () => ({
  expandQuery: vi.fn(async () => null),
}));

import {
  clearQueryEmbeddingCache,
  extractKeywords,
  graphLabelPatterns,
  graphSearch,
  GRAPH_SEMANTIC_THRESHOLD,
  scoreGraphNeighbourhood,
  semanticSeedScore,
} from "@/lib/ai/search";
import type { createClient as createServerClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createServerClient>>;

const FAMILY_ID = "660e8400-e29b-41d4-a716-446655440001";

// ---------------------------------------------------------------------------
// extractKeywords
// ---------------------------------------------------------------------------

describe("extractKeywords", () => {
  it("splits hyphenated compounds instead of gluing them together", () => {
    const keywords = extractKeywords("Wann läuft der Kita-Gutschein aus?");
    expect(keywords).toContain("kita");
    expect(keywords).toContain("gutschein");
    expect(keywords).toContain("kita-gutschein");
    expect(keywords).not.toContain("kitagutschein");
  });

  it("keeps umlauts and drops stop words and short parts", () => {
    const keywords = extractKeywords("Wie ist die Steuer-ID für Jürgen?");
    expect(keywords).toContain("steuer");
    expect(keywords).toContain("steuer-id");
    expect(keywords).toContain("jürgen");
    expect(keywords).not.toContain("id");
    expect(keywords).not.toContain("die");
  });

  it("builds bigrams across compound parts", () => {
    expect(extractKeywords("Audi-BKK Beitrag")).toContain("bkk beitrag");
  });

  it("ignores stray hyphens", () => {
    expect(extractKeywords("Rechnung - Stadtwerke")).toEqual([
      "rechnung",
      "stadtwerke",
      "rechnung stadtwerke",
    ]);
  });
});

describe("graphLabelPatterns", () => {
  it("matches unigrams as substrings and bigrams as whole labels", () => {
    expect(graphLabelPatterns(["kita", "kita sonnenblume"])).toEqual([
      "%kita%",
      "kita sonnenblume",
    ]);
  });
});

describe("semanticSeedScore", () => {
  it("starts above zero at the threshold and is capped below an exact match", () => {
    expect(semanticSeedScore(GRAPH_SEMANTIC_THRESHOLD)).toBeCloseTo(0.55);
    expect(semanticSeedScore(0.99)).toBe(0.85);
  });
});

// ---------------------------------------------------------------------------
// scoreGraphNeighbourhood
// ---------------------------------------------------------------------------

const nodes = [
  { id: "doc-a", type: "document", label: "Kita-Gutschein Hanna", document_id: "A" },
  { id: "doc-b", type: "document", label: "Arztbrief Emma", document_id: "B" },
  { id: "kita", type: "organization", label: "Hamburger Kita", document_id: null },
  { id: "hanna", type: "person", label: "Hanna", document_id: null },
  { id: "emma", type: "person", label: "Emma", document_id: null },
];
const edge = (id: string, from: string, to: string, doc: string) => ({
  id,
  source_node_id: from,
  target_node_id: to,
  source_document_id: doc,
  confidence: 1,
  confirmed: true,
});
const edges = [
  edge("e1", "doc-a", "kita", "A"),
  edge("e2", "doc-a", "hanna", "A"),
  edge("e3", "doc-b", "emma", "B"),
  edge("e4", "doc-b", "hanna", "B"),
];

describe("scoreGraphNeighbourhood", () => {
  it("credits documents linked to an exact person match", () => {
    const scored = scoreGraphNeighbourhood(
      { seeds: [{ id: "hanna", similarity: null }], edges, nodes },
      ["hanna"],
    );
    expect([...scored.documentIds].sort()).toEqual(["A", "B"]);
    expect(scored.docBestNodeScore.get("A")).toBe(1);
    expect(scored.docBestNode.get("B")).toEqual({ type: "person", label: "Hanna" });
  });

  it("gives a purely semantic seed a real score", () => {
    // "Kindergarten" shares no characters with "Hamburger Kita".
    const scored = scoreGraphNeighbourhood(
      { seeds: [{ id: "kita", similarity: 0.5 }], edges, nodes },
      ["kindergarten"],
    );
    expect(scored.documentIds.has("A")).toBe(true);
    expect(scored.docBestNodeScore.get("A")).toBeGreaterThan(0.5);
    expect(scored.documentIds.has("B")).toBe(false);
  });

  it("follows two hops and decays the score", () => {
    const scored = scoreGraphNeighbourhood(
      { seeds: [{ id: "emma", similarity: null }], edges, nodes },
      ["emma"],
    );
    // Emma → doc-b (hop 1) → Hanna → … is beyond MAX_HOPS for doc-a,
    // but doc-b itself is credited directly.
    expect(scored.documentIds.has("B")).toBe(true);
    expect(scored.documentIds.has("A")).toBe(false);
  });

  it("credits a matched document node by its own label", () => {
    const scored = scoreGraphNeighbourhood(
      { seeds: [{ id: "doc-a", similarity: null }], edges, nodes },
      ["kita-gutschein", "kita", "gutschein"],
    );
    expect(scored.docBestNodeScore.get("A")).toBeGreaterThanOrEqual(0.65);
  });

  it("counts an edge once even when both of its ends are in the hop", () => {
    const scored = scoreGraphNeighbourhood(
      {
        seeds: [
          { id: "doc-a", similarity: null },
          { id: "kita", similarity: null },
        ],
        edges,
        nodes,
      },
      ["kita"],
    );
    // e1 + e2 (hop 0): e1 touches both seeds and e2 leads on to Hanna,
    // yet each counts once.
    expect(scored.docConnectionCount.get("A")).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// graphSearch (graph_traversal RPC, single round trip)
// ---------------------------------------------------------------------------

function chainable(result: { data: unknown; error: unknown }) {
  const self: Record<string, unknown> = {
    select: vi.fn(() => self),
    eq: vi.fn(() => self),
    in: vi.fn(() => self),
    or: vi.fn(() => self),
    ilike: vi.fn(() => self),
    order: vi.fn(() => self),
    limit: vi.fn(() => self),
    then: (resolve: (v: unknown) => void, reject?: (r?: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return self;
}

function mockClient(rpcResult: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => rpcResult);
  const from = vi.fn((table: string) => {
    if (table === "documents") {
      return chainable({
        data: [
          { id: "A", title: "Kita-Gutschein Hanna", status: "confirmed" },
          { id: "B", title: "Arztbrief Emma", status: "confirmed" },
        ],
        error: null,
      });
    }
    return chainable({ data: [], error: null });
  });
  return { client: { rpc, from } as unknown as ServerClient, rpc, from };
}

describe("graphSearch", () => {
  beforeEach(() => clearQueryEmbeddingCache());

  it("resolves a hyphenated compound through one graph_traversal call", async () => {
    const { client, rpc } = mockClient({
      data: { seeds: [{ id: "doc-a", similarity: null }], edges, nodes },
      error: null,
    });

    const results = await graphSearch(client, "Wann läuft der Kita-Gutschein aus?", FAMILY_ID);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "graph_traversal",
      expect.objectContaining({
        p_family_id: FAMILY_ID,
        p_patterns: expect.arrayContaining(["%kita-gutschein%", "%kita%", "%gutschein%"]),
        p_query_embedding: "[0.1,0.2]",
        p_semantic_threshold: GRAPH_SEMANTIC_THRESHOLD,
      }),
    );
    expect(results.map((r) => r.document_id)).toContain("A");
    expect(results.every((r) => r.source === "graph:traversal")).toBe(true);
  });

  it("returns nothing when the RPC fails", async () => {
    const { client } = mockClient({ data: null, error: { message: "boom" } });
    await expect(graphSearch(client, "Kita-Gutschein", FAMILY_ID)).resolves.toEqual([]);
  });
});
