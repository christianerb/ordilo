import { getSupabase } from "./supabase";
import { FRIENDLY_ERROR } from "./onboarding";

/**
 * Family invites — a 1:1 port of the web invite server actions
 * (src/app/invite/actions.ts) and the invite creation action
 * (src/app/(app)/familie/actions.ts) onto direct Supabase RPCs. The web
 * cookie dance (ordilo_invite + /auth/callback) is not needed here: the
 * OTP round trip happens inline on the invite screen, so typing the code
 * can accept the invite immediately.
 */

export const INVITE_TOKEN_REGEX = /^[a-f0-9]{16,64}$/i;

const PREPARATION_FAILED =
  "Wir konnten deine Familie gerade nicht prüfen. Bitte versuche es erneut.";
const SESSION_EXPIRED =
  "Deine Anmeldung ist abgelaufen. Bitte öffne den Einladungslink erneut.";

export type AcceptInviteReason =
  | "invalid"
  | "already_in_family"
  | "merge_required"
  | "shared_source_family"
  | "source_processing"
  | "preview_changed";

export type AcceptInviteResult =
  | { success: true; notificationId?: string }
  | { success: false; error: string; reason?: AcceptInviteReason };

export interface InviteMergePreview {
  sourceFamilyName: string;
  documentCount: number;
  taskCount: number;
  calendarEventCount: number;
  memberCount: number;
  collectionCount: number;
  targetAdultCount: number;
  fingerprint: string;
}

export type MergePreparationResult =
  | {
      success: true;
      state: "merge" | "empty_source";
      preview: InviteMergePreview;
    }
  | {
      success: true;
      state:
        | "invalid"
        | "shared_source_family"
        | "source_processing"
        /** Membership already exists — the join happened, nothing to merge. */
        | "joined"
        /** No owned family (any more) — plain accept is enough. */
        | "joinable";
    }
  | { success: false; error: string };

/** Read-only invite info; callable without a session. */
export async function getInviteInfo(
  token: string,
): Promise<{ status: "valid"; familyName: string | null } | { status: "invalid" }> {
  if (!INVITE_TOKEN_REGEX.test(token)) return { status: "invalid" };
  try {
    const { data, error } = await getSupabase().rpc("get_family_invite_info", {
      p_token: token,
    });
    if (error) return { status: "invalid" };
    const info = data as { status?: string; family_name?: string } | null;
    if (!info || info.status !== "valid") return { status: "invalid" };
    return { status: "valid", familyName: info.family_name ?? null };
  } catch {
    return { status: "invalid" };
  }
}

/**
 * Accept a family invite for the signed-in user. Runs only on an explicit
 * user action (or right after the invite's own code was typed — that IS
 * the consent), never on screen load.
 */
export async function acceptInvite(token: string): Promise<AcceptInviteResult> {
  if (!INVITE_TOKEN_REGEX.test(token)) {
    return {
      success: false,
      reason: "invalid",
      error: "Die Einladung ist ungültig.",
    };
  }

  const { data, error } = await getSupabase().rpc("accept_family_invite", {
    p_token: token,
  });

  if (error) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  const status = (data as { status?: string } | null)?.status;
  const notificationId = (data as { notification_id?: string } | null)
    ?.notification_id;
  switch (status) {
    case "joined":
      return { success: true, ...(notificationId ? { notificationId } : {}) };
    case "already_in_family":
      return {
        success: false,
        reason: "already_in_family",
        error: "Du bist schon in einer Familie.",
      };
    case "merge_required":
      return {
        success: false,
        reason: "merge_required",
        error: "Deine Familie muss zuerst zusammengeführt werden.",
      };
    case "shared_source_family":
      return {
        success: false,
        reason: "shared_source_family",
        error:
          "Deine bisherige Familie wird schon von mehreren Konten genutzt und kann nicht automatisch zusammengeführt werden.",
      };
    case "source_processing":
      return {
        success: false,
        reason: "source_processing",
        error:
          "Deine Dokumente werden noch vorbereitet. Warte bitte kurz und versuche es dann erneut.",
      };
    case "unauthenticated":
      return { success: false, error: SESSION_EXPIRED };
    default:
      return {
        success: false,
        reason: "invalid",
        error: "Diese Einladung ist nicht mehr gültig.",
      };
  }
}

/**
 * Re-resolve the merge decision after accepting found an owned family, so
 * the UI never shows a stale page. Same mapping as the web action.
 */
export async function getInviteMergePreparation(
  token: string,
): Promise<MergePreparationResult> {
  if (!INVITE_TOKEN_REGEX.test(token)) {
    return { success: true, state: "invalid" };
  }

  const { data, error } = await getSupabase().rpc(
    "get_family_invite_merge_preview",
    { p_token: token },
  );
  if (error) {
    return { success: false, error: PREPARATION_FAILED };
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

  switch (preview?.status) {
    case "merge_available": {
      if (!preview.source_family_name || !preview.fingerprint) {
        return { success: false, error: PREPARATION_FAILED };
      }
      const mergePreview: InviteMergePreview = {
        sourceFamilyName: preview.source_family_name,
        documentCount: preview.document_count ?? 0,
        taskCount: preview.task_count ?? 0,
        calendarEventCount: preview.calendar_event_count ?? 0,
        memberCount: preview.member_count ?? 0,
        collectionCount: preview.collection_count ?? 0,
        targetAdultCount: preview.target_adult_count ?? 0,
        fingerprint: preview.fingerprint,
      };
      const isEmpty =
        mergePreview.documentCount +
          mergePreview.taskCount +
          mergePreview.calendarEventCount +
          mergePreview.memberCount +
          mergePreview.collectionCount ===
        0;
      return {
        success: true,
        state: isEmpty ? "empty_source" : "merge",
        preview: mergePreview,
      };
    }
    case "shared_source_family":
      return { success: true, state: "shared_source_family" };
    case "source_processing":
      return { success: true, state: "source_processing" };
    case "invalid":
      return { success: true, state: "invalid" };
    case "joined":
      return { success: true, state: "joined" };
    case "joinable":
      return { success: true, state: "joinable" };
    case "unauthenticated":
      return { success: false, error: SESSION_EXPIRED };
    default:
      return { success: false, error: PREPARATION_FAILED };
  }
}

/**
 * The signed-in merge decision for the initial load — same mapping the web
 * page.tsx applies (fallback to the plain confirmation when the preview
 * RPC fails: accepting still works for users with nothing to merge).
 */
export async function resolveSignedInInviteState(token: string): Promise<
  | { state: "merge" | "empty_source"; preview: InviteMergePreview }
  | {
      state: "confirm" | "shared_source_family" | "source_processing";
      preview: null;
    }
> {
  const preparation = await getInviteMergePreparation(token);
  if (!preparation.success) {
    return { state: "confirm", preview: null };
  }
  if (
    preparation.state === "merge" ||
    preparation.state === "empty_source"
  ) {
    return { state: preparation.state, preview: preparation.preview };
  }
  if (
    preparation.state === "shared_source_family" ||
    preparation.state === "source_processing"
  ) {
    return { state: preparation.state, preview: null };
  }
  // "joined" (already a member), "joinable", and "invalid" all land on the
  // plain confirmation/accept path, which resolves the real state.
  return { state: "confirm", preview: null };
}

/**
 * Move the signed-in owner's private family into the invited family. The
 * RPC transfers everything in one transaction and requires the preview
 * fingerprint to match.
 */
export async function mergeOwnedFamilyIntoInvite(
  token: string,
  previewFingerprint: string,
): Promise<AcceptInviteResult> {
  if (!INVITE_TOKEN_REGEX.test(token)) {
    return {
      success: false,
      reason: "invalid",
      error: "Die Einladung ist ungültig.",
    };
  }

  const { data, error } = await getSupabase().rpc(
    "merge_owned_family_into_invite",
    { p_token: token, p_preview_fingerprint: previewFingerprint },
  );

  if (error) {
    return {
      success: false,
      error: "Das Zusammenführen hat nicht geklappt. Bitte versuche es erneut.",
    };
  }

  const status = (data as { status?: string } | null)?.status;
  const notificationId = (data as { notification_id?: string } | null)
    ?.notification_id;
  switch (status) {
    case "merged":
    case "joined":
      return { success: true, ...(notificationId ? { notificationId } : {}) };
    case "invalid":
      return {
        success: false,
        reason: "invalid",
        error: "Diese Einladung ist nicht mehr gültig.",
      };
    case "shared_source_family":
      return {
        success: false,
        reason: "shared_source_family",
        error:
          "Deine bisherige Familie wird schon von mehreren Konten genutzt und kann nicht automatisch zusammengeführt werden.",
      };
    case "source_processing":
      return {
        success: false,
        reason: "source_processing",
        error:
          "Deine Dokumente werden noch vorbereitet. Warte bitte kurz und versuche es dann erneut.",
      };
    case "preview_changed":
      return {
        success: false,
        reason: "preview_changed",
        error:
          "Deine Inhalte haben sich gerade geändert. Wir zeigen dir die aktuelle Übersicht.",
      };
    case "unauthenticated":
      return { success: false, error: SESSION_EXPIRED };
    default:
      return {
        success: false,
        error: "Das Zusammenführen hat nicht geklappt. Bitte versuche es erneut.",
      };
  }
}

/**
 * Create a shareable invite link for the own family (owner-only via RLS).
 * Multi-use, valid 14 days — same defaults as the web action.
 */
export async function createFamilyInvite(
  familyId: string,
): Promise<
  { success: true; token: string } | { success: false; error: string }
> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: FRIENDLY_ERROR };
  }

  const { data, error } = await supabase
    .from("family_invites")
    .insert({ family_id: familyId, created_by: user.id })
    .select("token")
    .single();

  if (error || !data) {
    // RLS rejects non-owners — the web shows the same specific message.
    return {
      success: false,
      error:
        "Einladung konnte nicht erstellt werden. Nur wer die Familie angelegt hat, kann einladen.",
    };
  }
  return { success: true, token: (data as { token: string }).token };
}
