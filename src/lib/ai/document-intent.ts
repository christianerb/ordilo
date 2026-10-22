// Words that only ever point at a family paper. Kept specific on purpose:
// a prefetch commits the turn to a verified document answer, so generic
// words that also open contact, card or task questions ("Nummer",
// "Passwort", "Frist") stay out.
const topic = /krankenkasse|krankenversicherung|versichert|police|gutschein|bescheid|bewilligung|kita\b|kindergarten|steuer|finanzamt|lohnabrechnung|gehaltsabrechnung|einkommen|erklärung|antrag|formular|kontoauszug|\biban\b|versicherungsnummer|kundennummer|vertragsnummer|mitgliedsnummer|aktenzeichen|ausweis|reisepass|führerschein|zulassung|mietvertrag|nebenkosten|garantie|quittung|kassenbon|arztbrief|impfpass|mahnung|\bbrief\b|schreiben\b|steht (?:in|auf|im)\b|ticket|bahnding|fahrkarte|klassenfahrt|elternabend|schulfest|rechnung|strom|vertrag|versicherung|einladung|kündig|\babo\b|mitglied(?:schaft)?|academy|befund|zeugnis|zeignis|zertifikat|abschluss|\bmaster\b|\bbachelor\b|nachweis|beitrag|unterlag|dokument|schulbrief|reparatur|selbstbehalt|selbstbeteiligung|schule|fest|buffet|mitbringen|eingepackt|sporttag|bibliothek|jahreskarte|abholschein|abholen|fahrrad|termin/iu;

// Imperative forms with and without the trailing -e ("leg mir …", "lege mir …").
// The optional trailing \w* keeps inflected commands ("Verschlagworte …",
// "Tagge …", "Archiviere …") inside the pattern after stems like
// "verschlagwort" + \b, which alone only matches the bare stem.
const ACTION_VERBS = /^(?:bitte\s+)?(?:leg|erstell|lösch|speicher|schreib|markier|füg|verschlagwort|tagg|ordne|verschieb|archivier|erinner|richte)\w*\b/iu;

/**
 * A pure mutation ask ("Verschlagworte …", "Erinnere mich …") carries no
 * question the documents could answer — document hits on the way to the
 * action (e.g. resolving a document_id) are instrumental, not evidence for
 * an answer.
 */
export function isPureActionRequest(query: string): boolean {
  return ACTION_VERBS.test(query.trim());
}

/** A calendar lookup alone does not request a document answer. */
function calendarOnly(query: string): boolean {
  return /termin(?:e[ns]?|s)?\b|\b(?:kalender|agenda)\b/iu.test(query)
    && !/dokument|unterlag|einladung|brief|mail|vertrag|rechnung|zeugnis|zeignis|nachweis|befund|bescheinigung|ticket|fahrkarte|abholschein|zettel|schreiben|\bpdf\b/iu.test(query);
}

function excluded(query: string): boolean {
  return isPureActionRequest(query)
    || (calendarOnly(query) && !/^und\s+(?:wann|wo|wie|bis wann)\b/iu.test(query.trim()))
    || /^(?:was ist|was bedeutet|wie funktioniert|erklär|erkläre)\b/iu.test(query.trim());
}

/** Ellipsis or anaphora, not every question word: "Wann ist Ostern?" starts a new topic. */
function followsDocument(query: string): boolean {
  const text = query.trim();
  if (excluded(text)) return false;
  return /\b(?:es|sie|die|den|dort|da|dafür|dazu|davon|deren|dessen)\b/iu.test(text)
    || /\b(?:das|dies(?:e[rsnm]?)?)(?=\s*(?:[?!.]|$)|\s+(?:noch|dann|auch|jetzt|genau|insgesamt|ab|von|für)\b)/iu.test(text)
    || /^(?:und\s+)?(?:von|für|bei)\s+[\p{L}-]+\s*\?*$/iu.test(text)
    || /^(?:und\s+)?(?:wann|wo|wie lange|wie viel|wieviel|wie teuer|bis wann)\s*\?*$/iu.test(text)
    // "Und wann fährt der Zug dann ab?" — the lead-in "und" plus a question
    // word marks a continuation of the last turn, whatever it adds on top.
    || /^und\s+(?:wann|wo|wie lange|wie viel|wieviel|wie teuer|bis wann)\b/iu.test(text)
    // "Haben wir die schon bezahlt?" — a bare definite pronoun object asks
    // about the thing the last turn established.
    || /^(?:und\s+)?(?:haben|habt)\s+wir\s+(?:die|das|den|sie|es)\b/iu.test(text)
    || /^(?:und\s+)?(?:wann|wo|welche zeit|um welche uhrzeit)\b.*\b(?:treffpunkt|treffen|abfahrt|bahnhof)\b/iu.test(text);
}

/** Prefetch only an explicit document question or its uninterrupted follow-up chain. */
export function documentPrefetchQuery(query: string, history: Array<{ role: string; content: string }>): string | null {
  if (excluded(query)) return null;
  if (topic.test(query) && !calendarOnly(query)) return query;
  if (!followsDocument(query)) return null;
  for (const turn of [...history].reverse()) {
    if (turn.role !== 'user') continue;
    if (excluded(turn.content)) return null;
    if (topic.test(turn.content) && !calendarOnly(turn.content)) return `${turn.content}\nAktuelle Folgefrage: ${query}`;
    if (!followsDocument(turn.content)) return null;
  }
  return null;
}

/** Bare inventory requests need confirmed metadata, not OCR passages. */
export function documentInventoryRequest(query: string): { documentType: string | null } | null {
  const match = /^(?:bitte\s+)?(?:zeig(?:e)?(?:\s+mir)?|liste(?:\s+mir)?)\s+(?:alle\s+)?(?:(?:meine|unsere|die)\s+)?(dokumente|unterlagen|papiere|rechnungen|verträge|briefe|arztbriefe|versicherungen|steuerunterlagen|schulunterlagen|zugangsdaten)[.!?]?$/iu.exec(query.trim());
  if (!match) return null;
  const types: Record<string, string> = {
    rechnungen: "invoice", verträge: "contract", briefe: "letter", arztbriefe: "medical",
    versicherungen: "insurance", steuerunterlagen: "tax", schulunterlagen: "school", zugangsdaten: "credentials",
  };
  return { documentType: types[match[1].toLocaleLowerCase("de-DE")] ?? null };
}
