import { z } from "zod";
import { getSupabase } from "./supabase";

const accessSchema = z.object({
  status: z.literal("ok"),
  members: z.array(z.object({
    user_id: z.string().uuid(),
    email: z.string().nullable(),
    is_owner: z.boolean(),
    is_self: z.boolean(),
  })),
  invites: z.array(z.object({
    id: z.string().uuid(),
    expires_at: z.string(),
    // Added by migration 0083 — nullish so the panel also survives the
    // pre-migration RPC shape while the migration rolls out.
    label: z.string().nullish(),
    accepted_at: z.string().nullish(),
    accepted_by: z.string().uuid().nullish(),
  })),
});
export type FamilyAccess = z.infer<typeof accessSchema>;
export type AccessMember = FamilyAccess["members"][number];
export type AccessInvite = FamilyAccess["invites"][number];
const ERROR = "Der Zugriff konnte nicht geprüft werden. Bitte versuche es erneut.";

/** Invite links are valid for 14 days (DB default, migration 0029). */
export const INVITE_VALIDITY_DAYS = 14;

function formatGermanDate(date: Date): string {
  return date.toLocaleDateString("de-DE");
}

/** Row title: the owner's label when set, else a neutral numbered name. */
export function describeInviteTitle(
  invite: Pick<AccessInvite, "label">,
  position: number,
): string {
  const label = invite.label?.trim();
  return label ? label : `Einladungslink ${position}`;
}

/**
 * The invite's bookkeeping line: "Link erstellt am … · gültig bis …".
 * The creation day is derived from the fixed 14-day validity because the
 * access RPC does not carry created_at; app inserts never override the
 * DB default, so the derivation is exact for every invite the app shows.
 * Empty when the expiry itself is unreadable (the row then omits the line).
 */
export function describeInviteDates(
  invite: Pick<AccessInvite, "expires_at">,
): string {
  const expires = new Date(invite.expires_at);
  if (Number.isNaN(expires.getTime())) return "";
  const created = new Date(expires);
  created.setDate(created.getDate() - INVITE_VALIDITY_DAYS);
  return `Link erstellt am ${formatGermanDate(created)} · gültig bis ${formatGermanDate(expires)}`;
}

/** "Offen" vs "Angenommen am …" — the honest state of a shared link. */
export function describeInviteStatus(
  invite: Pick<AccessInvite, "accepted_at">,
): string {
  if (!invite.accepted_at) return "Offen";
  const accepted = new Date(invite.accepted_at);
  if (Number.isNaN(accepted.getTime())) return "Offen";
  return `Angenommen am ${formatGermanDate(accepted)}`;
}

export async function getFamilyAccess(familyId: string): Promise<
  { success: true; data: FamilyAccess } | { success: false; error: string }
> {
  try {
    const { data, error } = await getSupabase().rpc("get_family_access", { p_family_id: familyId });
    const parsed = accessSchema.safeParse(data);
    if (error || !parsed.success) return { success: false, error: ERROR };
    return { success: true, data: parsed.data };
  } catch {
    return { success: false, error: ERROR };
  }
}

export async function revokeFamilyAccess(familyId: string, target: { userId: string } | { inviteId: string }): Promise<
  { success: true } | { success: false; error: string }
> {
  try {
    const member = "userId" in target;
    const { data, error } = await getSupabase().rpc(
      member ? "revoke_family_access" : "revoke_family_invite",
      member
        ? { p_family_id: familyId, p_user_id: target.userId }
        : { p_family_id: familyId, p_invite_id: target.inviteId },
    );
    if (!error && data?.status === "ok") return { success: true };
    return { success: false, error: data?.status === "owner_protected"
      ? "Dein eigener Zugriff bleibt bestehen, weil du die Familie angelegt hast."
      : "Der Zugriff konnte nicht beendet werden. Bitte lade die Ansicht neu und versuche es erneut." };
  } catch {
    return { success: false, error: "Der Zugriff konnte nicht beendet werden. Bitte versuche es erneut." };
  }
}
