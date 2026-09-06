import { describe, expect, it } from 'vitest';
import { documentPrefetchQuery } from '../document-intent';
describe('document prefetch intent', () => {
  it.each(['Wann läuft Hannahs Bahnding ab?', 'Was sollen wir fürs Buffet einpacken?', 'Was braucht Emma für den Sporttag?'])('retrieves a casually worded question: %s', question => {
    expect(documentPrefetchQuery(question, [])).toBe(question);
  });
  it('carries the subject into a follow-up about another child', () => {
    expect(documentPrefetchQuery('Und von Emma?', [{role:'user',content:'Wann läuft Hannahs Ticket ab?'}])).toContain('Aktuelle Folgefrage: Und von Emma?');
  });
  it('retains the document topic across several short follow-ups', () => {
    expect(documentPrefetchQuery('Wann dort sein?', [{role:'user',content:'Wann fährt Emmas Klassenfahrt los?'},{role:'assistant',content:'08:40 Uhr'},{role:'user',content:'Und wo treffen?'}])).toContain('Emmas Klassenfahrt');
  });
  it.each(['Lösche das Dokument', 'Bitte erstelle eine Aufgabe fürs Schulfest', 'Was ist eine Versicherung?', 'Hallo'])('avoids unsolicited retrieval for %s', question => {
    expect(documentPrefetchQuery(question, [])).toBeNull();
  });
});
