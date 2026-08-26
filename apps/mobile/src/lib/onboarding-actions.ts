import { getSupabase } from "./supabase";
import { recordProductEvent } from "./analytics";
import {
  DEFAULT_COLLECTIONS,
  FRIENDLY_ERROR,
  validateFamilyName,
  validateMember,
} from "./onboarding";

/**
 * Onboarding actions — a 1:1 port of the web app's server actions
 * (src/app/(app)/onboarding/actions.ts) onto direct Supabase calls. The
 * server actions are Next.js-specific endpoints; the mobile client speaks
 * to the same tables/RPCs directly, under the same RLS rules.
 */

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export interface MemberRow {
  id: string;
  family_id: string;
  name: string;
  role: string | null;
  birthdate: string | null;
  avatar_color: string | null;
  linked_user_id: string | null;
}

/**
 * Create a family for the signed-in user. Idempotent: an existing family
 * (from a partial earlier run or a reload) is returned instead of a
 * duplicate; a 23505 unique-violation race on families.created_by is
 * recovered by re-reading. Exactly like the web action.
 */
export async function createFamily(
  name: string,
): Promise<ActionResult<{ id: string; name: string }>> {
  const validation = validateFamilyName(name);
  if (!validation.success) {
    return { success: false, error: validation.error };
  }

  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  // RLS scopes this to visible families — same pre-check as the web.
  const { data: existing, error: fetchError } = await supabase
    .from("families")
    .select("id, name")
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    return { success: false, error: FRIENDLY_ERROR };
  }
  if (existing) {
    return {
      success: true,
      data: { id: existing.id, name: existing.name },
    };
  }

  const { data: family, error: insertError } = await supabase
    .from("families")
    .insert({ name: validation.data.name, created_by: user.id })
    .select("id, name")
    .single();

  if (insertError || !family) {
    if (insertError?.code === "23505") {
      // A concurrent request created the family between pre-check and
      // insert — re-read and return it instead of surfacing an error.
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

  await recordProductEvent(supabase, {
    userId: user.id,
    familyId: family.id,
    eventName: "onboarding_step_completed",
    properties: { step: "family_name" },
  });

  return { success: true, data: family };
}

/**
 * Add a family member during onboarding.
 *
 * With `is_self`, the member is linked to the account unless another
 * member already is. When a role is given it is mirrored into
 * `family_member_relations` (no counterpart yet — that is added on the
 * Familie screen); a failed mirror rolls the member insert back, exactly
 * like the web action.
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
  const validation = validateMember(input);
  if (!validation.success) {
    return { success: false, error: validation.error };
  }

  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: FRIENDLY_ERROR };
  }

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

  if (validation.data.role) {
    const relationsSaved = await saveRoleRelation(
      member.id,
      validation.data.role,
    );
    if (!relationsSaved) {
      // A role that lives only on the member row would be silently cleared
      // by the next edit on /familie — undo the insert instead.
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

  return { success: true, data: member as MemberRow };
}

/**
 * Update the member fields exposed by the native Familie screen. The
 * relation model is intentionally not edited here: a role can have a
 * counterpart relationship, and replacing it from this compact editor would
 * erase family context the form cannot represent.
 */
export async function updateMember(
  familyId: string,
  memberId: string,
  input: {
    name: string;
    birthdate?: string;
    avatar_color?: string;
  },
): Promise<ActionResult<MemberRow>> {
  const validation = validateMember(input);
  if (!validation.success) {
    return { success: false, error: validation.error };
  }

  const supabase = getSupabase();
  const { data: member, error: updateError } = await supabase
    .from("family_members")
    .update({
      name: validation.data.name,
      birthdate: validation.data.birthdate,
      avatar_color: validation.data.avatar_color,
    })
    .eq("id", memberId)
    .eq("family_id", familyId)
    .select("*")
    .single();
  if (updateError || !member) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  return { success: true, data: member as MemberRow };
}

/**
 * Store a plain role ("Mutter", no counterpart) through the same atomic
 * RPC the web uses, so the Familie editor reads the same shape. The RPC
 * derives the family from the member row.
 */
async function saveRoleRelation(
  memberId: string,
  role: string,
): Promise<boolean> {
  const { error } = await getSupabase().rpc("replace_member_relations", {
    p_member_id: memberId,
    p_relations: [{ related_member_id: null, role, sort_order: 0 }],
  });
  return !error;
}

/**
 * Mark onboarding as completed and seed the default collections when the
 * family has none yet (idempotent, best-effort — same as the web action).
 */
export async function completeOnboarding(
  familyId: string,
  startsFirstScan = false,
): Promise<ActionResult<null>> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  const { data: family, error: fetchError } = await supabase
    .from("families")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (fetchError || !family) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  const { error: updateError } = await supabase
    .from("families")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", familyId);

  if (updateError) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  const { count } = await supabase
    .from("collections")
    .select("id", { count: "exact", head: true })
    .eq("family_id", familyId);

  if (!count) {
    await supabase.from("collections").insert(
      DEFAULT_COLLECTIONS.map((collection, index) => ({
        family_id: familyId,
        name: collection.name,
        icon: collection.icon,
        color: collection.color,
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

/**
 * Load the family's current members for the onboarding resume state.
 * A failed query is surfaced, not swallowed — otherwise a resumed run
 * would claim nobody has been added and invite duplicate people.
 */
export async function listMembers(
  familyId: string,
): Promise<ActionResult<MemberRow[]>> {
  const { data, error } = await getSupabase()
    .from("family_members")
    .select("*")
    .eq("family_id", familyId)
    .order("created_at", { ascending: true });
  if (error) {
    return { success: false, error: FRIENDLY_ERROR };
  }
  return { success: true, data: (data ?? []) as MemberRow[] };
}
