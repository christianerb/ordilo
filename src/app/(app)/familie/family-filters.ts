import { getAgeInYears } from "@/lib/format";
import type { Database } from "@/types/database";

type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];

export type FamilyFilter = "all" | "adults" | "children";

const CHILD_ROLE_KEYWORDS = ["kind", "tochter", "sohn"];

/**
 * Classifies a member as a child for the Erwachsene/Kinder filter tabs.
 * Age (from the birthdate) is the strongest signal; when it's unknown we
 * fall back to matching the role text against common child role labels.
 */
export function isChildMember(
  member: Pick<MemberRow, "role" | "birthdate">,
): boolean {
  const age = getAgeInYears(member.birthdate);
  if (age !== null) return age < 18;

  const role = member.role?.toLowerCase() ?? "";
  return CHILD_ROLE_KEYWORDS.some((keyword) => role.includes(keyword));
}
