"use server";

import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { SimpleActionResult } from "@/lib/actions/result";
import { INVITE_COOKIE } from "@/lib/invite";

/**
 * Server actions for the invite landing page (`/invite/[token]`).
 *
 * NOTE: "use server" modules may only export async functions.
 */

type ActionResult = SimpleActionResult;

type AcceptInviteResult =
  | { success: true; notificationId?: string }
  | {
      success: false;
      error: string;
      /** Machine-readable reason so the UI can switch to a dedicated screen. */
      reason?:
        | "invalid"
        | "already_in_family"
        | "merge_required"
        | "shared_source_family"
        | "source_processing"
        | "preview_changed";
    };

type InviteMergePreview = {
  sourceFamilyName: string;
  documentCount: number;
  taskCount: number;
  calendarEventCount: number;
  memberCount: number;
  collectionCount: number;
  targetAdultCount: number;
  fingerprint: string;
};

type MergePreparationResult =
  | { success: true; state: "merge" | "empty_source"; preview: InviteMergePreview }
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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_TOKEN_REGEX = /^[a-f0-9]{16,64}$/i;

const PREPARATION_FAILED =
  "Wir konnten deine Familie gerade nicht prüfen. Bitte versuche es erneut.";
const SESSION_EXPIRED = "Deine Anmeldung ist abgelaufen. Bitte lade die Seite neu.";

/**
 * Resolve the absolute app base URL for links in auth emails.
 *
 * The configured APP_BASE_URL always wins. Host and forwarded headers are
 * attacker-controllable: building the redirect from them (host-header
 * injection) would send a victim's login link to a hostile origin, leaking
 * the auth code. Only when nothing is configured do we fall back to the
 * request's Origin header, which the browser sets itself for the form POST
 * (same pattern as the digest route: `APP_BASE_URL || request origin`).
 */
function resolveAppBaseUrl(requestHeaders: Headers): string | null {
  const configured = process.env.APP_BASE_URL?.trim();
  const candidate = configured || requestHeaders.get("origin");
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Send a passwordless sign-in code to an invited user.
 *
 * After code verification, the client returns to the invite URL, where the
 * signed-in page accepts the invitation.
 *
 * @param email - The invitee's email address.
 * @param token - The invite token from the URL.
 */
export async function requestInviteSignIn(
  email: string,
  token: string,
): Promise<ActionResult> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(trimmedEmail)) {
    return {
      success: false,
      error: "Bitte gib eine gültige E-Mail-Adresse ein.",
    };
  }
  if (!INVITE_TOKEN_REGEX.test(token)) {
    return { success: false, error: "Die Einladung ist ungültig." };
  }

  const requestHeaders = await headers();
  const baseUrl = resolveAppBaseUrl(requestHeaders);
  if (!baseUrl) {
    return {
      success: false,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    };
  }

  const cookieStore = await cookies();
  cookieStore.set(INVITE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: baseUrl.startsWith("https://"),
    path: "/",
    maxAge: 60 * 60,
  });

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmedEmail,
    options: {
      emailRedirectTo: `${baseUrl}/auth/callback`,
    },
  });

  if (error) {
    cookieStore.delete(INVITE_COOKIE);
    return {
      success: false,
      error: "E-Mail konnte nicht gesendet werden. Bitte versuche es erneut.",
    };
  }

  return { success: true };
}

/**
 * Accept a family invite for the signed-in user.
 *
 * Runs only on an explicit user action (the "Familie beitreten" button on
 * the invite confirmation screen) — never during a page render. A shared
 * invite link must not pull a signed-in visitor into a family unnoticed.
 *
 * @param token - The invite token from the URL.
 */
export async function acceptInvite(
  token: string,
): Promise<AcceptInviteResult> {
  if (!INVITE_TOKEN_REGEX.test(token)) {
    return {
      success: false,
      reason: "invalid",
      error: "Die Einladung ist ungültig.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_family_invite", {
    p_token: token,
  });

  if (error) {
    console.error("[invite] accept RPC failed:", error);
    return {
      success: false,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    };
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
 * Resolves the current merge decision after accepting an invite found an
 * owned family. This avoids reloading a stale invite page back to confirm.
 */
export async function getInviteMergePreparation(
  token: string,
): Promise<MergePreparationResult> {
  if (!INVITE_TOKEN_REGEX.test(token)) return { success: true, state: "invalid" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_family_invite_merge_preview", {
    p_token: token,
  });
  if (error) {
    // Log it: a raising RPC is indistinguishable from a network blip in the
    // UI, and this is the one place that knows why. A stale function body
    // (0054 read a table 0053 had dropped) hid behind this message for a
    // full release.
    console.error("[invite] merge preview RPC failed:", error);
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
        console.error(
          "[invite] merge preview is missing its family name or fingerprint",
        );
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
      const isEmpty = mergePreview.documentCount + mergePreview.taskCount
        + mergePreview.calendarEventCount + mergePreview.memberCount
        + mergePreview.collectionCount === 0;
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
    // `joined` and `joinable` mean the family situation changed between the
    // accept call and this one. Both are recoverable, so they must not fall
    // into the generic failure below.
    case "joined":
      return { success: true, state: "joined" };
    case "joinable":
      return { success: true, state: "joinable" };
    case "unauthenticated":
      return { success: false, error: SESSION_EXPIRED };
    default:
      console.error(
        "[invite] merge preview returned an unknown status:",
        preview?.status,
      );
      return { success: false, error: PREPARATION_FAILED };
  }
}

/**
 * Move the authenticated owner's private family into an invited family.
 *
 * The database RPC transfers the related family-scoped rows in one
 * transaction and only allows a source family with the owner as its sole
 * account member. Storage paths remain valid because files are always served
 * through authenticated, short-lived server-side signed URLs.
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

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("merge_owned_family_into_invite", {
    p_token: token,
    p_preview_fingerprint: previewFingerprint,
  });

  if (error) {
    console.error("[invite] merge RPC failed:", error);
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
