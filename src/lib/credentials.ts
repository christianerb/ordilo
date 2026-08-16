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
