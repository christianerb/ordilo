import {
  contactInputSchema,
  type ContactInput,
} from "@ordilo/contact-contract";

import { getSupabase } from "./supabase";

export {
  CONTACT_INPUT_LIMITS,
  buildWhatsAppHref,
  contactInputSchema,
  isPhoneInputValue,
  normalizePhoneForLink,
  whatsappNumber,
  type ContactInput,
} from "@ordilo/contact-contract";

/**
 * Contacts for the native app.
 *
 * Web and native share validation and phone helpers through the contact
 * contract. The native client writes directly to Supabase with the
 * Publishable Key; RLS remains the authority, as in the browser client.
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

export type ContactFieldErrors = Partial<Record<keyof ContactInput, string>>;

/** First validation message per field, for calm inline form feedback. */
export function getContactFieldErrors(
  input: ContactInput,
): ContactFieldErrors {
  const parsed = contactInputSchema.safeParse(input);
  if (parsed.success) return {};

  const errors: ContactFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (
      typeof field === "string" &&
      field in input &&
      !errors[field as keyof ContactInput]
    ) {
      errors[field as keyof ContactInput] = issue.message;
    }
  }
  return errors;
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

export type ContactSection = { title: string; data: Contact[] };

/**
 * Address-book section key (DIN 5007-1 phonebook order): umlauts file
 * under their base vowel, everything non-alphabetic under "#".
 */
export function getContactSectionKey(name: string): string {
  const first = name.trim().charAt(0).toLocaleUpperCase("de");
  if (first === "Ä") return "A";
  if (first === "Ö") return "O";
  if (first === "Ü") return "U";
  return /^[A-Z]$/.test(first) ? first : "#";
}

/** Groups a German-sorted contact list into alphabet sections. */
export function groupContactsIntoSections(
  contacts: Contact[],
): ContactSection[] {
  const sections = new Map<string, Contact[]>();
  for (const contact of sortContactsByName(contacts)) {
    const key = getContactSectionKey(contact.name);
    const bucket = sections.get(key);
    if (bucket) bucket.push(contact);
    else sections.set(key, [contact]);
  }
  return [...sections.entries()]
    .sort(([a], [b]) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b, "de");
    })
    .map(([title, data]) => ({ title, data }));
}

/**
 * Loads a single contact for the deep-linkable detail route. Returns
 * null when the contact does not exist (or RLS hides it); throws on
 * transport errors so the screen can offer a retry.
 */
export async function loadContact(
  contactId: string,
  familyId: string,
): Promise<Contact | null> {
  const { data, error } = await getSupabase()
    .from("contacts")
    .select(contactsSelect)
    .eq("id", contactId)
    .eq("family_id", familyId)
    .maybeSingle();
  if (error) throw error;
  return (data as Contact | null) ?? null;
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
