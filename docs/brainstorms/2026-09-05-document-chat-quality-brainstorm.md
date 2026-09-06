---
date: 2026-09-05
topic: document-chat-quality
status: proposed
base_commit: bc7a025
---

# Dokumentenchat: Diagnose und Zielbild

## Produktversprechen

Eine konkrete Frage zu einer Familienunterlage bekommt schnell eine richtige,
verständliche Antwort mit der passenden Fundstelle. Ordilo übernimmt die Suche
und das Nachlesen. Der Nutzer muss weder Dokumenttitel erraten noch die KI zum
Zitieren auffordern. Ehrliche, konkret erklärte Ungewissheit gehört zur Qualität.

Die folgende Diagnose basiert auf dem lokalen Code, isolierten Gegenproben und
zwei unabhängigen UI-Assessments (Design und Detektor/Testabdeckung). Sie ist keine
Messung der Produktion. Hannahs Originaldokument und die konkrete fehlgeschlagene
Serverausführung wurden nicht eingesehen. Der iPhone-16-Simulator läuft, zeigt
aber den Login; der Tastaturfehler ist noch nicht im authentifizierten Chat
reproduziert. Die installierte Simulator-Version wurde nicht Build 14 zugeordnet.

## Nachgewiesene Probleme

### P0: Quellenreferenz wird mit Richtigkeit verwechselt

`src/lib/schemas/chat.ts:451` akzeptiert einen vollständigen Dokumenttitel oder
vier aufeinanderfolgende Wörter aus einem Auszug. Bei ausschließlich graphbasierten
Quellen wird ohne diesen Vergleich akzeptiert. Diese Prüfung kann nicht feststellen,
ob ein Datum, Betrag oder eine Person durch die Fundstelle gedeckt ist.

Vier temporäre Vitest-Gegenproben haben das aktuelle Verhalten bestätigt:

1. Quelle: „Abo-Bestätigung Deutschlandticket für Hannah“, Auszug:
   „Fahrgast: Hannah. Gültigkeitsende: 31.08.2027.“ Die korrekte Paraphrase
   „Hannahs Ticket gilt bis zum 31. August 2027.“ wird abgelehnt.
2. Derselbe Dokumenttitel mit einem erfundenen Enddatum im Jahr 2099 wird akzeptiert.
3. Ein unbelegtes Datum wird bei ausschließlich graphbasierten Quellen akzeptiert.
4. Beim Zusammenführen desselben Dokuments verdrängt ein weniger hoch bewerteter
   Fakt „Kundennummer: TEST-123“ den Text mit dem Gültigkeitsende.

Alle Daten dieser Gegenproben sind synthetisch. Das Datum ist keine Aussage über
Hannahs tatsächliches Ticket. Die temporären Tests wurden nach Ausführung entfernt,
damit fehlerhaftes Verhalten nicht als gewünschter Vertrag festgeschrieben wird.

### P0: Fundstellen gehen zwischen Suche und Antwort verloren

`src/lib/ai/search.ts:713` fusioniert auf Dokumentebene und behält nur einen
repräsentativen Auszug. Die Auswahl bevorzugt Fakten grundsätzlich gegenüber
Textpassagen (`:690`). `src/lib/ai/tools.ts:1439` gibt dem Antwortmodell davon
höchstens 500 Zeichen, zusätzlich zu Zusammenfassung und Metadaten. Das kann die
gesuchte Stelle abschneiden. Es fehlt ein allgemeines Werkzeug, mit dem der Agent
anschließend gezielt die Seite bzw. die vollständige Unterlage nachlesen kann.

Wiederholte Suchen aktualisieren bereits gesammelte Quellen nicht: Dokument-IDs
werden in `tools.ts:1392` nur einmal aufgenommen. Eine bessere spätere Fundstelle
kann im Tool-Ergebnis stehen, während UI und Abschlussprüfung den alten Auszug haben.
Die sichtbare Hauptquelle wird nach Suchscore gewählt (`packages/chat-contract/src/index.ts:153`),
nicht nach der tatsächlich belegten Antwortaussage.

### P1: Der Ablauf verursacht vermeidbare Wartezeit

Der kritische Pfad enthält Agentenentscheidung, Suchvarianten, Embeddings,
mehrere Datenbanksuchen, optionales Modell-Reranking und Antwortgenerierung.
Suchvarianten haben 1.500 ms Budget, Reranking 1.200 ms; weitere Aufrufe kommen hinzu.
Das sind Codebudgets, keine gemessenen Antwortzeiten.

`src/lib/ai/chat.ts:850` puffert Antworten vollständig, sobald Quellen existieren.
Eine fehlgeschlagene Textprüfung startet einen weiteren vollständigen Modellaufruf
(`:1352`), ohne neue Belege nachzulesen. Es gibt bis zu drei Werkzeugrunden plus
Abschlussrunde. Der eigentliche Chattransport hat keinen durchgängigen expliziten
Abbruch-/Zeitbudget-Vertrag. Native `streamChat` nimmt kein AbortSignal an.

`src/app/api/chat/route.ts:440` hält das abschließende `done` bis nach dem Speichern
zurück. Native Karten und Quellen warten wiederum auf `done`. Fertige Inhalte können
deshalb noch als laufend erscheinen. Insbesondere ignoriert die native Loading-Bedingung
eine bereits eingetroffene Antwortkarte (`apps/mobile/app/suche.tsx:1008`).

### P1: Die native Darstellung arbeitet gegen das Ergebnis

- `apps/mobile/src/components/chat.tsx:145`: Spinner, bewegte Punkte und fünf
  pulsierende Platzhalterzeilen gleichzeitig. Die große Ladefläche springt danach
  auf die Größe der Antwort zusammen.
- `chat.tsx:239`: Antwort wird als einfacher Text dargestellt. Der Server verlangt
  aber Markdown-Fettschrift und Tabellen (`src/lib/ai/chat.ts:443`). Web besitzt einen
  Markdown-Renderer; native kann deshalb Formatierungszeichen sichtbar ausgeben.
- `apps/mobile/app/suche.tsx:915`: Jede Inhaltsgrößenänderung scrollt animiert nach
  unten, auch wenn der Nutzer gerade weiter oben liest oder Quellen ausklappt.
- Antwortblase, Avatar, Karte, Quellen, Vorschlag und Feedback verschachteln sich;
  maximal 82 % Blasenbreite und Innenabstände lassen wenig Raum für die Antwort.
- Senden verschwindet während der Anfrage, es fehlt ein Chat-Abbruchknopf.
  Der Sendeknopf ist nur 40 × 40 pt groß, ohne vergrößerten Touchbereich.

### P1: Tastaturgeometrie ist nicht tatsächlich getestet

Die KeyboardAvoidingView liegt in SafeArea und nativem Modal, nutzt iOS `padding`
und den Standardoffset null (`suche.tsx:904`). Unterschiedliche lokale und
bildschirmbezogene Koordinaten sind ein plausibler Grund für Unterkompensation.
Eine pauschale zusätzliche Headerhöhe wäre kein belastbarer Fix.

Der vorhandene Test `apps/mobile/src/__tests__/motion-screens.test.ts:425` prüft
Quelltextzeichenfolgen, darunter das Fehlen eines Offsets. Er öffnet keine Tastatur
und misst keine sichtbare Eingabe. Die Maestro-Flows decken bislang Login/App-Gates ab.

### P0 für die Freigabe: Qualitätstests messen nicht das Produktversprechen

Der feste Qualitätstest bewertet vorformulierte Referenzantworten.
`scripts/live-chat-eval.ts` übergibt synthetische Belege direkt an einen separaten
Modellaufruf. Retrieval, produktiver Prompt, Werkzeugrunden, Quellenprüfung,
Transport und native Darstellung werden damit nicht getestet. Außerdem wird der
erwartete Antwortzustand an den Scorer übergeben, statt ein tatsächlicher Zustand
aus der Anwendung geprüft.

Ausgeführte Prüfungen: 237 Backendtests einschließlich vier temporärer Gegenproben
bestanden; zusätzlich 52 native Tests bestanden. Das zeigt gerade, dass grüne
Tests diese Produktfehler derzeit nicht ausschließen.

Der deterministische TSX-Detektor meldete nur einen Web-Zitatblock mit linker
Rahmenlinie (semantisch voraussichtlich Fehlalarm) und eine 11-px-Schrift außerhalb
der Typografieskala. Er prüft native Geometrie nicht; null native Treffer sind
kein Qualitätsnachweis. Auf einen scheinpräzisen visuellen Gesamtscore wird ohne
authentifizierte native Darstellung verzichtet.

## Empfohlene Architektur

Die bestehende Familienisolation, Dokumentverarbeitung, hybride Suche und gemeinsame
Web-/Mobile-Datenbasis bleiben die Grundlage. Der Antwortweg wird gezielt ersetzt.

1. **Frage und Bezug verstehen:** Person, Unterlage, erfragtes Feld und Gesprächsbezug
   auflösen. Persönliche Ticketgültigkeit aus privaten Unterlagen beantworten;
   öffentliche Tarifregeln nur recherchieren, wenn die Frage sie tatsächlich braucht.
2. **Schnell finden:** Titel, Person und bestätigte Fakten zusammen mit Textsuche
   nutzen. Teure Erweiterung und Reranking gezielt bei unzureichenden Treffern.
   Ein Fakt darf den Inhalt nicht allein wegen seines Datentyps verdrängen.
3. **Gezielt lesen:** Mehrere relevante Passagen samt Seite, Dokumentversion und
   Nachbartext behalten. Fehlende Informationen über ein familiengebundenes
   Nachlesewerkzeug ergänzen. OCR-Probleme von fehlenden Informationen unterscheiden.
4. **Aussage mit Beleg erzeugen:** Antwort intern an konkrete Beleg-IDs binden.
   Ein vorhandener Titel reicht nicht. Person und normalisierte Datums-/Betragswerte
   mit dem Beleg vergleichen; berechnete Werte brauchen nachvollziehbare Ableitung.
   Bei komplexen Aussagen zusätzlich semantisch prüfen; Beleg-IDs allein beweisen
   ebenfalls keine Richtigkeit.
5. **Kurz antworten:** Erste Zeile beantwortet die Frage. Darunter genau die tragende
   Quelle mit Originalstelle und Seitenverweis. Weitere Belege nur bei Bedarf.
6. **Gezielt reparieren:** Bei fehlendem Beleg nachlesen statt denselben Text erneut
   formulieren. Bei tatsächlich fehlendem Enddatum die konkrete Lücke nennen.
   Ticketgültigkeit, Abolaufzeit und Kündigungsfrist nicht gleichsetzen. Bei Konflikten
   beide belegten Angaben zeigen; jüngerer Upload bedeutet nicht automatisch gültiger.

Unsicherheitswörter pauschal zu verbieten ist kein Qualitätsmechanismus. Der Prompt
enthält sogar „Verwende VERBOTENE Formulierungen“, während die Nachprüfung dieselben
Wörter blockiert. Gewollt ist klare, begründete Sicherheit bzw. Unsicherheit.

## Zielerlebnis auf dem iPhone

Ruhiger kompakter Kopf, Nutzerfrage rechts, lesbare Antwort ohne zusätzliche große
Kartenhülle. Datum/Betrag typografisch hervorheben. Ein kurzer Status erscheint beim
Warten und verschwindet mit dem Ergebnis. Keine simulierten Fortschritte und kein
zusätzlicher Spinner unter einer fertigen Antwort.

Eine Quelle öffnet direkt die belegende Seite. Kopieren und Feedback bleiben
unaufdringlich. Eine Folgeaktion erscheint nur bei echtem Nutzen. Der Composer bleibt
über der Tastatur vollständig sichtbar; Senden/Stoppen belegen dieselbe Position.
Mehrzeilige Eingabe, Textvergrößerung und interaktives Schließen funktionieren.
Automatisches Scrollen folgt der Antwort nur, solange der Leser unten bleibt.

## Abnahme statt Bauchgefühl

Vorgeschlagene Ziele, noch nicht gemessene Eigenschaften:

- Ein Startkorpus mit 50–100 redigierten bzw. synthetischen realistischen Fragen und
  vollständigen Dokumenten: Personenverwechslung, mehrere Tickets, Verlängerungen,
  verschiedene Datumsarten, Tippfehler, schlechte OCR, fehlende Angaben, Widersprüche,
  Folgefragen und neue Dokumentversionen. Separater unbekannter Prüfsatz gegen
  Überanpassung; kritische Fälle mehrfach ausführen.
- Kritische Datums-/Personenfälle vollständig richtig, keine unbelegten konkreten
  Behauptungen im Freigabesatz. Zusätzlich Gesamt-Antwortrate und korrekte Ablehnungen
  messen, damit pauschales Nichtantworten die Sicherheit nicht künstlich verbessert.
- Mindestens 95 % vollständig richtige Antworten auf beantwortbare Fragen im
  anfänglichen Prüfsatz; Fundstellenabruf und Quellenzuordnung separat auswerten.
  Stichprobenerfolg ist keine Garantie für alle späteren Fragen.
- Einfache Dokumentfrage: sichtbare Interaktionsreaktion unter 100 ms als UI-Ziel,
  erste hilfreiche Antwort p50 unter 3 s und p95 unter 8 s als Startbudget. Bei
  längeren Fällen begrenztes Gesamtbudget, verständlicher Zustand und funktionierender
  Abbruch. Zeiten vom realen Client messen, einschließlich Mobilfunk und kaltem Server.
- Echte native Tests auf kleinem und großem iPhone: Tastatur an/aus, mehrzeiliger
  Input, große Schrift, Modalbewegung, Wiederöffnen und Streaming während des Lesens.
- Produktionsmetriken um Retrievaldauer, Belegqualität, Prüfungsfehler, Nachleserunden,
  erste hilfreiche Antwort und Abschluss ergänzen. Keine privaten Inhalte loggen.

Diese Trennung von Retrieval- und Antwortbewertung entspricht auch den
[OpenAI-Evaluationsleitlinien](https://developers.openai.com/api/docs/guides/evaluation-best-practices).
Die Bedeutung des Tastaturoffsets beschreibt die
[React-Native-Dokumentation](https://reactnative.dev/docs/keyboardavoidingview).

## Reihenfolge und Alternativen

Empfehlung: zuerst den Hannah-Fall durch die echte Kette nachvollziehen und als
Regression erfassen; dann Belegerhalt/Nachlesen/Antwortprüfung umbauen. Anschließend
Transportzustände, Abbruch und Latenz vereinfachen sowie die native Chatoberfläche
und Tastaturgeometrie korrigieren. Abschließend mit dem gesamten Prüfsatz freigeben.

Nur Prompt und Optik anzupassen wäre klein, ließe aber nachgewiesene Informationsverluste
stehen. Ein vollständiger Plattformwechsel wäre groß und hätte ohne denselben Prüfsatz
keinen Qualitätsnachweis. Ein gezielter Umbau des Antwortwegs hat die beste begründete
Chance, die Ursachen zu beheben und vorhandene Infrastruktur weiterzuverwenden.

Die gewünschte Priorität ist bereits klar: richtige Antworten, verlässliche Bedienung,
Geschwindigkeit und ruhige Darstellung. Zusätzliche allgemeine Prioritätsfragen sind
deshalb unnötig. Offen für die Umsetzung sind der konkrete Originalbeleg samt
Fehlerausführung und ein authentifizierter nativer Prüfzugang.
