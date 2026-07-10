import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { FamilieClient } from "./familie-client";
import type { Database } from "@/types/database";

type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];

/** How long member photo signed URLs stay valid, in seconds. */
const PHOTO_SIGNED_URL_TTL_SECONDS = 300;

/**
 * Resolve short-lived signed URLs for every member that has an uploaded
 * photo. Failures are non-critical — a member simply falls back to the
 * colored-initial avatar.
 */
async function resolvePhotoUrls(
  members: MemberRow[],
): Promise<Record<string, string>> {
  const withPhoto = members.filter((m) => m.photo_url);
  if (withPhoto.length === 0) return {};

  const adminClient = createAdminClient();
  const paths = withPhoto.map((m) => m.photo_url as string);
  const { data } = await adminClient.storage.from("avatars").createSignedUrls(
    paths,
    PHOTO_SIGNED_URL_TTL_SECONDS,
  );

  const urls: Record<string, string> = {};
  if (data) {
    for (let i = 0; i < withPhoto.length; i++) {
      const signedUrl = data[i]?.signedUrl;
      if (signedUrl) urls[withPhoto[i].id] = signedUrl;
    }
  }
  return urls;
}

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

  // Fetch document counts per member — how many confirmed documents are
  // attributed to each person via the extracted_entities table. Failures
  // here are non-critical (the page still renders; counts simply omit),
  // so we don't surface a separate error state for this.
  const documentCounts: Record<string, number> = {};
  if (members.length > 0) {
    const { data: personEntities } = await supabase
      .from("extracted_entities")
      .select("linked_object_id, document_id")
      .eq("entity_type", "person")
      .eq("confirmed", true)
      .in(
        "linked_object_id",
        members.map((m) => m.id),
      );

    // Count unique documents per member (a member can appear on the same
    // document via multiple entity rows — dedupe by document_id).
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
  }

  // Fetch inventory items for the family.
  const { data: inventoryData } = await supabase
    .from("family_inventory_items")
    .select("id, name, item_type, tags, linked_member_id, status")
    .eq("family_id", family.id)
    .order("created_at", { ascending: false });

  const inventoryItems = (inventoryData ?? []).map((i) => ({
    id: i.id as string,
    name: i.name as string,
    item_type: i.item_type as string,
    tags: (i.tags as string[]) ?? [],
    linked_member_id: i.linked_member_id as string | null,
    status: i.status as string,
  }));

  const photoUrls = await resolvePhotoUrls(members);

  return (
    <FamilieClient
      familyName={family.name}
      members={members}
      documentCounts={documentCounts}
      inventoryItems={inventoryItems}
      photoUrls={photoUrls}
    />
  );
}
