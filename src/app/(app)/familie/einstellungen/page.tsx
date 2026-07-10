import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FamilySettingsClient } from "./settings-client";

/**
 * Family settings page (`/familie/einstellungen`, server component).
 *
 * Fetches the user's family (RLS-scoped) and member count, then renders
 * the interactive client component. Mirrors the /familie page's outcome
 * handling: query error → error state, no family → onboarding redirect.
 */
export default async function FamilySettingsPage() {
  const supabase = await createClient();

  const { data: family, error: familyError } = await supabase
    .from("families")
    .select("id, name, created_at")
    .limit(1)
    .maybeSingle();

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
