import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FamilieClient } from "./familie-client";
import type { Database } from "@/types/database";

type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];

/**
 * Family management page (server component).
 *
 * Fetches the user's family and all its members (RLS-scoped to the
 * authenticated user), then renders the interactive client component.
 *
 * If the user has no family (e.g. onboarding was not completed), they are
 * redirected to the onboarding flow.
 */
export default async function FamiliePage() {
  const supabase = await createClient();

  // Fetch the user's family (RLS-scoped — only returns the family created_by
  // the authenticated user).
  const { data: family } = await supabase
    .from("families")
    .select("id, name")
    .limit(1)
    .maybeSingle();

  // No family → redirect to onboarding (the user should create one first).
  if (!family) {
    redirect("/onboarding");
  }

  // Fetch all members for the family, ordered by creation time.
  const { data: memberData } = await supabase
    .from("family_members")
    .select("*")
    .eq("family_id", family.id)
    .order("created_at", { ascending: true });

  const members: MemberRow[] = memberData ?? [];

  return <FamilieClient familyName={family.name} members={members} />;
}
