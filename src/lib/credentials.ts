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

/**
 * Build the markdown body of a credentials document from its fields.
 *
 * With nothing but a name and a password, the body would be empty and the
 * API rejects empty content, so the name carries it.
 *
 * @param params.title       Name of the login (e.g. "Netflix").
 * @param params.url         Address of the login page, may be empty.
 * @param params.username    User name / login, may be empty.
 * @param params.description Free text about the login, may be empty.
 */
export function buildCredentialsContent({
  title,
  url,
  username,
  description,
}: {
  title: string;
  url?: string;
  username?: string;
  description?: string;
}): string {
  const fields: string[] = [];
  if (url?.trim()) fields.push(`- **URL:** ${url.trim()}`);
  if (username?.trim()) fields.push(`- **Benutzername:** ${username.trim()}`);

  const body = [fields.join("\n"), description?.trim() ?? ""]
    .filter(Boolean)
    .join("\n\n");
  return body || `Zugangsdaten ${title}`;
}

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
