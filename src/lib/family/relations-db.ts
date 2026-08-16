import "server-only";

import type { createClient as createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import {
  groupRelationRows,
  groupRelationsByMember,
  memberRelationsSchema,
  normalizeRelations,
  primaryRole,
  type MemberRelation,
  type MemberRelationRow,
} from "@/lib/family/relations";

type ServerClient = Awaited<ReturnType<typeof createServerClient>>;
type RelationInsert =
  Database["public"]["Tables"]["family_member_relations"]["Insert"];

/**
 * Reading and writing `family_member_relations`.
 *
 * Kept apart from the pure helpers in `relations.ts` so client components
 * can import the formatters without pulling in the Supabase server client.
 */

/** Loads the relations of one member, grouped by role. */
export async function loadMemberRelations(
  client: ServerClient,
  memberId: string,
): Promise<MemberRelation[]> {
  const { data } = await client
    .from("family_member_relations")
    .select("member_id, related_member_id, role, sort_order")
    .eq("member_id", memberId)
    .order("sort_order", { ascending: true });

  return groupRelationRows((data ?? []) as MemberRelationRow[]);
}

/** Loads the relations of every member of a family, keyed by member id. */
export async function loadFamilyRelations(
  client: ServerClient,
  familyId: string,
): Promise<Record<string, MemberRelation[]>> {
  const { data } = await client
    .from("family_member_relations")
    .select("member_id, related_member_id, role, sort_order")
    .eq("family_id", familyId)
    .order("sort_order", { ascending: true });

  return groupRelationsByMember((data ?? []) as MemberRelationRow[]);
}

/**
 * Validates a relation list coming from a client: shape, count, and that
 * every referenced person is a member of the same family and not the
 * member themselves.
 *
 * @returns The cleaned relations, or a German error message.
 */
export async function validateRelations(
  client: ServerClient,
  relations: MemberRelation[],
  familyId: string,
  memberId?: string,
): Promise<
  { success: true; data: MemberRelation[] } | { success: false; error: string }
> {
  const parsed = memberRelationsSchema.safeParse(relations);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Beziehung konnte nicht gespeichert werden.",
    };
  }

  const cleaned = normalizeRelations(parsed.data);

  const referenced = [...new Set(cleaned.flatMap((r) => r.member_ids))];
  if (memberId && referenced.includes(memberId)) {
    return {
      success: false,
      error: "Eine Person kann keine Beziehung zu sich selbst haben.",
    };
  }

  if (referenced.length > 0) {
    const { data, error } = await client
      .from("family_members")
      .select("id, family_id")
      .in("id", referenced);
    if (error || !data) {
      return { success: false, error: "Beziehung konnte nicht gespeichert werden." };
    }
    const inFamily = new Set(
      data.filter((m) => m.family_id === familyId).map((m) => m.id),
    );
    if (!referenced.every((id) => inFamily.has(id))) {
      return { success: false, error: "Beziehung konnte nicht gespeichert werden." };
    }
  }

  return { success: true, data: cleaned };
}

/**
 * Replaces a member's relations with `relations` and keeps the
 * denormalized `family_members.role` in sync with the first one.
 *
 * Delete-then-insert rather than a diff: a member has a handful of
 * relations, and replacing them makes "what the form shows is what is
 * stored" true without reconciliation logic.
 *
 * The caller must have validated `relations` (see `validateRelations`).
 *
 * @returns true on success, false when a write failed.
 */
export async function saveMemberRelations(
  client: ServerClient,
  {
    familyId,
    memberId,
    relations,
  }: { familyId: string; memberId: string; relations: MemberRelation[] },
): Promise<boolean> {
  const { error: deleteError } = await client
    .from("family_member_relations")
    .delete()
    .eq("member_id", memberId);
  if (deleteError) return false;

  const rows: RelationInsert[] = [];
  relations.forEach((relation, index) => {
    // A relation without a counterpart is stored as a single row with a
    // null target — that is the plain role ("Mutter").
    const targets: (string | null)[] =
      relation.member_ids.length > 0 ? relation.member_ids : [null];
    for (const relatedId of targets) {
      rows.push({
        family_id: familyId,
        member_id: memberId,
        related_member_id: relatedId,
        role: relation.role,
        sort_order: index,
      });
    }
  });

  if (rows.length > 0) {
    const { error: insertError } = await client
      .from("family_member_relations")
      .insert(rows);
    if (insertError) return false;
  }

  // Mirror the primary role onto the member row — the Erwachsene/Kinder
  // filter, the chat tools and the task assignment sheet read it there.
  const { error: roleError } = await client
    .from("family_members")
    .update({ role: primaryRole(relations) })
    .eq("id", memberId);

  return !roleError;
}
