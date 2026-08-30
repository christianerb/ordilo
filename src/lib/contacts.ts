export {
  CONTACT_INPUT_LIMITS,
  buildWhatsAppHref,
  contactInputSchema,
  isPhoneInputValue,
  normalizePhoneForLink,
  whatsappNumber,
  type ContactInput,
} from "@ordilo/contact-contract";

/** Stable identity for a contact's position within one document extraction. */
export function contactSourceKey(index: number): string {
  return `contact:${index}`;
}
