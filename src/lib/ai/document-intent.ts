/** Only prefetch clear document questions; mutations and general conversation stay with the agent. */
export function documentPrefetchQuery(query: string, history: Array<{ role: string; content: string }>): string | null {
  if (/^(?:bitte\s+)?(?:leg|lege|erstell|erstelle|lösch|lösche|speicher|speichere|schreib|schreibe|markier|markiere|füg|füge)\b/iu.test(query.trim())) return null;
  if (/^(?:was ist|was bedeutet|wie funktioniert|erklär|erkläre)\b/iu.test(query.trim())) return null;
  const topic = /ticket|bahnding|fahrkarte|klassenfahrt|elternabend|schulfest|rechnung|strom|vertrag|versicherung|einladung|kündig|\babo\b|befund|nachweis|beitrag|unterlag|dokument|schulbrief|reparatur|selbstbehalt|selbstbeteiligung|schule|fest|buffet|mitbringen|eingepackt|sporttag|bibliothek|jahreskarte|abholschein|abholen|fahrrad/iu;
  if (topic.test(query)) return query;
  // A follow-up keeps its preceding subject, while the latest wording remains last.
  if (/^(und\b|wann\b|wie\b|welche\b|was\b|bis\b)/iu.test(query.trim())) {
    const previous = [...history].reverse().find(item => item.role === 'user' && topic.test(item.content));
    if (previous && topic.test(previous.content)) return `${previous.content}\nAktuelle Folgefrage: ${query}`;
  }
  return null;
}
