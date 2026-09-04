/**
 * PII redaction for chat document excerpts.
 *
 * The pattern-based redaction itself lives in `@ordilo/chat-contract` so
 * the server, the Web client and the iOS app mask the same identifiers
 * (IBANs, German tax IDs, health insurance numbers) whenever an excerpt
 * crosses into a model turn. It is intentionally conservative: it masks
 * only well-structured identifiers, not free-text medical or financial
 * descriptions. The system prompt additionally instructs the model not to
 * reproduce sensitive data verbatim (rule 11/15).
 */

export { redactPII } from "@ordilo/chat-contract";

// ---------------------------------------------------------------------------
// Passwords in chat messages
// ---------------------------------------------------------------------------

/** The words people put in front of a password when they type one. */
const SECRET_WORD = "(?:passwort|passwoerter|passwörter|kennwort|pin|zugangscode|pw)";

/**
 * "Passwort ist X", "Kennwort: X", "PIN = X" — an explicit hand-over.
 * The marker is what makes this unambiguous, so the value is masked
 * whatever it looks like.
 */
const LABELLED_SECRET = new RegExp(
  `\\b(${SECRET_WORD})\\b(\\s*(?:ist|lautet|=|:)\\s*)["'„»]?([^\\s"'“«]{2,})["'“»]?`,
  "gi",
);

/**
 * "Passwort hunter2" — no marker, so the following word is only masked
 * when it looks like a secret rather than like prose: it carries a digit
 * or a special character. That keeps "Was ist das Passwort für Netflix?"
 * intact while catching the common way of dictating one.
 */
const BARE_SECRET = new RegExp(
  `\\b(${SECRET_WORD})\\b(\\s+)["'„»]?((?=\\S*[\\d!@#$%^&*_+\\-=<>?])[^\\s"'“«]{3,})["'“»]?`,
  "gi",
);

/**
 * Mask a password a family member typed into the chat.
 *
 * The chat is the one place where a password can reach the database in
 * plain text: `documents.secret` stores only an AES envelope, but a chat
 * message is persisted verbatim, and "leg mir die Zugangsdaten an, das
 * Passwort ist X" is a natural thing to write. This runs before the
 * message is saved, so the stored history — and every later turn that
 * reads it back — carries a placeholder instead.
 *
 * It is a pattern match, not a guarantee: a password typed on its own
 * line with no word in front of it is indistinguishable from any other
 * text. The chat therefore also never accepts a password as a tool
 * argument; this only limits what a slip leaves behind.
 *
 * @param text - The raw message text.
 * @returns The text with password values replaced by `[Passwort]`.
 */
export function redactSecretsForStorage(text: string): string {
  return text
    .replace(LABELLED_SECRET, (_match, word: string, marker: string) => {
      // Keep the wording and the marker so the sentence still reads:
      // "Passwort ist [Passwort]".
      return `${word}${marker}[Passwort]`;
    })
    .replace(BARE_SECRET, (_match, word: string, space: string) => {
      return `${word}${space}[Passwort]`;
    });
}
