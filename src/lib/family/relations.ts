import { z } from "zod";

/**
 * Family member relationships — "<Person> ist <Rolle> von <Personen>".
 *
 * A member holds any number of these at once: Karina is "Mutter von Emma
 * und Hanna" AND "Partnerin von Christian". A relation without any target
 * (`member_ids: []`) is a plain role — what you enter for the first person
 * in a family, when there is nobody else to point at yet.
 *
 * Stored one row per (member, role, related member) in
 * `family_member_relations`; grouped by role for the UI, which is how
 * people say it ("Mutter von Emma und Hanna", not twice "Mutter von …").
 */

/** The maximum number of relations one member can have. */
export const MAX_RELATIONS_PER_MEMBER = 8;

/** The maximum length of a role label, matching the DB check constraint. */
export const MAX_ROLE_LENGTH = 50;

/**
 * One relationship: a role and the members it points at.
 * An empty `member_ids` means the role stands on its own.
 */
export interface MemberRelation {
  role: string;
  member_ids: string[];
}

/** A single row of `family_member_relations`, as fetched from the DB. */
export interface MemberRelationRow {
  member_id: string;
  related_member_id: string | null;
  role: string;
  sort_order: number;
}

export const memberRelationSchema = z.object({
  role: z
    .string()
    .trim()
    .min(1, "Bitte eine Rolle wählen")
    .max(MAX_ROLE_LENGTH, `Die Rolle ist zu lang (maximal ${MAX_ROLE_LENGTH} Zeichen)`),
  member_ids: z.array(z.string().trim().uuid("Ungültige Auswahl")).default([]),
});

export const memberRelationsSchema = z
  .array(memberRelationSchema)
  .max(
    MAX_RELATIONS_PER_MEMBER,
    `Höchstens ${MAX_RELATIONS_PER_MEMBER} Beziehungen pro Person`,
  );

/**
 * Drop empty relations (no role picked yet) and de-duplicate: the same role
 * entered twice is merged, and a person selected twice within a relation is
 * kept once. Roles are compared case-insensitively; the first spelling wins.
 */
export function normalizeRelations(relations: MemberRelation[]): MemberRelation[] {
  const byRole = new Map<string, MemberRelation>();

  for (const relation of relations) {
    const role = relation.role.trim();
    if (!role) continue;

    const key = role.toLowerCase();
    const existing = byRole.get(key);
    const memberIds = existing ? existing.member_ids : [];
    for (const id of relation.member_ids) {
      if (id && !memberIds.includes(id)) memberIds.push(id);
    }
    if (existing) {
      existing.member_ids = memberIds;
    } else {
      byRole.set(key, { role, member_ids: memberIds });
    }
  }

  return [...byRole.values()];
}

/**
 * Group flat `family_member_relations` rows of ONE member into the
 * role-per-entry shape the UI works with, keeping the stored order.
 */
export function groupRelationRows(rows: MemberRelationRow[]): MemberRelation[] {
  const ordered = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  const byRole = new Map<string, MemberRelation>();

  for (const row of ordered) {
    const role = row.role.trim();
    if (!role) continue;
    const key = role.toLowerCase();
    const existing = byRole.get(key);
    if (existing) {
      if (row.related_member_id && !existing.member_ids.includes(row.related_member_id)) {
        existing.member_ids.push(row.related_member_id);
      }
    } else {
      byRole.set(key, {
        role,
        member_ids: row.related_member_id ? [row.related_member_id] : [],
      });
    }
  }

  return [...byRole.values()];
}

/**
 * Group the relation rows of a whole family into a map keyed by member id,
 * so a list page can attach them to its members in one pass.
 */
export function groupRelationsByMember(
  rows: MemberRelationRow[],
): Record<string, MemberRelation[]> {
  const byMember = new Map<string, MemberRelationRow[]>();
  for (const row of rows) {
    const list = byMember.get(row.member_id) ?? [];
    list.push(row);
    byMember.set(row.member_id, list);
  }

  const result: Record<string, MemberRelation[]> = {};
  for (const [memberId, memberRows] of byMember) {
    result[memberId] = groupRelationRows(memberRows);
  }
  return result;
}

/**
 * The primary role of a member — the role of their first relation. Kept in
 * `family_members.role` so the Erwachsene/Kinder filter, the chat tools and
 * the task assignment sheet keep working off a single simple field.
 */
export function primaryRole(relations: MemberRelation[]): string | null {
  return relations.find((r) => r.role.trim() !== "")?.role.trim() ?? null;
}

/** Joins German names naturally: "Emma", "Emma und Hanna", "Emma, Hanna und Ben". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} und ${names[names.length - 1]}`;
}

/**
 * Renders one relation as a sentence fragment: "Mutter von Emma und Hanna",
 * or just "Mutter" when it has no counterpart (or none of the counterparts
 * is known to the caller's name map).
 */
export function formatRelation(
  relation: MemberRelation,
  nameById: Record<string, string>,
): string {
  const names = relation.member_ids
    .map((id) => nameById[id])
    .filter((name): name is string => Boolean(name));
  return names.length > 0
    ? `${relation.role} von ${joinNames(names)}`
    : relation.role;
}

/** Renders all relations of a member: "Mutter von Emma · Partnerin von Chris". */
export function formatRelations(
  relations: MemberRelation[],
  nameById: Record<string, string>,
  separator = " · ",
): string {
  return relations
    .map((relation) => formatRelation(relation, nameById))
    .filter(Boolean)
    .join(separator);
}

/** Builds the `{ id: name }` lookup the formatters expect. */
export function nameMap(members: { id: string; name: string }[]): Record<string, string> {
  return Object.fromEntries(members.map((m) => [m.id, m.name]));
}
