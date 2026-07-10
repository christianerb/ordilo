import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CollectionClient } from "./collection-client";
import type { Database } from "@/types/database";

type CollectionRow = Database["public"]["Tables"]["collections"]["Row"];
type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

/**
 * Collection detail page (`/sammlungen/[id]`).
 *
 * Server component that fetches:
 * - The collection by ID (RLS-scoped to the user's family)
 * - Documents whose `category` matches the collection's `name`
 *   (case-insensitive) — see supabase/migrations/0012_collections.sql for
 *   why collections are backed by the existing category field instead of
 *   a dedicated foreign key.
 *
 * If the collection doesn't exist or doesn't belong to the user's family,
 * returns 404 (RLS-scoped query returns no row).
 */
export default async function CollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: collection } = await supabase
    .from("collections")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!collection) {
    notFound();
  }

  const typedCollection = collection as CollectionRow;

  const { data: docData } = await supabase
    .from("documents")
    .select(
      "id, title, original_filename, mime_type, status, document_type, created_at",
    )
    .eq("family_id", typedCollection.family_id)
    .ilike("category", typedCollection.name)
    .order("created_at", { ascending: false });

  const documents = (docData ?? []) as Array<
    Pick<
      DocumentRow,
      | "id"
      | "title"
      | "original_filename"
      | "mime_type"
      | "status"
      | "document_type"
      | "created_at"
    >
  >;

  return (
    <CollectionClient collection={typedCollection} documents={documents} />
  );
}
