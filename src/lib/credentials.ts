/**
 * Shape of a "Zugangsdaten" document.
 *
 * A credentials document is an ordinary note whose body follows one fixed
 * layout, so everything downstream — search, embeddings, the detail view —
 * treats it like any other document. The two ways of creating one (the
 * note sheet and the chat's `create_note` tool) share this module so they
 * cannot drift apart.
 *
 * The password is deliberately NOT part of the body. It lives encrypted in
 * `documents.secret` and is only ever decrypted by the reveal endpoint, on
 * explicit user request.
 */

export { buildCredentialsContent } from "@ordilo/document-contract";

const FIELD_LINE = /^-\s+\*\*(URL|Benutzername):\*\*\s*(.+)$/i;

/**
 * Remove the login fields from a credentials body, leaving the free-text
 * description.
 *
 * URL and user name identify a login and, in the common case of an
 * e-mail address, a person. They belong in the document — but not in
 * everything the document feeds: the LLM analysis and the embeddings both
 * travel to OpenAI and end up in the summary, the tags and the vector
 * index. Those paths get the description only; the fields themselves stay
 * in `documents.ocr_text` and reach the UI on server-side paths.
 *
 * The trade-off is deliberate: a login is no longer findable BY its user
 * name — it is found by its name, description and type.
 */
export function stripCredentialFields(content: string): string {
  return content
    .split("\n")
    .filter((line) => !FIELD_LINE.test(line.trim()))
    .join("\n")
    .trim();
}

/** URL and user name read back out of a credentials body. */
export interface ParsedCredentials {
  url: string | null;
  username: string | null;
}

/**
 * Read URL and user name back out of a credentials body.
 *
 * The inverse of {@link buildCredentialsContent}, so the detail view can
 * show the two values as a link and a copyable row instead of leaving
 * them buried in markdown. Anything that does not match the layout — a
 * body written before this format existed, or one edited by hand — simply
 * yields nulls; the caller then shows nothing rather than guessing.
 */
export function parseCredentialsContent(content: string): ParsedCredentials {
  const parsed: ParsedCredentials = { url: null, username: null };

  for (const line of content.split("\n")) {
    const match = FIELD_LINE.exec(line.trim());
    if (!match) continue;
    const value = match[2].trim();
    if (!value) continue;
    if (match[1].toLowerCase() === "url") parsed.url ??= value;
    else parsed.username ??= value;
  }

  return parsed;
}
