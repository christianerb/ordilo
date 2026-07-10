"use server";

import { createClient } from "@/lib/supabase/server";
import { validateCollectionInput } from "@/lib/schemas/collections";
import type { Database } from "@/types/database";

/**
 * Server actions for collections ("Sammlungen") — persistent, user-defined
 * document folders shown in the sidebar.
 *
 * A collection is backed by the existing `documents.category` free-text
 * field: a collection's documents are those whose `category` matches the
 * collection's `name` (case-insensitive). See
 * supabase/migrations/0012_collections.sql.
 */

type FamilyRow = Database["public"]["Tables"]["families"]["Row"];
type CollectionRow = Database["public"]["Tables"]["collections"]["Row"];

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/** Friendly German error used for unexpected failures. */
const FRIENDLY_ERROR = "Etwas ist schiefgelaufen. Bitte versuche es erneut.";

/**
 * Fetch the authenticated user's family (RLS-scoped — only returns the
 * family created_by the current user).
 */
async function getUserFamily(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ data: Pick<FamilyRow, "id" | "name"> | null; error: string | null }> {
  const { data, error } = await supabase
    .from("families")
    .select("id, name")
    .limit(1)
    .maybeSingle();

  if (error) {
    return { data: null, error: FRIENDLY_ERROR };
  }
  return { data, error: null };
}

/**
 * Create a new collection for the authenticated user's family.
 *
 * @param input - name (required), icon key, color key.
 * @returns The created collection row on success, or a German error.
 */
export async function createCollection(input: {
  name: string;
  icon: string;
  color: string;
}): Promise<ActionResult<CollectionRow>> {
  const validation = validateCollectionInput(input);
  if (!validation.success) {
    return { success: false, error: validation.error };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  const { data: family, error: familyError } = await getUserFamily(supabase);
  if (familyError || !family) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  const { data: collection, error: insertError } = await supabase
    .from("collections")
    .insert({
      family_id: family.id,
      name: validation.data.name,
      icon: validation.data.icon,
      color: validation.data.color,
    })
    .select("*")
    .single();

  if (insertError || !collection) {
    // Unique violation → a collection with this name already exists.
    if (insertError?.code === "23505") {
      return {
        success: false,
        error: "Diese Sammlung gibt es schon.",
      };
    }
    return { success: false, error: FRIENDLY_ERROR };
  }

  return { success: true, data: collection };
}

/**
 * Update an existing collection (rename, or change icon/color).
 *
 * When the name changes, any documents whose `category` matched the OLD
 * name are updated to the NEW name — this keeps the collection's document
 * list intact after a rename, since the link is by name, not by ID.
 *
 * @param collectionId - The UUID of the collection to update.
 * @param input - name (required), icon key, color key.
 * @returns The updated collection row on success, or a German error.
 */
export async function updateCollection(
  collectionId: string,
  input: { name: string; icon: string; color: string },
): Promise<ActionResult<CollectionRow>> {
  const validation = validateCollectionInput(input);
  if (!validation.success) {
    return { success: false, error: validation.error };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  const { data: family, error: familyError } = await getUserFamily(supabase);
  if (familyError || !family) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  // Verify the collection exists and belongs to the user's family.
  const { data: existing, error: fetchError } = await supabase
    .from("collections")
    .select("id, family_id, name")
    .eq("id", collectionId)
    .maybeSingle();

  if (fetchError || !existing || existing.family_id !== family.id) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  const nameChanged =
    existing.name.toLowerCase() !== validation.data.name.toLowerCase();

  const { data: updated, error: updateError } = await supabase
    .from("collections")
    .update({
      name: validation.data.name,
      icon: validation.data.icon,
      color: validation.data.color,
    })
    .eq("id", collectionId)
    .select("*")
    .single();

  if (updateError || !updated) {
    if (updateError?.code === "23505") {
      return {
        success: false,
        error: "Diese Sammlung gibt es schon.",
      };
    }
    return { success: false, error: FRIENDLY_ERROR };
  }

  // Cascade the rename onto matching documents so the collection keeps
  // its contents (best-effort — the collection itself is already renamed
  // even if this secondary update fails).
  if (nameChanged) {
    await supabase
      .from("documents")
      .update({ category: validation.data.name })
      .eq("family_id", family.id)
      .ilike("category", existing.name);
  }

  return { success: true, data: updated };
}

/**
 * Delete a collection.
 *
 * Only removes the sidebar folder — documents keep their `category`
 * value untouched, so they still surface as a filter chip in Suche.
 *
 * @param collectionId - The UUID of the collection to delete.
 * @returns `{ success: true, data: null }` on success, or a German error.
 */
export async function deleteCollection(
  collectionId: string,
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  const { data: family, error: familyError } = await getUserFamily(supabase);
  if (familyError || !family) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  const { data: existing, error: fetchError } = await supabase
    .from("collections")
    .select("id, family_id")
    .eq("id", collectionId)
    .maybeSingle();

  if (fetchError || !existing || existing.family_id !== family.id) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  const { error: deleteError } = await supabase
    .from("collections")
    .delete()
    .eq("id", collectionId);

  if (deleteError) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  return { success: true, data: null };
}
