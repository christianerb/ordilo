import { createClient as createAdminClient } from "@/lib/supabase/admin";

/**
 * Dev-only fixture helpers for browser-testing support.
 *
 * These helpers power the disposable empty-documents fixture used by
 * validators to reliably test the /dokumente empty state. They use the
 * service-role admin client (server-only) and MUST never be exposed to
 * the browser or shipped to production.
 *
 * See `src/app/api/dev-auth/route.ts` for the route that consumes these
 * helpers.
 */

/**
 * Email of the dedicated empty-documents fixture user.
 *
 * This user is separate from the shared test user
 * (`ordilo.auth.test@gmail.com`) so that validating the empty state never
 * touches shared validation data. The user is created on first use via
 * `admin.generateLink` (which creates the user if absent) and reused on
 * subsequent calls.
 */
export const EMPTY_FIXTURE_EMAIL = "ordilo.empty.fixture@gmail.com";

/**
 * Display name for the fixture family. German, per the UI language.
 */
export const EMPTY_FIXTURE_FAMILY_NAME = "Leere Testfamilie";

/**
 * Name of the placeholder family member created for the fixture.
 *
 * The fixture needs a single member so the /familie page shows a member
 * card (not the empty state). The middleware checks the durable
 * `onboarding_completed_at` marker (not member count) to determine
 * onboarding completion, so the fixture also sets that marker.
 */
export const EMPTY_FIXTURE_MEMBER_NAME = "Test";

/**
 * Result of ensuring the empty-documents fixture is ready.
 */
export interface EmptyFixtureResult {
  /** The fixture family's UUID. */
  familyId: string;
  /** The fixture family's display name. */
  familyName: string;
}

/**
 * Ensure the disposable empty-documents fixture has exactly one family and
 * zero documents for the given user.
 *
 * This is safe to call repeatedly. Each call:
 * 1. Finds (or creates) the user's family — exactly one is expected.
 * 2. Deletes every document row belonging to that family (cascade removes
 *    pages, entities, tasks, and embeddings).
 * 3. Best-effort removes the corresponding Storage objects.
 *
 * It NEVER modifies any other user's or family's data — the fixture is
 * fully isolated by `created_by` / `family_id`.
 *
 * @param userId - The auth user id of the empty-documents fixture user.
 * @returns The fixture family id and name.
 */
export async function ensureEmptyDocumentsFixture(
  userId: string,
): Promise<EmptyFixtureResult> {
  const admin = createAdminClient();

  // 1. Find the user's family (there should be exactly one).
  //    Select onboarding_completed_at so we can set it if missing.
  const {
    data: families,
    error: familiesError,
  } = await admin
    .from("families")
    .select("id, name, onboarding_completed_at")
    .eq("created_by", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (familiesError) {
    throw new Error(
      `Failed to query fixture families: ${familiesError.message ?? familiesError}`,
    );
  }

  let familyId: string;
  let familyName: string;

  if (families && families.length > 0) {
    // Reuse the existing family.
    familyId = families[0].id;
    familyName = families[0].name;

    // Ensure the onboarding completion marker is set so the middleware
    // allows access to app routes. If the family was created before the
    // onboarding_completed_at column existed (or by code that didn't set
    // it), backfill it now.
    if (!families[0].onboarding_completed_at) {
      const { error: updateError } = await admin
        .from("families")
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq("id", familyId);

      if (updateError) {
        throw new Error(
          `Failed to set fixture onboarding_completed_at: ${updateError.message ?? updateError}`,
        );
      }
    }
  } else {
    // No family yet — create one for the fixture user with the onboarding
    // completion marker already set so the middleware allows access.
    const { data: newFamily, error: insertError } = await admin
      .from("families")
      .insert({
        name: EMPTY_FIXTURE_FAMILY_NAME,
        created_by: userId,
        onboarding_completed_at: new Date().toISOString(),
      })
      .select("id, name")
      .single();

    if (insertError || !newFamily) {
      throw new Error(
        `Failed to create fixture family: ${insertError?.message ?? insertError}`,
      );
    }

    familyId = newFamily.id;
    familyName = newFamily.name;
  }

  // 2. Ensure at least one family member exists so the /familie page
  //    shows a member card (not the empty state). The member is a
  //    harmless placeholder — the fixture still has zero documents,
  //    which is what the empty-state validation relies on.
  const { data: members, error: membersError } = await admin
    .from("family_members")
    .select("id")
    .eq("family_id", familyId)
    .limit(1);

  if (membersError) {
    throw new Error(
      `Failed to query fixture family members: ${membersError.message ?? membersError}`,
    );
  }

  if (!members || members.length === 0) {
    const { error: memberInsertError } = await admin
      .from("family_members")
      .insert({
        family_id: familyId,
        name: EMPTY_FIXTURE_MEMBER_NAME,
      });

    if (memberInsertError) {
      throw new Error(
        `Failed to create fixture family member: ${memberInsertError.message ?? memberInsertError}`,
      );
    }
  }

  // 3. Collect file paths so we can clean up Storage (best-effort).
  const { data: docs, error: docsError } = await admin
    .from("documents")
    .select("file_url")
    .eq("family_id", familyId);

  if (docsError) {
    throw new Error(
      `Failed to query fixture documents: ${docsError.message ?? docsError}`,
    );
  }

  const filePaths = (docs ?? [])
    .map((d) => d.file_url)
    .filter((url): url is string => Boolean(url));

  // 4. Delete all document rows (cascade clears child tables).
  const { error: deleteError } = await admin
    .from("documents")
    .delete()
    .eq("family_id", familyId);

  if (deleteError) {
    throw new Error(
      `Failed to delete fixture documents: ${deleteError.message ?? deleteError}`,
    );
  }

  // 5. Best-effort Storage cleanup. Failures here are non-fatal — the
  //    DB is already clean, which is what the empty-state validation
  //    relies on.
  if (filePaths.length > 0) {
    try {
      await admin.storage.from("documents").remove(filePaths);
    } catch {
      // Intentionally swallowed — Storage orphans do not affect the
      // /dokumente empty state, which is driven by the documents table.
    }
  }

  return { familyId, familyName };
}
