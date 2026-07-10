/**
 * PII redaction for chat document excerpts.
 *
 * Masks sensitive patterns (IBANs, German tax IDs, health insurance numbers)
 * in document excerpts before they are sent to the LLM or displayed in
 * source cards. This reduces the risk of sensitive data leaking through
 * chat answers.
 *
 * The redaction is pattern-based (regex) and intentionally conservative:
 * it masks only well-structured identifiers, not free-text medical or
 * financial descriptions. The system prompt additionally instructs the
 * model not to reproduce sensitive data verbatim (rule 11/15).
 */

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

/** IBAN: 2-letter country code + 2 check digits + up to 30 alphanumeric chars. */
const IBAN_REGEX = /\b[A-Z]{2}\d{2}(?:\s?\d{0,4}){5,8}\b/g;

/**
 * German tax ID (Steuer-Identifikationsnummer): 11 digits, often formatted
 * as XX.XXX.XXX.XXX or as a continuous string.
 */
const TAX_ID_REGEX = /\b\d{2}\.?\d{3}\.?\d{3}\.?\d{3}\b/g;

/**
 * German health insurance number (Krankenversichertennummer): 1 letter +
 * 8 digits + 1 check digit (10 chars total), or 12-digit social insurance
 * number (Sozialversicherungsnummer) starting with a letter.
 */
const HEALTH_INSURANCE_REGEX = /\b[A-Z]\d{8}\d?\b/g;

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/**
 * Redact sensitive patterns in a text excerpt, replacing them with
 * bracketed placeholders.
 *
 * @param text - The excerpt text to redact.
 * @returns The redacted text with sensitive patterns masked.
 */
export function redactPII(text: string): string {
  return text
    .replace(IBAN_REGEX, "[IBAN]")
    .replace(TAX_ID_REGEX, "[Steuer-ID]")
    .replace(HEALTH_INSURANCE_REGEX, "[Versicherungsnummer]");
}
