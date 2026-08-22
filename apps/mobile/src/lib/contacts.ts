import { z } from "zod";

import { getSupabase } from "./supabase";

/**
 * Contacts for the native app.
 *
 * Fachliche Referenz ist die Web-App: das Validierungsschema, die
 * Telefon-/WhatsApp-Helper und die deutschen Fehlertexte sind 1:1 aus
 * src/lib/contacts.ts portiert, die Schreiblogik aus
 * src/app/(app)/dokumente/actions.ts. Der native Client schreibt mit dem
 * Publishable Key direkt gegen Supabase — RLS bleibt die Autorität, wie
 * beim Browser-Client der Web-App.
 */

export const FRIENDLY_ERROR =
  "Etwas ist schiefgelaufen. Bitte versuche es erneut.";

export type Contact = {
  id: string;
  family_id: string;
  source_document_id: string | null;
  name: string;
  organization: string | null;
  role: string | null;
  phone: string | null;
  email: string | null;
  status: "suggested" | "confirmed";
  created_at: string;
  updated_at: string;
};

export type ContactActionResult =
  | { success: true; contact: Contact }
  | { success: false; error: string };

export const contactInputSchema = z
  .object({
    name: z.string().trim().min(1, "Bitte gib einen Namen ein.").max(120),
    organization: z.string().trim().max(160).optional().default(""),
    role: z.string().trim().max(120).optional().default(""),
    phone: z
      .string()
      .trim()
      .max(60)
      .refine(
        (value) =>
          !value || normalizePhoneForLink(value).replace(/\D/g, "").length >= 5,
        "Bitte prüfe die Telefonnummer.",
      )
      .optional()
      .default(""),
    email: z
      .string()
      .trim()
      .max(254)
      .refine(
        (value) => !value || z.email().safeParse(value).success,
        "Bitte prüfe die E-Mail-Adresse.",
      )
      .default(""),
  })
  .refine((contact) => Boolean(contact.phone || contact.email), {
    path: ["phone"],
    message: "Telefonnummer oder E-Mail-Adresse fehlt.",
  });

export type ContactInput = z.infer<typeof contactInputSchema>;

/** Keep only digits and an optional leading plus for tel/WhatsApp URLs. */
export function normalizePhoneForLink(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

/** WhatsApp requires an international number without punctuation or plus. */
export function whatsappNumber(phone: string): string | null {
  const normalized = normalizePhoneForLink(phone);
  const digits = normalized.replace(/\D/g, "");
  return normalized.startsWith("+") && digits.length >= 7 ? digits : null;
}

export function buildWhatsAppHref(phone: string, message = ""): string | null {
  const number = whatsappNumber(phone);
  if (!number) return null;
  const query = message.trim() ? `?text=${encodeURIComponent(message.trim())}` : "";
  return `https://wa.me/${number}${query}`;
}

export const contactsSelect =
  "id, family_id, source_document_id, name, organization, role, phone, email, status, created_at, updated_at";

/**
 * Loads the family's contacts. The explicit family predicate narrows the
 * result to the resolved family; RLS remains the authority. Throws on
 * error so the screen can show its friendly German retry state.
 */
export async function loadContacts(familyId: string): Promise<Contact[]> {
  const { data, error } = await getSupabase()
    .from("contacts")
    .select(contactsSelect)
    .eq("family_id", familyId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Contact[];
}

export async function createContact(
  familyId: string,
  input: ContactInput,
): Promise<ContactActionResult> {
  const parsed = contactInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? FRIENDLY_ERROR,
    };
  }

  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: FRIENDLY_ERROR };

  const contact = parsed.data;
  const { data, error } = await supabase
    .from("contacts")
    .insert({
      family_id: familyId,
      name: contact.name,
      organization: contact.organization || null,
      role: contact.role || null,
      phone: contact.phone || null,
      email: contact.email.toLowerCase() || null,
      created_by: user.id,
      status: "confirmed",
    })
    .select(contactsSelect)
    .single();

  if (error || !data) return { success: false, error: FRIENDLY_ERROR };
  return { success: true, contact: data as Contact };
}

export async function updateContact(
  contactId: string,
  familyId: string,
  input: ContactInput,
): Promise<ContactActionResult> {
  const parsed = contactInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? FRIENDLY_ERROR,
    };
  }

  const contact = parsed.data;
  const { data, error } = await getSupabase()
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
    .eq("family_id", familyId)
    .select(contactsSelect)
    .single();

  if (error || !data) return { success: false, error: FRIENDLY_ERROR };
  return { success: true, contact: data as Contact };
}

/** Upserts a saved contact into the local list (create or update). */
export function mergeSavedContact(
  contacts: Contact[],
  saved: Contact,
): Contact[] {
  const exists = contacts.some((contact) => contact.id === saved.id);
  return exists
    ? contacts.map((contact) => (contact.id === saved.id ? saved : contact))
    : [...contacts, saved];
}

export function splitContactsByStatus(contacts: Contact[]): {
  suggested: Contact[];
  confirmed: Contact[];
} {
  return {
    suggested: contacts.filter((contact) => contact.status === "suggested"),
    confirmed: contacts.filter((contact) => contact.status === "confirmed"),
  };
}

export function getContactSearchText(contact: Contact): string {
  return [contact.name, contact.organization, contact.role, contact.phone, contact.email]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("de");
}

/** German search across every visible contact field. */
export function filterContacts(
  contacts: Contact[],
  query: string,
): Contact[] {
  const needle = query.trim().toLocaleLowerCase("de");
  if (!needle) return contacts;
  return contacts.filter((contact) =>
    getContactSearchText(contact).includes(needle),
  );
}

/** Confirmed contacts read like an address book: German name order. */
export function sortContactsByName(contacts: Contact[]): Contact[] {
  return [...contacts].sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/** Secondary line on a row: "Hausarztpraxis Dr. Sommer · Kinderärztin". */
export function getContactSubtitle(contact: Contact): string {
  return [contact.organization, contact.role].filter(Boolean).join(" · ");
}

/** Reach line on a row: phone first, e-mail as fallback. */
export function getContactReachLine(contact: Contact): string {
  return contact.phone || contact.email || "";
}

export function getContactInitial(name: string): string {
  return name.trim().charAt(0).toLocaleUpperCase("de") || "?";
}
