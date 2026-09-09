import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import {
  type ActionResult,
  FRIENDLY_ERROR,
  getUserFamily,
} from "@/lib/actions/result";

const STORAGE_DELETE_BATCH_SIZE = 100;
const STORAGE_PATH_PAGE_SIZE = 1_000;

type AdminClient = ReturnType<typeof createAdminClient>;

async function loadFamilyStoragePaths(
  admin: AdminClient,
  familyId: string,
): Promise<{ documentPaths: string[]; avatarPaths: string[] } | null> {
  const documentPaths: string[] = [];
  for (let from = 0; ; from += STORAGE_PATH_PAGE_SIZE) {
    const { data, error } = await admin
      .from("documents")
      .select("file_url")
      .eq("family_id", familyId)
      .order("id")
      .range(from, from + STORAGE_PATH_PAGE_SIZE - 1);
    if (error) return null;

    const rows = data ?? [];
    documentPaths.push(
      ...rows
        .map((row) => row.file_url)
        .filter((path): path is string => Boolean(path)),
    );
    if (rows.length < STORAGE_PATH_PAGE_SIZE) break;
  }

  const avatarPaths: string[] = [];
  for (let from = 0; ; from += STORAGE_PATH_PAGE_SIZE) {
    const { data, error } = await admin
      .from("family_members")
      .select("photo_url")
      .eq("family_id", familyId)
      .order("id")
      .range(from, from + STORAGE_PATH_PAGE_SIZE - 1);
    if (error) return null;

    const rows = data ?? [];
    avatarPaths.push(
      ...rows
        .map((row) => row.photo_url)
        .filter((path): path is string => Boolean(path)),
    );
    if (rows.length < STORAGE_PATH_PAGE_SIZE) break;
  }

  return { documentPaths, avatarPaths };
}

async function removeStoragePaths(
  admin: AdminClient,
  bucket: "documents" | "avatars",
  paths: string[],
): Promise<boolean> {
  for (let offset = 0; offset < paths.length; offset += STORAGE_DELETE_BATCH_SIZE) {
    const batch = paths.slice(offset, offset + STORAGE_DELETE_BATCH_SIZE);
    const { error } = await admin.storage.from(bucket).remove(batch);
    if (error) {
      console.error(`deleteFamilyAccount: failed to clear ${bucket} storage`, error);
      return false;
    }
  }
  return true;
}

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
    if (sharedFamilyError) {
      return { success: false, error: FRIENDLY_ERROR };
    }
    if (sharedFamily && confirmName.trim() !== sharedFamily.name) {
      return {
        success: false,
        error: "Der Name stimmt nicht mit dem Familiennamen überein.",
      };
    }

    // Auth deletion cascades the invited user's memberships. Deleting the
    // membership first would lock the user out of the family while leaving
    // a working auth account behind when the auth call fails.
    const admin = createAdminClient();
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteUserError) {
      console.error(
        "deleteFamilyAccount: failed to delete invited auth user",
        deleteUserError,
      );
      return {
        success: false,
        error:
          "Dein Konto konnte noch nicht vollständig gelöscht werden. Bitte versuche es erneut.",
      };
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

  // Storage is outside the database transaction. Read every path with
  // pagination, remove the private objects first, and only then delete the
  // rows that prove where those objects lived. Missing that order can make a
  // failed Storage request leave private scans behind with no owner row and
  // no reliable cleanup path.
  const storagePaths = await loadFamilyStoragePaths(admin, family.id);
  if (!storagePaths) {
    return { success: false, error: FRIENDLY_ERROR };
  }
  const documentsRemoved = await removeStoragePaths(
    admin,
    "documents",
    storagePaths.documentPaths,
  );
  const avatarsRemoved = await removeStoragePaths(
    admin,
    "avatars",
    storagePaths.avatarPaths,
  );
  if (!documentsRemoved || !avatarsRemoved) {
    return {
      success: false,
      error:
        "Deine Daten konnten noch nicht vollständig gelöscht werden. Bitte versuche es erneut.",
    };
  }

  // Delete the family row after private Storage is confirmed gone. This
  // cascades to all family-scoped database data.
  const { error: deleteError } = await admin
    .from("families")
    .delete()
    .eq("id", family.id);

  if (deleteError) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  // Delete the auth user (full account deletion). A failure must be surfaced:
  // otherwise the UI would claim the account is gone while its login still
  // works. The no-family branch above lets the user retry this final step.
  const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteUserError) {
    console.error(
      "deleteFamilyAccount: failed to delete auth user",
      deleteUserError,
    );
    return {
      success: false,
      error:
        "Dein Konto konnte noch nicht vollständig gelöscht werden. Bitte versuche es erneut.",
    };
  }

  return { success: true, data: null };
}
