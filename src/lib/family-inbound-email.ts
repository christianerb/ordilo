/**
 * The current form: `post-` plus ten Crockford-style base32 characters
 * (no i/l/o/u). Short enough to read out over the phone, and 50 random bits
 * so the address cannot be guessed into.
 */
const SHORT_LOCAL_PART = /^post-[0-9abcdefghjkmnpqrstvwxyz]{10}$/;

/**
 * The original form. Kept recognized because a family may already have
 * saved that address in their mail client.
 */
const LEGACY_LOCAL_PART = /^dokumente\+[a-f0-9]{32}$/;

/** True when the local part is a well-formed Ordilo family alias. */
export function isInboundLocalPart(localPart: string): boolean {
  return SHORT_LOCAL_PART.test(localPart) || LEGACY_LOCAL_PART.test(localPart);
}

/**
 * Build the private inbound address for a family. The random local part is
 * stored in the database, while the receiving domain remains deployment
 * configuration so local and production addresses cannot be mixed up.
 */
export function familyInboundEmail(
  localPart: string,
  inboundDomain: string | undefined,
): string | null {
  const domain = normalizeInboundDomain(inboundDomain);
  if (!domain || !isInboundLocalPart(localPart)) return null;
  return `${localPart}@${domain}`;
}

/** Normalize a configured mail domain or return null for an invalid value. */
export function normalizeInboundDomain(value: string | undefined): string | null {
  const domain = value?.trim().toLowerCase().replace(/^@/, "");
  if (!domain || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9-]+)+$/.test(domain)) {
    return null;
  }
  return domain;
}

/**
 * Extract family alias local parts from Resend recipient values. The event
 * may include a mailbox in either `to` or `received_for`.
 *
 * Only fully well-formed aliases are returned: the receiving domain is a
 * catch-all, so `hallo@`, `noreply@` and every typo also arrive here and
 * must not turn into a database lookup.
 */
export function inboundAliasCandidates(
  recipients: readonly string[],
  inboundDomain: string | undefined,
): string[] {
  const domain = normalizeInboundDomain(inboundDomain);
  if (!domain) return [];

  const aliases = new Set<string>();
  for (const recipient of recipients) {
    const match = recipient.trim().toLowerCase().match(/<?([^<>\s@]+)@([^<>\s@]+)>?$/);
    if (!match || match[2] !== domain || !isInboundLocalPart(match[1])) {
      continue;
    }
    aliases.add(match[1]);
  }
  return [...aliases];
}
