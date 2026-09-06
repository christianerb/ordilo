/** A barcode grants travel, not access to an account. Correct only strong travel evidence. */
export function isTravelTicket(text: string): boolean {
  const plain = text.normalize('NFKC').replace(/[*_#]/g, '').toLocaleLowerCase('de-DE');
  if (/\b(?:passwort|kennwort|benutzername|login|anmeldedaten|zugangsdaten|zugangscode|pin|password|username)\b/u.test(plain)) return false;
  const heading = plain.slice(0, 600);
  return /\b(?:deutschlandticket|fahrkarte|fahrschein|bahn-ticket|bahnticket)\b/u.test(heading)
    && /\b(?:gültig|gültigkeit|geltungsdauer)\b/u.test(plain)
    && /\b\d{1,2}\.\d{1,2}\.\d{4}\b/u.test(plain);
}

export function correctTravelDocumentType<T extends string>(type: T, text: string): T | 'other' {
  return type === 'credentials' && isTravelTicket(text) ? 'other' : type;
}
