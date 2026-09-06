const topic = /ticket|bahnding|fahrkarte|klassenfahrt|elternabend|schulfest|rechnung|strom|vertrag|versicherung|einladung|kündig|\babo\b|befund|nachweis|beitrag|unterlag|dokument|schulbrief|reparatur|selbstbehalt|selbstbeteiligung|schule|fest|buffet|mitbringen|eingepackt|sporttag|bibliothek|jahreskarte|abholschein|abholen|fahrrad/iu;

function excluded(query: string): boolean {
  return /^(?:bitte\s+)?(?:leg|lege|erstell|erstelle|lösch|lösche|speicher|speichere|schreib|schreibe|markier|markiere|füg|füge)\b/iu.test(query.trim())
    || /^(?:was ist|was bedeutet|wie funktioniert|erklär|erkläre)\b/iu.test(query.trim());
}

/** Ellipsis or anaphora, not every question word: "Wann ist Ostern?" starts a new topic. */
function followsDocument(query: string): boolean {
  const text = query.trim();
  if (excluded(text)) return false;
  return /\b(?:es|sie|dort|da|dafür|dazu|davon|deren|dessen)\b/iu.test(text)
    || /\b(?:das|dies(?:e[rsnm]?)?)(?=\s*(?:[?!.]|$)|\s+(?:noch|dann|auch|jetzt|genau|insgesamt|ab|von|für)\b)/iu.test(text)
    || /^(?:und\s+)?(?:von|für|bei)\s+[\p{L}-]+\s*\?*$/iu.test(text)
    || /^(?:und\s+)?(?:wann|wo|wie lange|wie viel|wieviel|wie teuer|bis wann)\s*\?*$/iu.test(text)
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
