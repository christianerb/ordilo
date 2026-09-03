import { AVATAR_COLORS } from "./onboarding";

/**
 * People helpers — the one place that decides how a family member (or a
 * person merely named in a document) is shown: initial, colour and the
 * short "wer?" line used on rows. Family members carry their own
 * avatar_color; anyone else gets a stable colour derived from the name so
 * the same person always looks the same.
 */

export interface Person {
  /** family_members.id when the person is a known member, else null. */
  id: string | null;
  name: string;
  /** Preset avatar colour; null falls back to a name-derived colour. */
  color: string | null;
}

export interface MemberLike {
  id: string;
  name: string;
  avatar_color?: string | null;
  avatarColor?: string | null;
}

/** First letter of the first word, upper-cased; "?" for an empty name. */
export function getPersonInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return [...trimmed][0]!.toLocaleUpperCase("de");
}

/** First name only — rows have no room for "Emma Sophie Müller". */
export function getPersonShortName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0]!;
}

/**
 * Stable colour for a name without a stored avatar colour. Uses the same
 * preset palette as onboarding so unknown people never look alien.
 */
export function getPersonFallbackColor(name: string): string {
  let hash = 0;
  for (const char of name.trim().toLocaleLowerCase("de")) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function getPersonColor(person: Pick<Person, "name" | "color">): string {
  return person.color ?? getPersonFallbackColor(person.name);
}

export function memberToPerson(member: MemberLike): Person {
  return {
    id: member.id,
    name: member.name,
    color: member.avatar_color ?? member.avatarColor ?? null,
  };
}

/**
 * Resolve the people a document is about from its person entities. A
 * linked entity takes the member's name and colour; an unlinked name
 * stays visible as text so nothing Ordilo read disappears. Duplicates by
 * member id or (case-insensitive) name collapse into one.
 */
export function resolveDocumentPeople(
  entities: { entity_value: string; linked_object_id: string | null }[],
  members: MemberLike[],
): Person[] {
  const byId = new Map(members.map((member) => [member.id, member]));
  const seen = new Set<string>();
  const people: Person[] = [];
  for (const entity of entities) {
    const member = entity.linked_object_id
      ? byId.get(entity.linked_object_id)
      : undefined;
    const name = (member?.name ?? entity.entity_value).trim();
    if (!name) continue;
    const key = member ? `id:${member.id}` : `name:${name.toLocaleLowerCase("de")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    people.push(member ? memberToPerson(member) : { id: null, name, color: null });
  }
  return people;
}

/**
 * "Emma", "Emma & Leon", "Emma, Leon & Mia", "Emma, Leon +2" — the one
 * line that answers "wer?" without growing past a row.
 */
export function formatPeopleLine(people: Pick<Person, "name">[], max = 3): string {
  const names = people.map((person) => getPersonShortName(person.name)).filter(Boolean);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  if (names.length <= max) {
    return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
  }
  return `${names.slice(0, max - 1).join(", ")} +${names.length - (max - 1)}`;
}
