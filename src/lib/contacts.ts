import { z } from "zod";
import type { ExtractedContact } from "@/lib/schemas/extraction";

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

/** Stable identity used to reconcile one extracted contact across re-analysis. */
export function contactSourceKey(contact: Pick<ExtractedContact, "name" | "phone" | "email">) {
  return [contact.name, contact.phone, contact.email]
    .map((value) => value.toLocaleLowerCase("de").replace(/\s+/g, " ").trim())
    .join("|");
}

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
