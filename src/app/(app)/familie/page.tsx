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
 * Three outcomes:
 * 1. Query error → renders a distinct German error state with retry
 *    (NOT a redirect to onboarding, NOT an empty state).
 * 2. No family (null, no error) → redirects to the onboarding flow.
 * 3. Family + members (or zero members) → renders FamilieClient normally.
 */
export default async function FamiliePage() {
  const supabase = await createClient();

  // Fetch the user's family (RLS-scoped — only returns the family created_by
  // the authenticated user). Capture the error so we can distinguish a
  // transient backend failure from a legitimate "no family yet" state.
  const { data: family, error: familyError } = await supabase
    .from("families")
    .select("id, name")
    .limit(1)
    .maybeSingle();

  // Query error → render the error state (NOT onboarding redirect).
  // A transient backend/auth failure should not be masked as "no family".
  if (familyError) {
    return <FamilieClient familyName="" members={[]} fetchError={true} />;
  }

  // No family and no error → redirect to onboarding (legitimate case).
  if (!family) {
    redirect("/onboarding");
  }

  // Fetch all members for the family, ordered by creation time.
  // Capture the error so a transient failure is not masked as "no members".
  const { data: memberData, error: memberError } = await supabase
    .from("family_members")
    .select("*")
    .eq("family_id", family.id)
    .order("created_at", { ascending: true });

  // Member query error → render the error state (NOT the empty state).
  if (memberError) {
    return (
      <FamilieClient
        familyName={family.name}
        members={[]}
        fetchError={true}
      />
    );
  }

  const members: MemberRow[] = memberData ?? [];

  return <FamilieClient familyName={family.name} members={members} />;
}
