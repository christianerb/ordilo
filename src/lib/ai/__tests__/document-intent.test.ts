import { describe, expect, it } from 'vitest';
import { documentInventoryRequest, documentListQuestion, documentPrefetchQuery, documentTopicListRequest } from '../document-intent';
describe('document prefetch intent', () => {
  it.each(['Wann läuft Hannahs Bahnding ab?', 'Was sollen wir fürs Buffet einpacken?', 'Was braucht Emma für den Sporttag?', 'Wer hat die Academy-Mitgliedschaft?', 'Was kostet die Mitgliedschaft?', 'Bitte suche meine Master Zeignisse vom Master an der FOM', 'Suche mein Masterzeugnis', 'Wo ist mein Bachelorzeugnis?', 'Zeugnisse meine ist'])('retrieves a casually worded question: %s', question => {
    expect(documentPrefetchQuery(question, [])).toBe(question);
  });
  it.each(['Welche Krankenkasse hat Emma?', 'Wann läuft der Kita-Gutschein aus?', 'Wie ist meine Steuer-ID?', 'Was steht in der Einkommenserklärung von Hanna?', 'Was stand im Bescheid vom Bezirksamt?'])('retrieves a question about a family paper: %s', question => {
    expect(documentPrefetchQuery(question, [])).toBe(question);
  });
  it.each(['Wie ist die Telefonnummer vom Kinderarzt?', 'Wie lautet das Passwort für Netflix?', 'Welche Fristen laufen bald ab?', 'Was muss ich diese Woche erledigen?'])('leaves contact, credential and task questions to their tools: %s', question => {
    expect(documentPrefetchQuery(question, [])).toBeNull();
  });
  it.each(['Welche Termine stehen diese Woche an?', 'Was steht morgen im Kalender?', 'Wann ist mein Zahnarzttermin?', 'Was ist das Datum meines Termins?'])('leaves calendar-only requests to the calendar: %s', question => {
    expect(documentPrefetchQuery(question, [])).toBeNull();
  });
  it('still retrieves explicitly requested document evidence about a date', () => {
    const question = 'Welchen Termin nennt die Einladung für Emma?';
    expect(documentPrefetchQuery(question, [])).toBe(question);
  });
  it('keeps a calendar-word follow-up anchored to an invitation', () => {
    expect(documentPrefetchQuery('Und wann ist der Termin?', [{role:'user',content:'Was steht in Emmas Einladung?'}])).toContain('Emmas Einladung');
  });
  it('does not carry a document topic across a standalone agenda request', () => {
    expect(documentPrefetchQuery('Und wann?', [{role:'user',content:'Wann läuft Hannahs Ticket ab?'},{role:'user',content:'Welche Termine stehen diese Woche an?'}])).toBeNull();
  });
  it('carries the subject into a follow-up about another child', () => {
    expect(documentPrefetchQuery('Und von Emma?', [{role:'user',content:'Wann läuft Hannahs Ticket ab?'}])).toContain('Aktuelle Folgefrage: Und von Emma?');
  });
  it('prefetches for a deictic "und wann …" continuation of the last turn', () => {
    expect(documentPrefetchQuery('Und wann fährt der Zug dann ab?', [{role:'user',content:'Wann muss Emma für die Klassenfahrt am Treffpunkt sein?'}])).toContain('Klassenfahrt');
  });
  it('prefetches for a bare "haben wir die …" about the last turn\'s thing', () => {
    expect(documentPrefetchQuery('Haben wir die schon bezahlt?', [{role:'user',content:'Was hat Emmas Fahrradreparatur gekostet?'}])).toContain('Fahrradreparatur');
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

describe('metadata document inventories', () => {
  it.each<[string, string | null]>([
    ['Zeig mir alle Rechnungen', 'invoice'],
    ['Bitte liste unsere Verträge', 'contract'],
    ['Zeige alle Unterlagen', null],
  ])('recognizes a bare inventory: %s', (question, documentType) => {
    expect(documentInventoryRequest(question)).toEqual({documentType});
  });
  it.each([
    'Bitte suche meine Master Zeignisse vom Master an der FOM',
    'Zeig mir alle Rechnungen und ihre Fristen',
    'Zeig mir alle Rechnungen von Emma',
  ])('leaves scoped searches and content questions with the agent: %s', question => {
    expect(documentInventoryRequest(question)).toBeNull();
  });
});

describe('document list questions', () => {
  it.each(['Welche Dokumente habe ich vom Kindergarten?', 'Welche Unterlagen gibt es zu Emma?', 'Zeig alle Rechnungen von Stadtwerke', 'Was haben wir alles zur Kita?'])('recognises %s', question => {
    expect(documentListQuestion(question)).toBe(true);
  });
  it.each(['Welche Krankenkasse hat Emma?', 'Was steht in der Einkommenserklärung von Hanna?', 'Wann läuft der Kita-Gutschein aus?'])('leaves a single-paper question alone: %s', question => {
    expect(documentListQuestion(question)).toBe(false);
  });
});

describe('topic document list requests', () => {
  it.each(['Welche Dokumente habe ich vom Kindergarten?', 'Welche Unterlagen haben wir zur Krankenversicherung?', 'Zeig mir alle Dokumente zur Schule', 'Was haben wir alles zum Auto?', 'Welche Rechnungen gibt es von den Stadtwerken?'])('lists the papers on a topic: %s', question => {
    expect(documentTopicListRequest(question)).toBe(true);
  });
  it.each(['Welche Unterlagen brauche ich für den Kita-Antrag?', 'Welche Dokumente muss ich mitbringen?', 'Welche Unterlagen fehlen noch?', 'Was steht im Kita-Gutschein?', 'Welche Krankenkasse hat Emma?', 'Und welche Unterlagen haben wir dazu?', 'Welche Dokumente gibt es davon?', 'Was haben wir alles zu ihr?'])('leaves needs and content questions to the agent: %s', question => {
    expect(documentTopicListRequest(question)).toBe(false);
  });
});
