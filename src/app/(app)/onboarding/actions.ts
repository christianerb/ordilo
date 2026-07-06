"use server";

import { createClient } from "@/lib/supabase/server";
import { validateFamilyName, validateMember } from "@/lib/schemas/onboarding";
import type { Database } from "@/types/database";

/**
 * Server actions for the conversational onboarding flow.
 *
 * These actions handle family and member creation with:
 * - Zod validation (German error messages)
 * - Idempotent family creation (prevents duplicates on reload/retry)
 * - RLS-scoped queries (the server client uses the user's session)
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
 * Create a family for the authenticated user.
 *
 * This action is idempotent: if the user already has a family (e.g. from a
 * previous partial onboarding attempt or a retry), the existing family is
 * returned instead of creating a duplicate. This prevents orphaned families
 * when the user reloads mid-onboarding.
 *
 * A unique index on families.created_by (migration 0010) provides a
 * database-level guarantee that exactly one family per user exists. If a
 * concurrent request inserts a family between the pre-check and the insert
 * (race condition), the insert fails with Postgres error code 23505
 * (unique_violation). In that case, the action re-reads and returns the
 * existing family gracefully.
 *
 * @param name - The family name (required, validated with Zod)
 * @returns The family row ({ id, name }) on success, or a German error.
 */
export async function createFamily(name: string): Promise<ActionResult<Pick<FamilyRow, "id" | "name">>> {
  // Validate input — German validation messages.
  const validation = validateFamilyName(name);
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

  // Check if the user already has a family (idempotent — prevents duplicates).
  const { data: existing, error: fetchError } = await supabase
    .from("families")
    .select("id, name")
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  if (existing) {
    // Return the existing family — no duplicate created.
    return { success: true, data: { id: existing.id, name: existing.name } };
  }

  // Create a new family.
  const { data: family, error: insertError } = await supabase
    .from("families")
    .insert({
      name: validation.data.name,
      created_by: user.id,
    })
    .select("id, name")
    .single();

  if (insertError || !family) {
    // If the insert failed due to a unique constraint violation on
    // created_by (Postgres code 23505), a concurrent request created the
    // family between our pre-check and insert. Re-read and return the
    // existing family instead of surfacing an error.
    if (insertError?.code === "23505") {
      const { data: existingFamily, error: refetchError } = await supabase
        .from("families")
        .select("id, name")
        .limit(1)
        .maybeSingle();

      if (refetchError || !existingFamily) {
        return { success: false, error: FRIENDLY_ERROR };
      }

      return {
        success: true,
        data: { id: existingFamily.id, name: existingFamily.name },
      };
    }
    return { success: false, error: FRIENDLY_ERROR };
  }

  return { success: true, data: family };
}

/**
 * Add a family member during onboarding.
 *
 * @param familyId - The UUID of the family to add the member to.
 * @param input - Member data: name (required), role/birthdate/avatar_color (optional).
 * @returns The created member row on success, or a German error.
 */
export async function addMember(
  familyId: string,
  input: {
    name: string;
    role?: string;
    birthdate?: string;
    avatar_color?: string;
  },
): Promise<ActionResult<MemberRow>> {
  // Validate input — German validation messages.
  const validation = validateMember({
    name: input.name,
    role: input.role ?? "",
    birthdate: input.birthdate ?? "",
    avatar_color: input.avatar_color ?? "",
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

  // Insert the family member.
  const { data: member, error: insertError } = await supabase
    .from("family_members")
    .insert({
      family_id: familyId,
      name: validation.data.name,
      role: validation.data.role,
      birthdate: validation.data.birthdate,
      avatar_color: validation.data.avatar_color,
    })
    .select("*")
    .single();

  if (insertError || !member) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  return { success: true, data: member };
}
