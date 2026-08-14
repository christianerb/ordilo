"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import {
  type ActionResult,
  FRIENDLY_ERROR,
  getUserFamily,
} from "@/lib/actions/result";
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

type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];

/**
 * Input shape for member add/edit operations.
 * Only `name` is required; the optional fields default to empty strings.
 */
export interface MemberInput {
  name: string;
  role?: string;
  birthdate?: string;
  avatar_color?: string;
  related_member_ids?: string[];
  relationship_label?: string;
}

/**
 * Verify that every id in `relatedMemberIds` refers to an existing member of
 * `familyId`. Prevents cross-family references (a user could otherwise
 * reference any UUID, including members of other families).
 */
async function verifyRelatedMembers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  relatedMemberIds: string[],
  familyId: string,
): Promise<boolean> {
  if (relatedMemberIds.length === 0) return true;
  const { data, error } = await supabase
    .from("family_members")
    .select("id, family_id")
    .in("id", relatedMemberIds);
  if (error || !data) return false;
  const found = new Set(data.filter((m) => m.family_id === familyId).map((m) => m.id));
  return relatedMemberIds.every((id) => found.has(id));
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
    related_member_ids: input.related_member_ids ?? [],
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

  // Every related member reference must belong to the same family.
  if (!(await verifyRelatedMembers(supabase, validation.data.related_member_ids, family.id))) {
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
      related_member_ids: validation.data.related_member_ids,
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
    related_member_ids: input.related_member_ids ?? [],
    relationship_label: input.relationship_label ?? "",
  });
  if (!validation.success) {
    return { success: false, error: validation.error };
  }

  // A member cannot be related to itself.
  if (validation.data.related_member_ids.includes(memberId)) {
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

  // Every related member reference must belong to the same family.
  if (!(await verifyRelatedMembers(supabase, validation.data.related_member_ids, family.id))) {
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
      related_member_ids: validation.data.related_member_ids,
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

/**
 * Delete the user's family and their account (DSGVO Art. 17 — right to
 * erasure).
 *
 * A family owner deletes their whole family. An invited member, including a
 * person who merged their own family into another one, may delete only their
 * own account and membership — never the shared family's data. Owner deletion
 * cascades to every family-scoped table (documents, tasks, members, chat,
 * collections, embeddings, …). Two things are NOT covered by the cascade and
 * are removed explicitly:
 *   - Storage files (document scans + member avatars) in the private buckets
 *   - The auth user itself (full account deletion; also removes the user's
 *     family_memberships rows for any other families via user_id cascade)
 *
 * @param confirmName - The family name, typed by the user to confirm. Must
 *                      match exactly (defense in depth on top of the client).
 * @returns `{ success: true, data: null }` on success, or a German error.
 */
export async function deleteFamilyAccount(
  confirmName: string,
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  // Require an authenticated session.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  // Resolve the family the user OWNS (created_by is unique, so at most one).
  const { data: family, error: familyError } = await supabase
    .from("families")
    .select("id, name")
    .eq("created_by", user.id)
    .maybeSingle();

  if (familyError) {
    return { success: false, error: FRIENDLY_ERROR };
  }
  if (!family) {
    // The user is an invited member. They may erase their own account, but
    // must never delete the shared family's records.
    const { data: sharedFamily, error: sharedFamilyError } = await getUserFamily(
      supabase,
    );
    if (sharedFamilyError || !sharedFamily) {
      return { success: false, error: FRIENDLY_ERROR };
    }
    if (confirmName.trim() !== sharedFamily.name) {
      return {
        success: false,
        error: "Der Name stimmt nicht mit dem Familiennamen überein.",
      };
    }

    const admin = createAdminClient();
    const { error: membershipError } = await admin
      .from("family_memberships")
      .delete()
      .eq("family_id", sharedFamily.id)
      .eq("user_id", user.id);
    if (membershipError) {
      return { success: false, error: FRIENDLY_ERROR };
    }

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteUserError) {
      console.error(
        "deleteFamilyAccount: failed to delete invited auth user",
        deleteUserError,
      );
    }
    return { success: true, data: null };
  }

  // Confirmation: the typed name must match the family name exactly.
  if (confirmName.trim() !== family.name) {
    return {
      success: false,
      error: "Der Name stimmt nicht mit dem Familiennamen überein.",
    };
  }

  // Privileged work (storage + auth) needs the service-role client.
  const admin = createAdminClient();

  // Collect storage paths BEFORE deleting rows — the rows hold the locations.
  const { data: docs } = await admin
    .from("documents")
    .select("file_url")
    .eq("family_id", family.id);
  const documentPaths = (docs ?? [])
    .map((d) => d.file_url)
    .filter((url): url is string => Boolean(url));

  const { data: memberRows } = await admin
    .from("family_members")
    .select("photo_url")
    .eq("family_id", family.id);
  const avatarPaths = (memberRows ?? [])
    .map((m) => m.photo_url)
    .filter((url): url is string => Boolean(url));

  // Delete the family row — cascades to all family-scoped data.
  const { error: deleteError } = await admin
    .from("families")
    .delete()
    .eq("id", family.id);

  if (deleteError) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  // Best-effort storage cleanup — orphaned files are non-fatal (the data is
  // already gone), so failures are swallowed.
  if (documentPaths.length > 0) {
    await admin.storage
      .from("documents")
      .remove(documentPaths)
      .catch(() => {});
  }
  if (avatarPaths.length > 0) {
    await admin.storage
      .from("avatars")
      .remove(avatarPaths)
      .catch(() => {});
  }

  // Delete the auth user (full account deletion). The family's data is
  // already erased — the DSGVO-relevant part — so a failure here only leaves
  // an orphaned login (no family, no data) and is logged, not fatal.
  const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteUserError) {
    console.error(
      "deleteFamilyAccount: failed to delete auth user",
      deleteUserError,
    );
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

// ---------------------------------------------------------------------------
// Family invites
// ---------------------------------------------------------------------------

/**
 * Create a shareable invite link token for the user's family.
 *
 * Only the family owner can create invites (enforced by the RLS insert
 * policy on family_invites). The token is valid for 14 days and can be
 * used by multiple people (one link for both grandparents).
 *
 * @returns The invite token on success (the client builds the full URL
 *          from window.location.origin), or a German error.
 */
export async function createFamilyInvite(): Promise<
  ActionResult<{ token: string; expires_at: string }>
> {
  const supabase = await createClient();

  const { data: family, error: familyError } = await getUserFamily(supabase);
  if (familyError || !family) {
    return { success: false, error: familyError ?? FRIENDLY_ERROR };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Bitte melde dich erneut an." };
  }

  const { data: invite, error: insertError } = await supabase
    .from("family_invites")
    .insert({ family_id: family.id, created_by: user.id })
    .select("token, expires_at")
    .single();

  if (insertError || !invite) {
    // RLS rejects non-owners — give a specific message for that case.
    return {
      success: false,
      error:
        "Einladung konnte nicht erstellt werden. Nur wer die Familie angelegt hat, kann einladen.",
    };
  }

  return {
    success: true,
    data: { token: invite.token, expires_at: invite.expires_at },
  };
}
