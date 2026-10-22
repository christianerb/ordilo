import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

vi.mock("@/lib/pipeline/document-embeddings", () => ({
  buildLabelEmbeddings: vi.fn(async () => [{ label: "Hanna", embedding: "[0.1]" }]),
}));

import { rebuildDocumentGraph } from "@/lib/pipeline/analyze-step";

const DOC_ID = "550e8400-e29b-41d4-a716-446655440000";
const FAMILY_ID = "660e8400-e29b-41d4-a716-446655440001";

const analysis = {
  title: "Kita-Gutschein",
  family_members: [{ name: "Hanna", person_id: null, role: "Kind", confidence: 0.9 }],
  organizations: [{ name: "Hamburger Kita", type: "school", confidence: 0.8 }],
} as unknown as Parameters<typeof rebuildDocumentGraph>[3];

function mockClient(error: unknown = null) {
  const rpc = vi.fn(async () => ({ data: "node-id", error }));
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

describe("rebuildDocumentGraph", () => {
  it("rebuilds the document's graph from the fresh analysis", async () => {
    const { client, rpc } = mockClient();

    await rebuildDocumentGraph(client, DOC_ID, FAMILY_ID, analysis);

    expect(rpc).toHaveBeenCalledWith("replace_document_graph", {
      p_document_id: DOC_ID,
      p_family_id: FAMILY_ID,
      p_title: "Kita-Gutschein",
      p_persons: [{ name: "Hanna", person_id: null, confidence: 0.9 }],
      p_organizations: [{ name: "Hamburger Kita", type: "school", confidence: 0.8 }],
      p_label_embeddings: [{ label: "Hanna", embedding: "[0.1]" }],
    });
  });

  it("fails loudly when the RPC fails, so the document stays retryable", async () => {
    const { client } = mockClient({ message: "boom" });
    await expect(
      rebuildDocumentGraph(client, DOC_ID, FAMILY_ID, analysis),
    ).rejects.toThrow("Wissensgraph konnte nicht aktualisiert werden.");
  });
});
