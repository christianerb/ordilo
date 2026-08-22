import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import {
  type ActionResult,
  FRIENDLY_ERROR,
  getUserFamily,
} from "@/lib/actions/result";

/**
 * Delete the user's family and their account (DSGVO Art. 17 — right to
 * erasure). Shared by the `/familie` server action and the
 * `DELETE /api/me` route — both authenticate the caller first and hand the
 * resolved user over.
 *
 * A family owner deletes their whole family. An invited member, including a
 * person who merged their own family into another one, may delete only their
 * own account and membership — never the shared family's data. Owner deletion
 * cascades to every family-scoped table (documents, tasks, members, chat,
 * collections, embeddings, …). Two things are NOT covered by the cascade and
 * are removed explicitly:
 *   - Storage files (document scans + member avatars) in the private buckets
 *   - The auth user itself (full account deletion; also removes the user's
 *     family_memberships rows for any other families via user_id cascade)
 *
 * @param user - The authenticated user (already resolved by the caller).
 * @param confirmName - The family name, typed by the user to confirm. Must
 *                      match exactly (defense in depth on top of the client).
 * @returns `{ success: true, data: null }` on success, or a German error.
 */
export async function deleteFamilyAccountData(
  user: User,
  confirmName: string,
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  // Resolve the family the user OWNS (created_by is unique, so at most one).
  const { data: family, error: familyError } = await supabase
    .from("families")
    .select("id, name")
    .eq("created_by", user.id)
    .maybeSingle();

  if (familyError) {
    return { success: false, error: FRIENDLY_ERROR };
  }
  if (!family) {
    // The user is an invited member. They may erase their own account, but
    // must never delete the shared family's records.
    const { data: sharedFamily, error: sharedFamilyError } = await getUserFamily(
      supabase,
    );
    if (sharedFamilyError || !sharedFamily) {
      return { success: false, error: FRIENDLY_ERROR };
    }
    if (confirmName.trim() !== sharedFamily.name) {
      return {
        success: false,
        error: "Der Name stimmt nicht mit dem Familiennamen überein.",
      };
    }

    const admin = createAdminClient();
    const { error: membershipError } = await admin
      .from("family_memberships")
      .delete()
      .eq("family_id", sharedFamily.id)
      .eq("user_id", user.id);
    if (membershipError) {
      return { success: false, error: FRIENDLY_ERROR };
    }

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteUserError) {
      console.error(
        "deleteFamilyAccount: failed to delete invited auth user",
        deleteUserError,
      );
    }
    return { success: true, data: null };
  }

  // Confirmation: the typed name must match the family name exactly.
  if (confirmName.trim() !== family.name) {
    return {
      success: false,
      error: "Der Name stimmt nicht mit dem Familiennamen überein.",
    };
  }

  // Privileged work (storage + auth) needs the service-role client.
  const admin = createAdminClient();

  // Collect storage paths BEFORE deleting rows — the rows hold the locations.
  const { data: docs } = await admin
    .from("documents")
    .select("file_url")
    .eq("family_id", family.id);
  const documentPaths = (docs ?? [])
    .map((d) => d.file_url)
    .filter((url): url is string => Boolean(url));

  const { data: memberRows } = await admin
    .from("family_members")
    .select("photo_url")
    .eq("family_id", family.id);
  const avatarPaths = (memberRows ?? [])
    .map((m) => m.photo_url)
    .filter((url): url is string => Boolean(url));

  // Delete the family row — cascades to all family-scoped data.
  const { error: deleteError } = await admin
    .from("families")
    .delete()
    .eq("id", family.id);

  if (deleteError) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  // Best-effort storage cleanup — orphaned files are non-fatal (the data is
  // already gone), so failures are swallowed.
  if (documentPaths.length > 0) {
    await admin.storage
      .from("documents")
      .remove(documentPaths)
      .catch(() => {});
  }
  if (avatarPaths.length > 0) {
    await admin.storage
      .from("avatars")
      .remove(avatarPaths)
      .catch(() => {});
  }

  // Delete the auth user (full account deletion). The family's data is
  // already erased — the DSGVO-relevant part — so a failure here only leaves
  // an orphaned login (no family, no data) and is logged, not fatal.
  const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteUserError) {
    console.error(
      "deleteFamilyAccount: failed to delete auth user",
      deleteUserError,
    );
  }

  return { success: true, data: null };
}
