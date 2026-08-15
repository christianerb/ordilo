import { createClient } from "@/lib/supabase/client";

/**
 * Who added a document, resolved for display.
 *
 * `documents.uploaded_by` stores an auth user id, which means nothing to a
 * family. A family member row links that user to a person
 * (`family_members.linked_user_id`), so a document can say "Von Christian
 * hinzugefügt" instead of showing nothing at all.
 */
export interface DocumentAttribution {
  /** The family member's name, or null when no member is linked. */
  name: string | null;
  /** True when the current user added the document ("Von dir"). */
  isCurrentUser: boolean;
}

/**
 * Resolve the family member behind a document's `uploaded_by` user id.
 *
 * Best-effort: a missing link, a read failure, or a user who left the
 * family all resolve to `{ name: null }`, and the caller falls back to
 * showing just the date. Never throws — attribution is context, not a
 * reason to break a detail view.
 */
export async function fetchDocumentAttribution(
  uploadedBy: string | null,
): Promise<DocumentAttribution> {
  if (!uploadedBy) return { name: null, isCurrentUser: false };

  try {
    const supabase = createClient();

    const [{ data: auth }, { data: member }] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("family_members")
        .select("name")
        .eq("linked_user_id", uploadedBy)
        .limit(1)
        .maybeSingle(),
    ]);

    return {
      name: member?.name ?? null,
      isCurrentUser: auth?.user?.id === uploadedBy,
    };
  } catch {
    return { name: null, isCurrentUser: false };
  }
}
