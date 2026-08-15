import type { createClient as createServerClient } from "@/lib/supabase/server";
import { canonicalizeCategory } from "@/lib/categories";

type ServerClient = Awaited<ReturnType<typeof createServerClient>>;

/**
 * Look up the family's canonical spelling for a suggested category.
 *
 * Reads the family's existing document categories and collection names,
 * then snaps the suggestion onto them (`documents.category ===
 * collection.name` is what files a document into a collection).
 * Best-effort: on a read failure the suggested spelling is returned
 * unchanged — canonicalization is a bonus, never a reason to fail a write.
 *
 * Shared by confirm and update, so a collection typed while editing a
 * confirmed document lands the document in the same place it would have
 * on the first pass.
 */
export async function canonicalizeCategoryForFamily(
  client: ServerClient,
  familyId: string,
  suggested: string,
): Promise<string> {
  try {
    const [{ data: categoryDocs }, { data: collectionRows }] =
      await Promise.all([
        client
          .from("documents")
          .select("category")
          .eq("family_id", familyId)
          .not("category", "is", null),
        client.from("collections").select("name").eq("family_id", familyId),
      ]);

    return canonicalizeCategory(
      suggested,
      [
        ...new Set(
          (categoryDocs ?? [])
            .map((d) => d.category)
            .filter((c): c is string => Boolean(c)),
        ),
      ],
      (collectionRows ?? []).map((c) => c.name),
    );
  } catch {
    return suggested;
  }
}
