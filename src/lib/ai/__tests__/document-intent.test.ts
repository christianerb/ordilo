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
  it.each(['Wann ist Ostern?', 'Wie wird morgen das Wetter?', 'Welche Filme laufen heute?'])('does not treat a new question as a document follow-up: %s', question => {
    expect(documentPrefetchQuery(question, [{role:'user',content:'Wann läuft Hannahs Ticket ab?'}])).toBeNull();
  });
  it.each(['Lass uns über Urlaub sprechen.', 'Was ist eine Versicherung?', 'Lösche das Ticket', 'Hallo'])('stops the chain at an intervening topic: %s', interruption => {
    const history = [{role:'user',content:'Wann läuft Hannahs Ticket ab?'},{role:'user',content:interruption}];
    expect(documentPrefetchQuery('Und wann?',history)).toBeNull();
    expect(documentPrefetchQuery('Und von Emma?',history)).toBeNull();
  });
  it('uses the latest explicit document topic after a topic change', () => {
    expect(documentPrefetchQuery('Wann muss sie da sein?', [{role:'user',content:'Wann läuft Hannahs Ticket ab?'},{role:'user',content:'Wie wird das Wetter?'},{role:'user',content:'Wann fährt Emmas Klassenfahrt los?'}])).toContain('Emmas Klassenfahrt');
  });

});
