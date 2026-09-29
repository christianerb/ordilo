const topic = /ticket|bahnding|fahrkarte|klassenfahrt|elternabend|schulfest|rechnung|strom|vertrag|versicherung|einladung|kündig|\babo\b|mitglied(?:schaft)?|academy|befund|nachweis|beitrag|unterlag|dokument|schulbrief|reparatur|selbstbehalt|selbstbeteiligung|schule|fest|buffet|mitbringen|eingepackt|sporttag|bibliothek|jahreskarte|abholschein|abholen|fahrrad|termin/iu;

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

function excluded(query: string): boolean {
  return isPureActionRequest(query)
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
  if (topic.test(query)) return query;
  if (!followsDocument(query)) return null;
  for (const turn of [...history].reverse()) {
    if (turn.role !== 'user') continue;
    if (excluded(turn.content)) return null;
    if (topic.test(turn.content)) return `${turn.content}\nAktuelle Folgefrage: ${query}`;
    if (!followsDocument(turn.content)) return null;
  }
  return null;
}
