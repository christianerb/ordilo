const INBOUND_LOCAL_PART_PREFIX = "dokumente+";

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
  if (!domain || !localPart.startsWith(INBOUND_LOCAL_PART_PREFIX)) return null;
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
    if (!match || match[2] !== domain || !match[1].startsWith(INBOUND_LOCAL_PART_PREFIX)) {
      continue;
    }
    aliases.add(match[1]);
  }
  return [...aliases];
}
