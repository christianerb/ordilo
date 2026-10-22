import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  embeddingToVectorString,
  generateEmbeddings,
} from "@/lib/ai/embeddings";

type Client = SupabaseClient<Database>;

/** Nodes embedded per scheduler run; the queue drains over a few runs. */
export const LABEL_BACKFILL_BATCH = 50;

/**
 * Give knowledge-graph nodes without a label vector one, so the graph can
 * match them semantically ("Kindergarten" → "Hamburger Kita").
 *
 * Nodes lack a vector when the embedding call failed during confirm (label
 * embeddings are best-effort there), when a migration rebuilt a graph from
 * stored entities, or when an old vector from a previous embedding model
 * was cleared. Runs with the service-role client from the job scheduler.
 *
 * @returns the number of nodes that received a vector.
 */
export async function backfillNodeLabelEmbeddings(
  client: Client,
  limit: number = LABEL_BACKFILL_BATCH,
): Promise<number> {
  const { data: nodes, error } = await client
    .from("knowledge_nodes")
    .select("id, label")
    .is("label_embedding", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error || !nodes || nodes.length === 0) return 0;

  const vectors = await generateEmbeddings(
    nodes.map((node, index) => ({ text: node.label, index })),
  );

  const updates = await Promise.all(
    nodes.map((node, i) =>
      client
        .from("knowledge_nodes")
        .update({ label_embedding: embeddingToVectorString(vectors[i]) })
        .eq("id", node.id)
        .is("label_embedding", null),
    ),
  );

  return updates.filter((update) => !update.error).length;
}
