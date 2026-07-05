import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SucheClient } from "./suche-client";
import type { DocumentMetadata } from "./suche-client";

/**
 * Search / Chat page (server component).
 *
 * Fetches the user's family, family members, confirmed documents (with
 * metadata for filter chips), and person-document associations (from
 * extracted_entities). Then renders the interactive chat/search client.
 *
 * If the user has no family, they are redirected to onboarding.
 *
 * All data is fetched RLS-scoped (server client), so a user only sees their
 * own family's data (VAL-CHAT-030).
 */
export default async function SuchePage() {
  const supabase = await createClient();

  // 1. Fetch the user's family (RLS-scoped).
  const { data: family } = await supabase
    .from("families")
    .select("id, name")
    .limit(1)
    .maybeSingle();

  if (!family) {
    redirect("/onboarding");
  }

  // 2. Fetch family members (for person filter chips).
  const { data: memberData } = await supabase
    .from("family_members")
    .select("id, name")
    .eq("family_id", family.id)
    .order("created_at", { ascending: true });

  const members = (memberData ?? []).map((m) => ({
    id: m.id,
    name: m.name,
  }));

  // 3. Fetch confirmed documents (for category/type filter chips and
  //    document metadata for source card filtering).
  const { data: docData } = await supabase
    .from("documents")
    .select("id, title, category, document_type")
    .eq("family_id", family.id)
    .eq("status", "confirmed")
    .order("created_at", { ascending: false });

  const confirmedDocIds = (docData ?? []).map((d) => d.id);

  // 4. Fetch person entities for confirmed documents (to build the
  //    person-document mapping for filtering).
  let documents: DocumentMetadata[] = [];

  if (confirmedDocIds.length > 0) {
    const { data: entityData } = await supabase
      .from("extracted_entities")
      .select("document_id, entity_value")
      .eq("family_id", family.id)
      .eq("entity_type", "person")
      .eq("confirmed", true)
      .in("document_id", confirmedDocIds);

    // Build a mapping: document_id → set of person names.
    const personMap = new Map<string, Set<string>>();
    for (const entity of entityData ?? []) {
      if (!entity.entity_value) continue;
      if (!personMap.has(entity.document_id)) {
        personMap.set(entity.document_id, new Set());
      }
      personMap.get(entity.document_id)!.add(entity.entity_value);
    }

    documents = (docData ?? []).map((d) => ({
      id: d.id,
      title: d.title,
      category: d.category,
      document_type: d.document_type,
      persons: personMap.get(d.id)
        ? [...personMap.get(d.id)!]
        : [],
    }));
  }

  return (
    <SucheClient
      familyId={family.id}
      familyName={family.name}
      members={members}
      documents={documents}
    />
  );
}
