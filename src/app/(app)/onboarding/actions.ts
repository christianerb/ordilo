"use server";

import { createClient } from "@/lib/supabase/server";
import { type ActionResult, FRIENDLY_ERROR } from "@/lib/actions/result";
import { validateFamilyName, validateMember } from "@/lib/schemas/onboarding";
import { DEFAULT_COLLECTIONS } from "@/lib/schemas/collections";
import { recordProductEvent } from "@/lib/analytics/product-events";
import { saveMemberRelations } from "@/lib/family/relations-db";
import { familyInboundEmail } from "@/lib/family-inbound-email";
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
export async function createFamily(name: string): Promise<ActionResult<
  Pick<FamilyRow, "id" | "name"> & { inboundEmail: string | null }
>> {
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
    const { data: alias } = await supabase
      .from("family_email_aliases")
      .select("local_part")
      .eq("family_id", existing.id)
      .maybeSingle();
    return {
      success: true,
      data: {
        id: existing.id,
        name: existing.name,
        inboundEmail: familyInboundEmail(
          alias?.local_part ?? "",
          process.env.INBOUND_EMAIL_DOMAIN,
        ),
      },
    };
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

      const { data: alias } = await supabase
        .from("family_email_aliases")
        .select("local_part")
        .eq("family_id", existingFamily.id)
        .maybeSingle();
      return {
        success: true,
        data: {
          id: existingFamily.id,
          name: existingFamily.name,
          inboundEmail: familyInboundEmail(
            alias?.local_part ?? "",
            process.env.INBOUND_EMAIL_DOMAIN,
          ),
        },
      };
    }
    return { success: false, error: FRIENDLY_ERROR };
  }

  await recordProductEvent(supabase, {
    userId: user.id,
    familyId: family.id,
    eventName: "onboarding_step_completed",
    properties: { step: "family_name" },
  });

  const { data: alias } = await supabase
    .from("family_email_aliases")
    .select("local_part")
    .eq("family_id", family.id)
    .maybeSingle();

  return {
    success: true,
    data: {
      ...family,
      inboundEmail: familyInboundEmail(
        alias?.local_part ?? "",
        process.env.INBOUND_EMAIL_DOMAIN,
      ),
    },
  };
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
    is_self?: boolean;
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

  // If is_self is true, first check that no other member is already linked
  // to this user (prevents double-linking on re-add).
  let linkedUserId: string | null = null;
  if (input.is_self) {
    const { data: existingLink } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", familyId)
      .eq("linked_user_id", user.id)
      .maybeSingle();

    if (!existingLink) {
      linkedUserId = user.id;
    }
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
      linked_user_id: linkedUserId,
    })
    .select("*")
    .single();

  if (insertError || !member) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  // Mirror the role into the relationship list the /familie form edits, so
  // the chip picked here is still selected when the member is opened later.
  // Onboarding adds people one by one, so the relation has no counterpart
  // yet ("Mutter", not "Mutter von Emma") — that is added on /familie.
  if (validation.data.role) {
    const relationsSaved = await saveMemberRelations(supabase, {
      familyId,
      memberId: member.id,
      relations: [{ role: validation.data.role, member_ids: [] }],
    });
    if (!relationsSaved) {
      // A member whose role exists only on the member row is a trap: the
      // next ordinary edit reads an empty relation list and clears it.
      // Undo the insert instead and let the user try again.
      await supabase.from("family_members").delete().eq("id", member.id);
      return { success: false, error: FRIENDLY_ERROR };
    }
  }

  await recordProductEvent(supabase, {
    userId: user.id,
    familyId,
    eventName: "onboarding_step_completed",
    properties: { step: input.is_self ? "self_member_added" : "member_added" },
  });

  return { success: true, data: member };
}

/**
 * Mark onboarding as completed for the authenticated user's family.
 *
 * Sets `families.onboarding_completed_at = now()` so the auth middleware
 * allows the user to access app routes (including /familie) even if they
 * later remove all family members. This is the durable marker that
 * distinguishes "onboarding completed" from "has members".
 *
 * Called when the user finishes the onboarding flow (clicks "Fertig").
 *
 * @param familyId - The UUID of the family to mark as onboarded.
 * @returns `{ success: true, data: null }` on success, or a German error.
 */
export async function completeOnboarding(
  familyId: string,
  startsFirstScan = false,
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  // Require an authenticated session.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  // Verify the family exists and belongs to the authenticated user (RLS).
  const { data: family, error: fetchError } = await supabase
    .from("families")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (fetchError || !family) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  // Set onboarding_completed_at to now().
  const { error: updateError } = await supabase
    .from("families")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", familyId);

  if (updateError) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  // Seed the default collections ("Sammlungen") for first-time onboarding.
  // Best-effort and idempotent: only seeds when the family has no
  // collections yet, so re-running onboarding (or a retry) never creates
  // duplicates. Failure here must not block onboarding completion.
  const { count } = await supabase
    .from("collections")
    .select("id", { count: "exact", head: true })
    .eq("family_id", familyId);

  if (!count) {
    await supabase.from("collections").insert(
      DEFAULT_COLLECTIONS.map((c, index) => ({
        family_id: familyId,
        name: c.name,
        icon: c.icon,
        color: c.color,
        sort_order: index,
      })),
    );
  }

  await Promise.all([
    recordProductEvent(supabase, {
      userId: user.id,
      familyId,
      eventName: "onboarding_completed",
    }),
    ...(startsFirstScan
      ? [
          recordProductEvent(supabase, {
            userId: user.id,
            familyId,
            eventName: "onboarding_scan_started",
          }),
        ]
      : []),
  ]);

  return { success: true, data: null };
}
