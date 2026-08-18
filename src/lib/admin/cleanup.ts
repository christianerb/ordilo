import "server-only";

import { createClient as createAdminClient } from "@/lib/supabase/admin";

const ACTIVITY_RETENTION_DAYS = 365;
const ACCESS_ATTEMPT_RETENTION_DAYS = 2;
const TRASH_RETENTION_DAYS = 30;

export async function purgeExpiredAdminAnalytics(): Promise<void> {
  const admin = createAdminClient();
  const activityCutoff = new Date(
    Date.now() - ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const attemptCutoff = new Date(
    Date.now() - ACCESS_ATTEMPT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [events, attempts] = await Promise.all([
    admin.from("product_events").delete().lt("occurred_at", activityCutoff),
    admin
      .from("admin_access_attempts")
      .delete()
      .lt("attempted_at", attemptCutoff),
  ]);
  if (events.error) throw events.error;
  if (attempts.error) throw attempts.error;
}

/** Permanently remove paper-bin entries after the recovery window ends. */
export async function purgeExpiredTrash(): Promise<void> {
  const admin = createAdminClient();
  const cutoff = new Date(
    Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: documents, error: documentReadError } = await admin.rpc(
    "claim_expired_trash_documents",
    { p_cutoff: cutoff },
  );
  if (documentReadError) throw documentReadError;

  const filePaths = (documents ?? [])
    .map((document) => document.file_url)
    .filter((fileUrl): fileUrl is string => Boolean(fileUrl));
  if (filePaths.length > 0) {
    const { error: storageError } = await admin.storage
      .from("documents")
      .remove(filePaths);
    // Keep the purge claim on failure. Restoring a row after its object may
    // have been partly removed would be worse than retrying the cleanup.
    if (storageError) throw storageError;
  }

  const claimedDocumentIds = (documents ?? []).map((document) => document.id);
  if (claimedDocumentIds.length > 0) {
    const { error: documentsError } = await admin
      .from("documents")
      .delete()
      .in("id", claimedDocumentIds)
      .not("purge_started_at", "is", null);
    if (documentsError) throw documentsError;
  }

  const { error: standaloneTasksError } = await admin
    .from("tasks")
    .delete()
    .is("trashed_by_document_id", null)
    .lt("deleted_at", cutoff);
  if (standaloneTasksError) throw standaloneTasksError;
}
