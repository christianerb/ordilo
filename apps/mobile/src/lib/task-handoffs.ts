import { getSupabase } from "./supabase";

export type TaskAcceptance = { task_id: string; member_id: string; user_id: string; accepted_at: string };

export async function loadTaskHandoffs(familyId: string, userId: string): Promise<{ accepted: TaskAcceptance[]; ownMemberIds: string[] }> {
  const client = getSupabase();
  const [acceptances, people] = await Promise.all([
    client.from("task_acceptances").select("task_id, member_id, user_id, accepted_at").eq("family_id", familyId),
    client.from("family_members").select("id").eq("family_id", familyId).eq("linked_user_id", userId),
  ]);
  if (acceptances.error || people.error) throw new Error("Die Übernahmen konnten nicht geladen werden.");
  return { accepted: acceptances.data ?? [], ownMemberIds: (people.data ?? []).map((person) => person.id) };
}

export async function acceptTaskHandoff(taskId: string): Promise<void> {
  const { error } = await getSupabase().rpc("accept_family_task", { p_task_id: taskId });
  if (error) throw new Error("Die Aufgabe konnte nicht übernommen werden. Bitte aktualisiere euren Plan und versuch es nochmal.");
}

export function taskHandoffLabel(assignedTo: string | null, acceptedMemberId: string | undefined, name: string | undefined): string | null {
  if (!assignedTo || !name) return null;
  return assignedTo === acceptedMemberId ? `${name} hat übernommen` : `Für ${name} vorgesehen`;
}
