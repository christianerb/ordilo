import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isOnboardingComplete,
  resolveUserFamily,
} from "@/lib/supabase/resolve-user-family";
import { OnboardingFlow } from "./onboarding-flow";
import type { OnboardingState } from "./onboarding-flow";
import { OnboardingError } from "./onboarding-error";
import type { Database } from "@/types/database";
import { familyInboundEmail } from "@/lib/family-inbound-email";

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

  // Resolve the family with the SAME deterministic rule the middleware and
  // the server actions use (owned first, then oldest membership). A bare
  // `.limit(1)` here picked an arbitrary row out of everything RLS exposes,
  // so a multi-membership account could be onboarded against one family
  // while its writes landed in another. Capture the error so a transient
  // backend failure is NOT masked as "no family".
  const { data: family, error: familyError } = await resolveUserFamily(supabase);

  // Family query error → render the error state (NOT onboarding flow).
  // This prevents misrouting: if the user already has a family but the
  // query failed, showing the onboarding flow would let them create a
  // duplicate family.
  if (familyError) {
    return <OnboardingError />;
  }

  // Redirect to /home when there is nothing left to onboard: the marker is
  // set (even with zero members — they may have removed everyone after
  // finishing), or the user JOINED this family and never had a setup run of
  // their own. Without the second case an invitee is dropped into the
  // creator's unfinished flow and asked to name a family that exists.
  if (isOnboardingComplete(family)) {
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

  const { data: emailAlias } = family
    ? await supabase
        .from("family_email_aliases")
        .select("local_part")
        .eq("family_id", family.id)
        .maybeSingle()
    : { data: null };

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
          inboundEmail: familyInboundEmail(
            emailAlias?.local_part ?? "",
            process.env.INBOUND_EMAIL_DOMAIN,
          ),
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
          inboundEmail: familyInboundEmail(
            emailAlias?.local_part ?? "",
            process.env.INBOUND_EMAIL_DOMAIN,
          ),
          members: [],
        }
    : {
        // Fresh start: no family yet.
        step: "family-name",
        familyId: null,
        familyName: null,
        inboundEmail: null,
        members: [],
      };

  return <OnboardingFlow initialState={initialState} />;
}
