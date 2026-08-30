import { z } from "zod";

export const CONTACT_INPUT_LIMITS = {
  email: 254,
  name: 120,
  organization: 160,
  phone: 60,
  role: 120,
} as const;

const contactPhonePattern = /^\+?[\d\s()./-]*$/;

/** Whether the value only contains characters a telephone number can use. */
export function isPhoneInputValue(value: string): boolean {
  return contactPhonePattern.test(value);
}

export const contactInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Bitte gib einen Namen ein.")
      .max(CONTACT_INPUT_LIMITS.name, "Der Name ist zu lang."),
    organization: z
      .string()
      .trim()
      .max(
        CONTACT_INPUT_LIMITS.organization,
        "Die Organisation ist zu lang.",
      )
      .optional()
      .default(""),
    role: z
      .string()
      .trim()
      .max(CONTACT_INPUT_LIMITS.role, "Die Rolle ist zu lang.")
      .optional()
      .default(""),
    phone: z
      .string()
      .trim()
      .max(CONTACT_INPUT_LIMITS.phone, "Die Telefonnummer ist zu lang.")
      .refine((value) => {
        if (!value) return true;
        const digitCount = value.replace(/\D/g, "").length;
        return (
          isPhoneInputValue(value) &&
          digitCount >= 5 &&
          digitCount <= 15
        );
      }, "Bitte prüfe die Telefonnummer.")
      .optional()
      .default(""),
    email: z
      .string()
      .trim()
      .max(CONTACT_INPUT_LIMITS.email, "Die E-Mail-Adresse ist zu lang.")
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

export function buildWhatsAppHref(
  phone: string,
  message = "",
): string | null {
  const number = whatsappNumber(phone);
  if (!number) return null;
  const query = message.trim()
    ? `?text=${encodeURIComponent(message.trim())}`
    : "";
  return `https://wa.me/${number}${query}`;
}
