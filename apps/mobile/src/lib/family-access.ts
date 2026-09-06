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
  invites: z.array(z.object({ id: z.string().uuid(), expires_at: z.string() })),
});
export type FamilyAccess = z.infer<typeof accessSchema>;
export type AccessMember = FamilyAccess["members"][number];
export type AccessInvite = FamilyAccess["invites"][number];
const ERROR = "Der Zugriff konnte nicht geprüft werden. Bitte versuche es erneut.";

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
