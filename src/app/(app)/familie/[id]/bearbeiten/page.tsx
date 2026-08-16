import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveMemberPhotoUrls } from "@/lib/member-photos";
import { loadMemberRelations } from "@/lib/family/relations-db";
import type { Database } from "@/types/database";
import { EditMemberClient } from "./edit-member-client";

type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];

/**
 * "Person bearbeiten" (server component).
 *
 * Editing lives on its own page rather than in a bottom sheet: with a
 * photo, the basics and a list of relationships, the sheet had to scroll
 * inside a scrolling page and everything below the fold felt secondary.
 *
 * Fetches the member, their relationships and everyone else in the family
 * (with photos, so the relationship list can show faces).
 */
export default async function EditMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: member } = await supabase
    .from("family_members")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!member) {
    notFound();
  }

  const typedMember = member as MemberRow;

  const { data: otherMemberRows } = await supabase
    .from("family_members")
    .select("id, name, avatar_color, photo_url")
    .eq("family_id", typedMember.family_id)
    .neq("id", typedMember.id)
    .order("created_at", { ascending: true });

  const others = otherMemberRows ?? [];

  const [relationsResult, photoUrls] = await Promise.all([
    loadMemberRelations(supabase, typedMember.id),
    resolveMemberPhotoUrls([...others, typedMember]),
  ]);

  return (
    <EditMemberClient
      member={typedMember}
      relations={relationsResult.relations}
      // Saving the list the editor was handed would wipe the stored
      // relationships if that list came from a failed read.
      relationsUnavailable={relationsResult.error}
      photoUrl={photoUrls[typedMember.id] ?? null}
      otherMembers={others.map((m) => ({
        id: m.id,
        name: m.name,
        avatar_color: m.avatar_color,
        photoUrl: photoUrls[m.id] ?? null,
      }))}
    />
  );
}
