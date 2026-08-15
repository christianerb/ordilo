import { createClient } from "@/lib/supabase/server";
import { InviteLanding } from "./invite-landing";

type MergePreview = {
  sourceFamilyName: string;
  documentCount: number;
  taskCount: number;
  calendarEventCount: number;
  memberCount: number;
  collectionCount: number;
  targetAdultCount: number;
  fingerprint: string;
};

/**
 * Invite landing page — `/invite/[token]`.
 *
 * Three states:
 *   - Signed in: a confirmation screen shows the family name; the invite
 *     is accepted only after the user explicitly clicks "Familie beitreten"
 *     (server action), never during a GET render — a shared link must not
 *     pull a signed-in visitor into a family unnoticed.
 *   - Signed out: shows who invited them (family name) and a one-field
 *     email form; the magic-link callback accepts the invite automatically
 *     (via the ordilo_invite cookie), so the invited person clicks the
 *     email link and is IN the family.
 *
 * Invalid/expired tokens render a friendly German error state.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  // The info RPC is granted to anon + authenticated, so one lookup covers
  // both states; it never mutates anything.
  const [
    {
      data: { user },
    },
    { data: info },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_family_invite_info", { p_token: token }),
  ]);
  const infoResult = info as { status?: string; family_name?: string } | null;

  if (!infoResult || infoResult.status !== "valid") {
    return <InviteLanding token={token} familyName={null} state="invalid" />;
  }

  // Signed out: the email form is the only sensible screen — there is no
  // account yet to join with, and no family of theirs to merge.
  if (!user) {
    return (
      <InviteLanding
        token={token}
        familyName={infoResult.family_name ?? null}
        state="valid"
      />
    );
  }

  let mergePreview: MergePreview | null = null;
  let previewStatus: string | null = null;
  const { data, error: previewError } = await supabase.rpc(
    "get_family_invite_merge_preview",
    { p_token: token },
  );
  if (previewError) {
    // Fall back to the plain confirmation screen — accepting still works for
    // everyone who has no family to merge. Logged because a silent fallback
    // here looks exactly like a healthy invite until the user clicks.
    console.error("[invite] merge preview RPC failed:", previewError);
  }
  const preview = data as {
    status?: string;
    source_family_name?: string;
    document_count?: number;
    task_count?: number;
    calendar_event_count?: number;
    member_count?: number;
    collection_count?: number;
    target_adult_count?: number;
    fingerprint?: string;
  } | null;
  previewStatus = preview?.status ?? null;
  if (
    preview?.status === "merge_available"
    && preview.source_family_name
    && preview.fingerprint
  ) {
    mergePreview = {
      sourceFamilyName: preview.source_family_name,
      documentCount: preview.document_count ?? 0,
      taskCount: preview.task_count ?? 0,
      calendarEventCount: preview.calendar_event_count ?? 0,
      memberCount: preview.member_count ?? 0,
      collectionCount: preview.collection_count ?? 0,
      targetAdultCount: preview.target_adult_count ?? 0,
      fingerprint: preview.fingerprint,
    };
  }

  return (
    <InviteLanding
      token={token}
      familyName={infoResult.family_name ?? null}
      mergePreview={mergePreview}
      state={
        mergePreview
          ? mergePreview.documentCount
            + mergePreview.taskCount
            + mergePreview.calendarEventCount
            + mergePreview.memberCount
            + mergePreview.collectionCount
            === 0
            ? "empty_source"
            : "merge"
          : previewStatus === "shared_source_family"
            ? "shared_source_family"
            : previewStatus === "source_processing"
              ? "source_processing"
            : "confirm"
      }
    />
  );
}
