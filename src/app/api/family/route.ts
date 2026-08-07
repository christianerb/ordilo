import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";

const GENERIC_ERROR = "Etwas ist schiefgelaufen. Bitte versuche es erneut.";

/**
 * DELETE /api/family
 *
 * Deletes the caller's family AND their account (DSGVO Art. 17 — right to
 * erasure). This is a privileged operation, so it lives in an API route (the
 * service-role client is only allowed here, never in a server action or the
 * browser — see AGENTS.md).
 *
 * Only the family OWNER (created_by) may delete it, mirroring the
 * families_owner_delete RLS policy, so an invited member cannot wipe someone
 * else's family. Deleting the families row cascades to every family-scoped
 * table (documents, tasks, members, chat, collections, embeddings, …). Two
 * things are NOT covered by the cascade and are removed explicitly:
 *   - Storage files (document scans + member avatars) in the private buckets
 *   - The auth user itself (full account deletion; also removes the user's
 *     family_memberships rows for any other families via user_id cascade)
 *
 * Ordering matters for correctness:
 *   1. Storage files are deleted FIRST and the removal is confirmed — only
 *      then are the DB rows (which hold the only copy of each file's path)
 *      removed. Aborting on a Storage error keeps the references intact so
 *      nothing is orphaned and the user can simply retry.
 *   2. The family row is deleted via the RLS-scoped server client (the owner
 *      policy re-verifies ownership at the database level).
 *   3. The auth user is deleted last; a failure here is reported as an error
 *      instead of a silent success, so the UI never claims the account is
 *      gone while the login still works.
 *
 * Body: `{ confirmName: string }` — the family name, typed by the user to
 * confirm. Must match exactly (defense in depth on top of the client).
 */
export async function DELETE(request: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) {
    return Response.json(auth.json, { status: auth.status });
  }
  const user = auth.user;

  // Parse the typed confirmation name.
  let confirmName = "";
  try {
    const body: unknown = await request.json();
    if (
      body &&
      typeof body === "object" &&
      typeof (body as { confirmName?: unknown }).confirmName === "string"
    ) {
      confirmName = (body as { confirmName: string }).confirmName.trim();
    }
  } catch {
    return Response.json(
      { error: "Ungültige Anfrage.", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  const supabase = await createServerClient();

  // Resolve the family the user OWNS (created_by is unique, so at most one).
  const { data: family, error: familyError } = await supabase
    .from("families")
    .select("id, name")
    .eq("created_by", user.id)
    .maybeSingle();

  if (familyError) {
    return Response.json(
      { error: GENERIC_ERROR, code: "DB_READ_FAILED" },
      { status: 500 },
    );
  }
  if (!family) {
    return Response.json(
      {
        error: "Nur die Person, die die Familie erstellt hat, kann sie löschen.",
        code: "NOT_OWNER",
      },
      { status: 403 },
    );
  }

  // Confirmation: the typed name must match the family name exactly.
  if (confirmName !== family.name) {
    return Response.json(
      {
        error: "Der Name stimmt nicht mit dem Familiennamen überein.",
        code: "NAME_MISMATCH",
      },
      { status: 400 },
    );
  }

  // Collect storage paths BEFORE deleting rows — the rows hold the only copy
  // of each file's location.
  const { data: docs, error: docsError } = await supabase
    .from("documents")
    .select("file_url")
    .eq("family_id", family.id);
  const { data: memberRows, error: membersError } = await supabase
    .from("family_members")
    .select("photo_url")
    .eq("family_id", family.id);
  if (docsError || membersError) {
    return Response.json(
      { error: GENERIC_ERROR, code: "DB_READ_FAILED" },
      { status: 500 },
    );
  }
  const documentPaths = (docs ?? [])
    .map((d) => d.file_url)
    .filter((url): url is string => Boolean(url));
  const avatarPaths = (memberRows ?? [])
    .map((m) => m.photo_url)
    .filter((url): url is string => Boolean(url));

  // Privileged work (storage + auth) needs the service-role client.
  const admin = createAdminClient();

  // Confirm Storage deletion BEFORE removing the rows that reference these
  // files — a Storage failure aborts here so the references survive and the
  // files can still be located for a retry.
  if (documentPaths.length > 0) {
    const { error: storageError } = await admin.storage
      .from("documents")
      .remove(documentPaths);
    if (storageError) {
      console.error("[family] document storage removal failed:", storageError);
      return Response.json(
        { error: GENERIC_ERROR, code: "STORAGE_DELETE_FAILED" },
        { status: 500 },
      );
    }
  }
  if (avatarPaths.length > 0) {
    const { error: storageError } = await admin.storage
      .from("avatars")
      .remove(avatarPaths);
    if (storageError) {
      console.error("[family] avatar storage removal failed:", storageError);
      return Response.json(
        { error: GENERIC_ERROR, code: "STORAGE_DELETE_FAILED" },
        { status: 500 },
      );
    }
  }

  // Delete the family row via the RLS-scoped client (owner policy re-checks
  // ownership); FK cascades wipe all family-scoped data.
  const { error: deleteError } = await supabase
    .from("families")
    .delete()
    .eq("id", family.id);
  if (deleteError) {
    return Response.json(
      { error: GENERIC_ERROR, code: "DB_DELETE_FAILED" },
      { status: 500 },
    );
  }

  // Delete the auth user (full account deletion). Report a failure honestly:
  // the family's data is already erased, but the login must not be reported
  // as removed when it is not.
  const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteUserError) {
    console.error("[family] failed to delete auth user:", deleteUserError);
    return Response.json(
      {
        error:
          "Die Familie wurde gelöscht, aber das Konto konnte nicht vollständig entfernt werden. Bitte kontaktiere den Support.",
        code: "AUTH_DELETE_FAILED",
      },
      { status: 500 },
    );
  }

  return Response.json({ status: "deleted", family_id: family.id });
}

/**
 * GET /api/family — method not allowed.
 */
export async function GET(): Promise<Response> {
  return Response.json(
    { error: "Methode nicht erlaubt.", code: "METHOD_NOT_ALLOWED" },
    { status: 405 },
  );
}
