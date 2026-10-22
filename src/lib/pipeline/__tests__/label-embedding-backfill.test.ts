import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

vi.mock("@/lib/ai/embeddings", () => ({
  generateEmbeddings: vi.fn(async (chunks: { text: string }[]) =>
    chunks.map((_, i) => [i, 0.5]),
  ),
  embeddingToVectorString: (v: number[]) => `[${v.join(",")}]`,
}));

import { generateEmbeddings } from "@/lib/ai/embeddings";
import { backfillNodeLabelEmbeddings } from "@/lib/pipeline/label-embedding-backfill";

function mockClient(nodes: { id: string; label: string }[]) {
  const updates: { id: string; vector: unknown }[] = [];
  const selectQuery = {
    select: () => selectQuery,
    is: () => selectQuery,
    order: () => selectQuery,
    limit: async () => ({ data: nodes, error: null }),
  };
  const client = {
    from: () => ({
      ...selectQuery,
      update: (values: { label_embedding: unknown }) => ({
        eq: (_column: string, id: string) => ({
          is: async () => {
            updates.push({ id, vector: values.label_embedding });
            return { error: null };
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;
  return { client, updates };
}

describe("backfillNodeLabelEmbeddings", () => {
  it("embeds every node without a vector, each with its own label's vector", async () => {
    const { client, updates } = mockClient([
      { id: "n1", label: "Hamburger Kita" },
      { id: "n2", label: "Audi BKK" },
    ]);

    await expect(backfillNodeLabelEmbeddings(client)).resolves.toBe(2);
    expect(generateEmbeddings).toHaveBeenCalledWith([
      { text: "Hamburger Kita", index: 0 },
      { text: "Audi BKK", index: 1 },
    ]);
    expect(updates).toEqual([
      { id: "n1", vector: "[0,0.5]" },
      { id: "n2", vector: "[1,0.5]" },
    ]);
  });

  it("does nothing when every node already has a vector", async () => {
    vi.mocked(generateEmbeddings).mockClear();
    const { client } = mockClient([]);
    await expect(backfillNodeLabelEmbeddings(client)).resolves.toBe(0);
    expect(generateEmbeddings).not.toHaveBeenCalled();
  });
});
