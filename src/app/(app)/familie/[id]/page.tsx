import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { loadMemberRelations } from "@/lib/family/relations-db";
import { ProfileClient } from "./profile-client";
import type { Database } from "@/types/database";

/** How long the member photo signed URL stays valid, in seconds. */
const PHOTO_SIGNED_URL_TTL_SECONDS = 300;
import type {
  ProfileDocument,
  ProfileTask,
  ProfileDateEntity,
} from "@/lib/profile-utils";

type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];
type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type EntityRow = Database["public"]["Tables"]["extracted_entities"]["Row"];

/**
 * Person profile page (`/familie/[id]`).
 *
 * Server component that fetches all data for a person's profile:
 * - The family member (RLS-scoped)
 * - Documents linked to this person via confirmed `extracted_entities`
 *   (entity_type='person', linked_object_id=member.id, confirmed=true)
 * - Open tasks linked to this person via their source documents
 * - Date entities from linked documents (for the timeline)
 *
 * The data is passed to the `ProfileClient` component for rendering with
 * interactivity (navigation, empty states, timeline).
 *
 * If the member doesn't exist or doesn't belong to the user's family,
 * returns 404 (RLS-scoped query returns no row).
 */
export default async function PersonProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // 1. Fetch the member by ID (RLS-scoped to the user's family).
  const { data: member } = await supabase
    .from("family_members")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!member) {
    notFound();
  }

  const typedMember = member as MemberRow;

  // Resolve the member's photo (short-lived signed URL) and the name of
  // any related member, in parallel with the rest of the page's fetches.
  const photoUrlPromise = typedMember.photo_url
    ? createAdminClient()
        .storage.from("avatars")
        .createSignedUrl(typedMember.photo_url, PHOTO_SIGNED_URL_TTL_SECONDS)
        .then((res) => res.data?.signedUrl ?? null)
    : Promise.resolve(null);

  // The member's relationships ("Mutter von Emma und Hanna", …). This page
  // only displays them, so a failed read costs a line of text, nothing more.
  const relationsPromise = loadMemberRelations(supabase, typedMember.id).then(
    (result) => result.relations,
  );

  // Other members of the same family — the people a relation can point at.
  const otherMembersPromise = supabase
    .from("family_members")
    .select("id, name")
    .eq("family_id", typedMember.family_id)
    .neq("id", typedMember.id)
    .then((res) => res.data ?? []);

  // 2. Fetch confirmed person entities linked to this member.
  // These give us the document IDs of documents assigned to this person.
  const { data: personEntities } = await supabase
    .from("extracted_entities")
    .select("document_id")
    .eq("entity_type", "person")
    .eq("linked_object_id", typedMember.id)
    .eq("confirmed", true);

  // Extract unique document IDs linked to this person.
  const documentIds = [
    ...new Set((personEntities ?? []).map((e) => e.document_id)),
  ];

  // If no documents are linked, pass empty data to the client component
  // (which will render empty states for each section).
  const [photoUrl, relations, otherMembers] = await Promise.all([
    photoUrlPromise,
    relationsPromise,
    otherMembersPromise,
  ]);

  if (documentIds.length === 0) {
    return (
      <ProfileClient
        member={typedMember}
        documents={[]}
        tasks={[]}
        dateEntities={[]}
        photoUrl={photoUrl}
        relations={relations}
        otherMembers={otherMembers}
      />
    );
  }

  // 3. Fetch the documents linked to this person.
  const { data: docData } = await supabase
    .from("documents")
    .select(
      "id, title, document_type, status, created_at, confirmed_at, original_filename",
    )
    .in("id", documentIds)
    .order("created_at", { ascending: false });

  const documents: ProfileDocument[] = (docData ?? []).map((d) => {
    const doc = d as Pick<
      DocumentRow,
      | "id"
      | "title"
      | "document_type"
      | "status"
      | "created_at"
      | "confirmed_at"
      | "original_filename"
    >;
    return {
      id: doc.id,
      title: doc.title,
      document_type: doc.document_type,
      status: doc.status,
      created_at: doc.created_at,
      confirmed_at: doc.confirmed_at,
      original_filename: doc.original_filename,
    };
  });

  // 4. Fetch open, confirmed tasks linked to this person via their documents.
  const { data: taskData } = await supabase
    .from("tasks")
    .select("id, title, due_date, status, document_id")
    .in("document_id", documentIds)
    .eq("confirmed", true)
    .eq("status", "open")
    .order("due_date", { ascending: true, nullsFirst: false });

  // Fetch document titles for the task cards' source-document links.
  const taskDocIds = [
    ...new Set((taskData ?? []).map((t) => t.document_id).filter((id): id is string => Boolean(id))),
  ];
  const taskDocIdsToFetch = taskDocIds.filter(
    (docId) => !documentIds.includes(docId),
  );
  const allDocIdsToFetch = [...documentIds, ...taskDocIdsToFetch];

  const { data: taskDocData } = await supabase
    .from("documents")
    .select("id, title, original_filename")
    .in("id", allDocIdsToFetch);

  // Build a lookup map for document titles.
  const docTitleMap = new Map<string, string | null>();
  for (const d of taskDocData ?? []) {
    const doc = d as Pick<DocumentRow, "id" | "title" | "original_filename">;
    docTitleMap.set(doc.id, doc.title);
  }

  const tasks: ProfileTask[] = (taskData ?? []).map((t) => {
    const task = t as Pick<
      TaskRow,
      "id" | "title" | "due_date" | "status" | "document_id"
    >;
    return {
      id: task.id,
      title: task.title,
      due_date: task.due_date,
      status: task.status,
      document_id: task.document_id,
    };
  });

  // 5. Fetch date entities from documents linked to this person (for timeline).
  const { data: dateEntityData } = await supabase
    .from("extracted_entities")
    .select("id, entity_value, document_id")
    .eq("entity_type", "date")
    .eq("confirmed", true)
    .in("document_id", documentIds);

  const dateEntities: ProfileDateEntity[] = (dateEntityData ?? []).map((e) => {
    const entity = e as Pick<
      EntityRow,
      "id" | "entity_value" | "document_id"
    >;
    return {
      id: entity.id,
      entity_value: entity.entity_value,
      document_id: entity.document_id,
    };
  });

  return (
    <ProfileClient
      member={typedMember}
      documents={documents}
      tasks={tasks}
      dateEntities={dateEntities}
      documentTitles={docTitleMap}
      photoUrl={photoUrl}
      relations={relations}
      otherMembers={otherMembers}
    />
  );
}
