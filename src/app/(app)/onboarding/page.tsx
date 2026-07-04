import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingFlow } from "./onboarding-flow";
import type { OnboardingState } from "./onboarding-flow";
import type { Database } from "@/types/database";

type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];

/**
 * Onboarding entry point (server component).
 *
 * Determines the current onboarding state by checking the database:
 * - No family → start at the family-name step (welcome + family name input)
 * - Family exists, no members → resume at the add-member step
 * - Family exists, has members → onboarding is complete → redirect to /home
 *
 * This handles reload mid-onboarding gracefully: the user resumes at the
 * appropriate step without creating duplicate families.
 */
export default async function OnboardingPage() {
  const supabase = await createClient();

  // Fetch the user's family (RLS-scoped to the authenticated user).
  const { data: family } = await supabase
    .from("families")
    .select("id, name")
    .limit(1)
    .maybeSingle();

  // If a family exists, fetch its members.
  let members: MemberRow[] = [];
  if (family) {
    const { data: memberData } = await supabase
      .from("family_members")
      .select("*")
      .eq("family_id", family.id)
      .order("created_at", { ascending: true });
    members = memberData ?? [];
  }

  // Onboarding is complete when the user has a family with at least one
  // member. Redirect to /home — they should not see onboarding again.
  if (family && members.length > 0) {
    redirect("/home");
  }

  // Build the initial onboarding state for the client component.
  const initialState: OnboardingState =
    family && members.length === 0
      ? {
          // Resume: family already created, no members yet.
          step: "add-member",
          familyId: family.id,
          familyName: family.name,
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
