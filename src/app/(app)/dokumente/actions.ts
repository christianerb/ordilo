"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  type ActionResult,
  FRIENDLY_ERROR,
  getUserFamily,
} from "@/lib/actions/result";
import { contactInputSchema, type ContactInput } from "@/lib/contacts";
import type { Database } from "@/types/database";

export type ContactRow = Database["public"]["Tables"]["contacts"]["Row"];

export async function createContact(
  input: ContactInput,
): Promise<ActionResult<ContactRow>> {
  const parsed = contactInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? FRIENDLY_ERROR };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: FRIENDLY_ERROR };

  const { data: family, error } = await getUserFamily(supabase);
  if (error || !family) return { success: false, error: FRIENDLY_ERROR };

  const contact = parsed.data;
  const { data, error: insertError } = await supabase
    .from("contacts")
    .insert({
      family_id: family.id,
      name: contact.name,
      organization: contact.organization || null,
      role: contact.role || null,
      phone: contact.phone || null,
      email: contact.email.toLowerCase() || null,
      created_by: user.id,
      status: "confirmed",
    })
    .select("*")
    .single();

  if (insertError || !data) return { success: false, error: FRIENDLY_ERROR };
  revalidatePath("/dokumente");
  return { success: true, data };
}

export async function updateContact(
  contactId: string,
  input: ContactInput,
): Promise<ActionResult<ContactRow>> {
  const parsed = contactInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? FRIENDLY_ERROR };
  }

  const supabase = await createClient();
  const { data: family, error } = await getUserFamily(supabase);
  if (error || !family) return { success: false, error: FRIENDLY_ERROR };

  const contact = parsed.data;
  const { data, error: updateError } = await supabase
    .from("contacts")
    .update({
      name: contact.name,
      organization: contact.organization || null,
      role: contact.role || null,
      phone: contact.phone || null,
      email: contact.email.toLowerCase() || null,
      status: "confirmed",
      user_edited_at: new Date().toISOString(),
    })
    .eq("id", contactId)
    .eq("family_id", family.id)
    .select("*")
    .single();

  if (updateError || !data) return { success: false, error: FRIENDLY_ERROR };
  revalidatePath("/dokumente");
  return { success: true, data };
}

export async function deleteContact(
  contactId: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { data: family, error } = await getUserFamily(supabase);
  if (error || !family) return { success: false, error: FRIENDLY_ERROR };

  const { data, error: updateError } = await supabase
    .from("contacts")
    .update({
      source_key: null,
      status: "dismissed",
      user_edited_at: new Date().toISOString(),
    })
    .eq("id", contactId)
    .eq("family_id", family.id)
    .select("id")
    .maybeSingle();

  if (updateError || !data) return { success: false, error: FRIENDLY_ERROR };
  revalidatePath("/dokumente");
  return { success: true, data };
}
