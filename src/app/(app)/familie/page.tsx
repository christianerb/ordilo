import { redirect } from "next/navigation";
import { createClient, getMiddlewareFamily } from "@/lib/supabase/server";
import { resolveUserFamily } from "@/lib/supabase/resolve-user-family";
import { resolveMemberPhotoUrls } from "@/lib/member-photos";
import { loadFamilyRelations } from "@/lib/family/relations-db";
import { FamilieClient } from "./familie-client";
import type { MemberWithRelations } from "./actions";
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

  // Resolve the user's family. Since migration 0024 the families SELECT
  // policy exposes EVERY family the user belongs to, so this must use the
  // same deterministic rule the middleware and the server actions use —
  // an arbitrary limit(1) pick could display one family while mutations
  // land in another. Capture the error so we can distinguish a transient
  // backend failure from a legitimate "no family yet" state.
  // On full page loads the middleware already resolved the family for the
  // onboarding gate and hands the verified result over via request headers
  // (no error possible on that path) — only RSC navigations need the
  // fallback resolution.
  const middlewareFamily = await getMiddlewareFamily();
  let family: { id: string; name: string } | null = middlewareFamily;
  let familyError = false;
  if (!family) {
    const result = await resolveUserFamily(supabase);
    family = result.data;
    familyError = !!result.error;
  }

  // Query error → render the error state (NOT onboarding redirect).
  // A transient backend/auth failure should not be masked as "no family".
  if (familyError) {
    return <FamilieClient familyName="" members={[]} fetchError={true} />;
  }

  // No family and no error → redirect to onboarding (legitimate case).
  if (!family) {
    redirect("/onboarding");
  }

  // Members only depend on the family id.
  // Capture the member error so a transient failure is not masked as
  // "no members".
  const memberResult = await supabase
    .from("family_members")
    .select("*")
    .eq("family_id", family.id)
    .order("created_at", { ascending: true });

  const { data: memberData, error: memberError } = memberResult;

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

  const memberRows: MemberRow[] = memberData ?? [];

  // Document counts, signed photo URLs and relationships all depend only
  // on the member list — run them concurrently. Failures are non-critical
  // (the page still renders; counts simply omit, photos fall back to the
  // colored-initial avatar), so we don't surface error states for these.
  const [{ data: personEntities }, photoUrls, relationsByMember] = await Promise.all([
    memberRows.length > 0
      ? supabase
          .from("extracted_entities")
          .select("linked_object_id, document_id")
          .eq("entity_type", "person")
          .eq("confirmed", true)
          .in(
            "linked_object_id",
            memberRows.map((m) => m.id),
          )
      : Promise.resolve({ data: null }),
    resolveMemberPhotoUrls(memberRows),
    loadFamilyRelations(supabase, family.id),
  ]);

  const members: MemberWithRelations[] = memberRows.map((member) => ({
    ...member,
    relations: relationsByMember[member.id] ?? [],
  }));

  // Count unique documents per member (a member can appear on the same
  // document via multiple entity rows — dedupe by document_id).
  const documentCounts: Record<string, number> = {};
  const docIdsByMember = new Map<string, Set<string>>();
  for (const entity of personEntities ?? []) {
    if (!entity.linked_object_id) continue;
    const set = docIdsByMember.get(entity.linked_object_id) ?? new Set();
    set.add(entity.document_id);
    docIdsByMember.set(entity.linked_object_id, set);
  }
  for (const [memberId, docIds] of docIdsByMember) {
    documentCounts[memberId] = docIds.size;
  }

  return (
    <FamilieClient
      familyName={family.name}
      members={members}
      documentCounts={documentCounts}
      photoUrls={photoUrls}
    />
  );
}
