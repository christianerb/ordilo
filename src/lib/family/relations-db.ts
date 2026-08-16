import "server-only";

import type { createClient as createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import {
  groupRelationRows,
  groupRelationsByMember,
  inverseRole,
  isInverseOf,
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

/**
 * Loads the relations of one member, grouped by role.
 *
 * `error` is not decoration: the editor saves the list it was given, so an
 * empty list from a failed read would delete every stored relationship on
 * the next save. Callers must not offer relationship editing when it is set.
 */
export async function loadMemberRelations(
  client: ServerClient,
  memberId: string,
): Promise<{ relations: MemberRelation[]; error: boolean }> {
  const { data, error } = await client
    .from("family_member_relations")
    .select("member_id, related_member_id, role, sort_order")
    .eq("member_id", memberId)
    .order("sort_order", { ascending: true });

  if (error || !data) return { relations: [], error: true };
  return {
    relations: groupRelationRows(data as MemberRelationRow[]),
    error: false,
  };
}

/**
 * Loads the relations of every member of a family, keyed by member id.
 *
 * Read-only callers (the family list, the profile page) can treat a failure
 * as "no relationships to show"; anything that saves them back must look at
 * `error` first.
 */
export async function loadFamilyRelations(
  client: ServerClient,
  familyId: string,
): Promise<{ byMember: Record<string, MemberRelation[]>; error: boolean }> {
  const { data, error } = await client
    .from("family_member_relations")
    .select("member_id, related_member_id, role, sort_order")
    .eq("family_id", familyId)
    .order("sort_order", { ascending: true });

  if (error || !data) return { byMember: {}, error: true };
  return {
    byMember: groupRelationsByMember(data as MemberRelationRow[]),
    error: false,
  };
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
 * Replaces a member's relations with `relations`, keeps the denormalized
 * `family_members.role` in sync with the first one, and mirrors every
 * relation onto the other person ("Mutter von Emma" gives Emma "Kind von
 * Karina").
 *
 * The member's own rows are swapped by the `replace_member_relations` RPC:
 * one function body is one transaction, so a failure mid-way leaves the
 * stored relations untouched instead of deleting them. The RPC hands back
 * the previous rows, which is what the counterpart mirroring diffs against.
 *
 * The caller must have validated `relations` (see `validateRelations`).
 *
 * @returns true on success, false when the replacement failed — in which
 *          case nothing was changed.
 */
export async function saveMemberRelations(
  client: ServerClient,
  {
    familyId,
    memberId,
    relations,
  }: { familyId: string; memberId: string; relations: MemberRelation[] },
): Promise<boolean> {
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

  const { data: beforeRows, error } = await client.rpc(
    "replace_member_relations",
    {
      p_member_id: memberId,
      p_relations: rows.map((row) => ({
        related_member_id: row.related_member_id ?? null,
        role: row.role,
        sort_order: row.sort_order ?? 0,
      })),
    },
  );

  if (error) return false;

  await syncCounterparts(client, {
    familyId,
    memberId,
    before: ((beforeRows ?? []) as MemberRelationRow[]).filter(
      (row) => row.related_member_id !== null,
    ),
    after: rows,
  });

  return true;
}

/** `${targetId}|${role}` — one relationship between two people. */
function pairKey(targetId: string, role: string): string {
  return `${targetId}|${role.trim().toLowerCase()}`;
}

/**
 * Gives the other side of every added relation, and takes away the other
 * side of every removed one.
 *
 * A counterpart is only ever created when the relationship has an obvious
 * reverse (see `inverseRole`) and the other person does not already say
 * something about this one — a hand-picked "Patenkind" is never overwritten
 * by an automatic "Kind". Failures are swallowed: the member's own
 * relations are already saved, and a missing mirror is a nuisance, not a
 * lost edit.
 */
async function syncCounterparts(
  client: ServerClient,
  {
    familyId,
    memberId,
    before,
    after,
  }: {
    familyId: string;
    memberId: string;
    before: MemberRelationRow[];
    after: RelationInsert[];
  },
): Promise<void> {
  const beforePairs = new Map<string, { targetId: string; role: string }>();
  for (const row of before) {
    if (!row.related_member_id) continue;
    beforePairs.set(pairKey(row.related_member_id, row.role), {
      targetId: row.related_member_id,
      role: row.role,
    });
  }

  const afterPairs = new Map<string, { targetId: string; role: string }>();
  for (const row of after) {
    if (!row.related_member_id) continue;
    afterPairs.set(pairKey(row.related_member_id, row.role), {
      targetId: row.related_member_id,
      role: row.role,
    });
  }

  const added = [...afterPairs].filter(([key]) => !beforePairs.has(key)).map(([, v]) => v);
  const removed = [...beforePairs].filter(([key]) => !afterPairs.has(key)).map(([, v]) => v);
  if (added.length === 0 && removed.length === 0) return;

  const affected = [...new Set([...added, ...removed].map((p) => p.targetId))];

  // Everything the affected people currently say, in one read.
  const { data: theirRowsData, error: readError } = await client
    .from("family_member_relations")
    .select("id, member_id, related_member_id, role, sort_order")
    .in("member_id", affected);
  if (readError) return;
  const theirRows = (theirRowsData ?? []) as (MemberRelationRow & { id: string })[];

  const rowsOf = (targetId: string) =>
    theirRows.filter((row) => row.member_id === targetId);

  const deleteIds: string[] = [];
  const inserts: RelationInsert[] = [];

  for (const { targetId, role } of removed) {
    // Drop the mirrored row this relation left on the other person — but
    // only if it really is the reverse of what was removed.
    for (const row of rowsOf(targetId)) {
      if (row.related_member_id !== memberId) continue;
      if (isInverseOf(role, row.role)) deleteIds.push(row.id);
    }
  }

  for (const { targetId, role } of added) {
    const theirs = rowsOf(targetId);
    const alreadySays = theirs.some(
      (row) => row.related_member_id === memberId && !deleteIds.includes(row.id),
    );
    if (alreadySays) continue;

    const counterRole = inverseRole(
      role,
      theirs.map((row) => row.role),
    );
    if (!counterRole) continue;

    // The same role without a counterpart becomes redundant the moment it
    // points at someone ("Tochter" → "Tochter von Karina"). The replacement
    // takes over its position: appending it instead would silently promote
    // whatever came second to be the person's primary role.
    let replacedOrder: number | null = null;
    for (const row of theirs) {
      if (
        row.related_member_id === null &&
        row.role.trim().toLowerCase() === counterRole.toLowerCase()
      ) {
        deleteIds.push(row.id);
        replacedOrder =
          replacedOrder === null ? row.sort_order : Math.min(replacedOrder, row.sort_order);
      }
    }

    const lastOrder = theirs.reduce((max, row) => Math.max(max, row.sort_order), -1);
    inserts.push({
      family_id: familyId,
      member_id: targetId,
      related_member_id: memberId,
      role: counterRole,
      sort_order: replacedOrder ?? lastOrder + 1,
    });
  }

  if (deleteIds.length > 0) {
    await client.from("family_member_relations").delete().in("id", deleteIds);
  }
  if (inserts.length > 0) {
    await client.from("family_member_relations").insert(inserts);
  }

  // The counterparts' primary roles may have moved with their relations.
  const remaining = theirRows.filter((row) => !deleteIds.includes(row.id));
  const { data: memberRows } = await client
    .from("family_members")
    .select("id, role")
    .in("id", affected);

  for (const target of affected) {
    const rows = [
      ...remaining.filter((row) => row.member_id === target),
      ...inserts
        .filter((row) => row.member_id === target)
        .map((row) => ({
          member_id: target,
          related_member_id: row.related_member_id ?? null,
          role: row.role,
          sort_order: row.sort_order ?? 0,
        })),
    ];
    const nextRole = primaryRole(groupRelationRows(rows));
    const current = (memberRows ?? []).find((m) => m.id === target);
    if (current && current.role !== nextRole) {
      await client.from("family_members").update({ role: nextRole }).eq("id", target);
    }
  }
}
