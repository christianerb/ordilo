import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveUserFamily } from "@/lib/supabase/resolve-user-family";
import { FamilySettingsClient } from "./settings-client";

/**
 * Family settings page (`/familie/einstellungen`, server component).
 *
 * Resolves the user's family with the shared owned-first rule (the same rule
 * the rename action and the DELETE /api/family route use) and the member
 * count, then renders the interactive client component. Using the shared
 * resolver keeps the displayed family — whose name confirms the deletion —
 * consistent with the family that actually gets deleted. Mirrors the
 * /familie page's outcome handling: query error → error state, no family →
 * onboarding redirect.
 */
export default async function FamilySettingsPage() {
  const supabase = await createClient();

  const { data: family, error: familyError } = await resolveUserFamily(supabase);

  if (familyError) {
    return <FamilySettingsClient fetchError={true} />;
  }

  if (!family) {
    redirect("/onboarding");
  }

  const { count } = await supabase
    .from("family_members")
    .select("id", { count: "exact", head: true })
    .eq("family_id", family.id);

  return (
    <FamilySettingsClient
      familyId={family.id}
      familyName={family.name}
      createdAt={family.created_at}
      memberCount={count ?? 0}
    />
  );
}
