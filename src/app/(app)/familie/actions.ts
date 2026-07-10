"use server";

import { createClient } from "@/lib/supabase/server";
import { validateMember, validateFamilyName } from "@/lib/schemas/onboarding";
import type { Database } from "@/types/database";

/**
 * Server actions for the family management page (`/familie`).
 *
 * These actions handle adding, editing, and removing family members with:
 * - Zod validation (German error messages via the shared onboarding schema)
 * - RLS-scoped queries (the server client uses the user's session)
 * - Ownership checks (the member must belong to the user's family)
 * - Friendly German error messages on failures
 */

type FamilyRow = Database["public"]["Tables"]["families"]["Row"];
type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/** Friendly German error used for unexpected failures. */
const FRIENDLY_ERROR = "Etwas ist schiefgelaufen. Bitte versuche es erneut.";

/**
 * Input shape for member add/edit operations.
 * Only `name` is required; the optional fields default to empty strings.
 */
export interface MemberInput {
  name: string;
  role?: string;
  birthdate?: string;
  avatar_color?: string;
  related_member_id?: string;
  relationship_label?: string;
}

/**
 * Verify that `relatedMemberId` refers to an existing member of `familyId`.
 * Prevents cross-family references (a user could otherwise reference any
 * UUID, including members of other families).
 */
async function verifyRelatedMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  relatedMemberId: string,
  familyId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("family_members")
    .select("id, family_id")
    .eq("id", relatedMemberId)
    .maybeSingle();
  return !error && !!data && data.family_id === familyId;
}

/**
 * Fetch the authenticated user's family (RLS-scoped — only returns the
 * family created_by the current user).
 *
 * @returns The family row, or null if the user has no family.
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
 * Add a new family member to the authenticated user's family.
 *
 * @param input - Member data: name (required), role/birthdate/avatar_color (optional).
 * @returns The created member row on success, or a German error.
 */
export async function addFamilyMember(
  input: MemberInput,
): Promise<ActionResult<MemberRow>> {
  // Validate input — German validation messages.
  const validation = validateMember({
    name: input.name,
    role: input.role ?? "",
    birthdate: input.birthdate ?? "",
    avatar_color: input.avatar_color ?? "",
    related_member_id: input.related_member_id ?? "",
    relationship_label: input.relationship_label ?? "",
  });
  if (!validation.success) {
    return { success: false, error: validation.error };
  }

  const supabase = await createClient();

  // Require an authenticated session.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  // Fetch the user's family (RLS-scoped).
  const { data: family, error: familyError } = await getUserFamily(supabase);
  if (familyError || !family) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  // A related member reference must belong to the same family.
  if (
    validation.data.related_member_id &&
    !(await verifyRelatedMember(supabase, validation.data.related_member_id, family.id))
  ) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  // Insert the family member.
  const { data: member, error: insertError } = await supabase
    .from("family_members")
    .insert({
      family_id: family.id,
      name: validation.data.name,
      role: validation.data.role,
      birthdate: validation.data.birthdate,
      avatar_color: validation.data.avatar_color,
      related_member_id: validation.data.related_member_id,
      relationship_label: validation.data.relationship_label,
    })
    .select("*")
    .single();

  if (insertError || !member) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  return { success: true, data: member };
}

/**
 * Update an existing family member.
 *
 * The member must belong to the authenticated user's family (checked via
 * a scoped query before updating). Name is required; optional fields that
 * are empty strings are normalized to null.
 *
 * @param memberId - The UUID of the member to update.
 * @param input - Updated member data: name (required), role/birthdate/avatar_color (optional).
 * @returns The updated member row on success, or a German error.
 */
export async function updateFamilyMember(
  memberId: string,
  input: MemberInput,
): Promise<ActionResult<MemberRow>> {
  // Validate input — German validation messages.
  const validation = validateMember({
    name: input.name,
    role: input.role ?? "",
    birthdate: input.birthdate ?? "",
    avatar_color: input.avatar_color ?? "",
    related_member_id: input.related_member_id ?? "",
    relationship_label: input.relationship_label ?? "",
  });
  if (!validation.success) {
    return { success: false, error: validation.error };
  }

  // A member cannot be related to itself.
  if (validation.data.related_member_id === memberId) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  const supabase = await createClient();

  // Require an authenticated session.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  // Fetch the user's family (RLS-scoped).
  const { data: family, error: familyError } = await getUserFamily(supabase);
  if (familyError || !family) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  // Verify the member exists and belongs to the user's family.
  const { data: existing, error: fetchError } = await supabase
    .from("family_members")
    .select("id, family_id")
    .eq("id", memberId)
    .maybeSingle();

  if (fetchError || !existing || existing.family_id !== family.id) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  // A related member reference must belong to the same family.
  if (
    validation.data.related_member_id &&
    !(await verifyRelatedMember(supabase, validation.data.related_member_id, family.id))
  ) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  // Update the member.
  const { data: updated, error: updateError } = await supabase
    .from("family_members")
    .update({
      name: validation.data.name,
      role: validation.data.role,
      birthdate: validation.data.birthdate,
      avatar_color: validation.data.avatar_color,
      related_member_id: validation.data.related_member_id,
      relationship_label: validation.data.relationship_label,
    })
    .eq("id", memberId)
    .select("*")
    .single();

  if (updateError || !updated) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  return { success: true, data: updated };
}

/**
 * Rename the authenticated user's family.
 *
 * @param name - The new family name (required, max 100 chars).
 * @returns The new name on success, or a German error.
 */
export async function updateFamilyName(
  name: string,
): Promise<ActionResult<{ name: string }>> {
  const validation = validateFamilyName(name);
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

  const { data: updated, error: updateError } = await supabase
    .from("families")
    .update({ name: validation.data.name })
    .eq("id", family.id)
    .select("name")
    .single();

  if (updateError || !updated) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  return { success: true, data: { name: updated.name } };
}

/**
 * Remove a family member.
 *
 * The member must belong to the authenticated user's family (checked via
 * a scoped query before deleting). Removing the last member is allowed —
 * the family row is not affected.
 *
 * @param memberId - The UUID of the member to remove.
 * @returns `{ success: true, data: null }` on success, or a German error.
 */
export async function removeFamilyMember(
  memberId: string,
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  // Require an authenticated session.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  // Fetch the user's family (RLS-scoped).
  const { data: family, error: familyError } = await getUserFamily(supabase);
  if (familyError || !family) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  // Verify the member exists and belongs to the user's family.
  const { data: existing, error: fetchError } = await supabase
    .from("family_members")
    .select("id, family_id")
    .eq("id", memberId)
    .maybeSingle();

  if (fetchError || !existing || existing.family_id !== family.id) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  // Delete the member.
  const { error: deleteError } = await supabase
    .from("family_members")
    .delete()
    .eq("id", memberId);

  if (deleteError) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  return { success: true, data: null };
}

// ---------------------------------------------------------------------------
// Inventory items
// ---------------------------------------------------------------------------

type InventoryItemRow = Database["public"]["Tables"]["family_inventory_items"]["Row"];

export interface InventoryItemInput {
  name: string;
  item_type: string;
  tags?: string[];
  linked_member_id?: string | null;
  metadata?: Record<string, unknown>;
}

export async function addInventoryItem(
  input: InventoryItemInput,
): Promise<ActionResult<InventoryItemRow>> {
  const supabase = await createClient();

  const { data: family, error: familyError } = await getUserFamily(supabase);
  if (familyError || !family) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  if (!input.name.trim()) {
    return { success: false, error: "Bitte einen Namen eingeben." };
  }

  const validTypes = [
    "vehicle", "insurance", "bank_account", "property",
    "contract", "device", "other",
  ];
  if (!validTypes.includes(input.item_type)) {
    return { success: false, error: "Ungültiger Typ." };
  }

  const { data, error } = await supabase
    .from("family_inventory_items")
    .insert({
      family_id: family.id,
      name: input.name.trim(),
      item_type: input.item_type,
      tags: input.tags ?? [],
      linked_member_id: input.linked_member_id ?? null,
      metadata: input.metadata ?? {},
      status: "confirmed",
    })
    .select()
    .single();

  if (error || !data) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  return { success: true, data: data as InventoryItemRow };
}

export async function removeInventoryItem(
  itemId: string,
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  const { data: family, error: familyError } = await getUserFamily(supabase);
  if (familyError || !family) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  const { error } = await supabase
    .from("family_inventory_items")
    .delete()
    .eq("id", itemId);

  if (error) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  return { success: true, data: null };
}

export async function confirmSuggestedInventoryItem(
  itemId: string,
): Promise<ActionResult<InventoryItemRow>> {
  const supabase = await createClient();

  const { data: family, error: familyError } = await getUserFamily(supabase);
  if (familyError || !family) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  const { data, error } = await supabase
    .from("family_inventory_items")
    .update({ status: "confirmed", updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .select()
    .single();

  if (error || !data) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  return { success: true, data: data as InventoryItemRow };
}
