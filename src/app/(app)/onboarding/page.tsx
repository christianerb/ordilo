import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingFlow } from "./onboarding-flow";
import type { OnboardingState } from "./onboarding-flow";
import { OnboardingError } from "./onboarding-error";
import type { Database } from "@/types/database";

type FamilyRow = Pick<
  Database["public"]["Tables"]["families"]["Row"],
  "id" | "name" | "onboarding_completed_at"
>;
type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];

/**
 * Onboarding entry point (server component).
 *
 * Determines the current onboarding state by checking the database:
 * - Query error → render a German error state (NOT the onboarding flow,
 *   NOT a redirect — a transient failure should not misroute the user)
 * - No family → start at the family-name step (welcome + family name input)
 * - Family exists, onboarding_completed_at set → onboarding is complete →
 *   redirect to /home (even if the user later removed all members)
 * - Family exists, onboarding_completed_at NULL, no members → resume at
 *   the add-member step
 * - Family exists, onboarding_completed_at NULL, has members → resume at
 *   the choose-next step (user added members but didn't finish)
 *
 * This handles reload mid-onboarding gracefully: the user resumes at the
 * appropriate step without creating duplicate families.
 */
export default async function OnboardingPage() {
  const supabase = await createClient();

  // Fetch the user's family with the onboarding completion marker
  // (RLS-scoped to the authenticated user). Capture the error so a
  // transient backend failure is NOT masked as "no family".
  const { data: family, error: familyError } = await supabase
    .from("families")
    .select("id, name, onboarding_completed_at")
    .limit(1)
    .maybeSingle();

  // Family query error → render the error state (NOT onboarding flow).
  // This prevents misrouting: if the user already has a family but the
  // query failed, showing the onboarding flow would let them create a
  // duplicate family.
  if (familyError) {
    return <OnboardingError />;
  }

  // Onboarding is complete when onboarding_completed_at is set. Redirect
  // to /home — they should not see onboarding again, even with zero members
  // (the user may have removed all members after completing onboarding).
  if (family && family.onboarding_completed_at) {
    redirect("/home");
  }

  // Mid-onboarding or fresh start — fetch members to determine the resume
  // step (only needed when the family exists).
  let members: MemberRow[] = [];
  if (family) {
    const { data: memberData, error: memberError } = await supabase
      .from("family_members")
      .select("*")
      .eq("family_id", family.id)
      .order("created_at", { ascending: true });

    // Member query error → render the error state (NOT the onboarding flow).
    if (memberError) {
      return <OnboardingError />;
    }
    members = memberData ?? [];
  }

  // Build the initial onboarding state for the client component.
  const familyRow = family as FamilyRow | null;
  const initialState: OnboardingState = familyRow
    ? members.length > 0
      ? {
          // Resume: family exists, onboarding not completed, has members.
          // The user added members but didn't click "Fertig" — resume at
          // the choose-next step so they can add more or finish.
          step: "choose-next",
          familyId: familyRow.id,
          familyName: familyRow.name,
          members: members.map((m) => ({
            id: m.id,
            name: m.name,
            role: m.role,
            birthdate: m.birthdate,
            avatar_color: m.avatar_color,
          })),
        }
      : {
          // Resume: family already created, no members yet.
          step: "add-member",
          familyId: familyRow.id,
          familyName: familyRow.name,
          members: [],
        }
    : {
        // Fresh start: no family yet.
        step: "family-name",
        familyId: null,
        familyName: null,
        members: [],
      };

  return <OnboardingFlow initialState={initialState} />;
}
