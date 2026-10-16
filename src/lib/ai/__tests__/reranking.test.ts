import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchResult } from "@/lib/schemas/search";
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({ default: class { responses = { create }; } }));
import { rerankResults } from "../reranking";

const results: SearchResult[] = [
  { document_id: "tax", title: "Steuer-ID", chunk_text: "Steuerliche Identifikationsnummer", score: 1, source: "semantic" },
  { document_id: "degree", title: "Masterzeugnis FOM", chunk_text: "Big Data & Business Analytics", score: 0.5, source: "lexical" },
];
beforeEach(() => { vi.stubEnv("OPENAI_API_KEY", "test-key"); create.mockReset(); });

describe("document search relevance", () => {
  it("rejects unrelated hits even in a small first-search result set", async () => {
    create.mockResolvedValue({ output_text: "1:0\n2:10" });
    const ranked = await rerankResults("Masterzeugnis FOM", results);
    expect(ranked.map(result => result.document_id)).toEqual(["degree"]);
  });
  it("preserves the requested document type when a later search broadens to a person", async () => {
    create.mockResolvedValue({output_text:"1:0\n2:10"});
    const question = "Suche mein Masterzeugnis der FOM";
    const ranked = await rerankResults("Mira Beispiel", results, question);
    expect(ranked.map(result => result.document_id)).toEqual(["degree"]);
    expect(create.mock.calls[0][0].input).toContain(`Ursprüngliche Nutzerfrage: "${question}"`);
    expect(create.mock.calls[0][0].input).toContain('Aktueller Suchschritt: "Mira Beispiel"');
  });
  it("returns no candidates when none answers the document request", async () => {
    create.mockResolvedValue({ output_text: "1:0" });
    expect(await rerankResults("Masterzeugnis FOM", results.slice(0, 1))).toEqual([]);
  });
  it("requires complete judgements before accepting document candidates", async () => {
    create.mockResolvedValue({ output_text: "1:0\n2:unknown" });
    await expect(rerankResults("Masterzeugnis FOM", results)).rejects.toThrow("geprüft");
  });
  it("rejects a stalled relevance check and cancels its request", async () => {
    vi.useFakeTimers();
    try {
      create.mockReturnValue(new Promise(() => {}));
      const pending = rerankResults("Masterzeugnis FOM", results);
      const rejected = expect(pending).rejects.toThrow("geprüft");
      await vi.advanceTimersByTimeAsync(4000);
      await rejected;
      expect(create.mock.calls[0][1].signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
  it("does not pass unverified candidates through on service failure", async () => {
    create.mockRejectedValue(new Error("offline"));
    await expect(rerankResults("Masterzeugnis FOM", results)).rejects.toThrow("geprüft");
  });
});
