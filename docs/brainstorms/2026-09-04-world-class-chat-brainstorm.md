---
date: 2026-09-04
topic: world-class-chat
---

# Ordilo als erstklassiger Familienassistent

## Was wir bauen

Ordilo wird ein freier Such-Agent für das Familienleben. Er entscheidet selbst,
ob eine Frage private Familieninformationen, stabiles Allgemeinwissen, aktuelle
Web-Quellen oder eine Kombination davon braucht. Die Antwort steht immer vor
den Quellen und führt, wenn sinnvoll, zu genau einer passenden nächsten Aktion.

Der Agent soll sich magisch anfühlen, aber nicht unkontrolliert handeln. Er darf
seine Suchstrategie frei wählen. Harte Grenzen schützen vor erfundenen Fakten,
endlosen Suchläufen, Datenabfluss und unbestätigten Änderungen.

## Warum dieser Ansatz

Eine feste Such-Pipeline wäre leichter vorherzusagen, würde aber viele
Familienfragen künstlich in denselben Ablauf zwingen. Reine UX-Politur würde die
eigentliche Antwortqualität nicht lösen. Der freie Agent kann Unterlagen,
Familienstruktur, Aufgaben und aktuelle öffentliche Informationen passend zur
Frage verbinden. Deterministische Schutzregeln sichern nur die Grenzen ab; sie
schreiben dem Agenten nicht vor, wie er suchen muss.

## Produktentscheidungen

- **Qualität und Geschwindigkeit:** ausgewogen. Starke Fundstellen werden sofort
  beantwortet. Schwache oder widersprüchliche Belege dürfen einen gezielten
  zusätzlichen Such- oder Prüfschritt auslösen.
- **Unsicherheit:** Ordilo nennt zuerst das Gesicherte, benennt die konkrete
  Lücke und stellt höchstens eine gezielte Rückfrage.
- **Wissensräume:** Familienwissen, Allgemeinwissen und aktuelle Web-Recherche
  gehören zum verbindlichen Produktumfang.
- **Web-Datenschutz:** Web-Suchen laufen automatisch, aber ausschließlich mit
  einer serverseitig neu gebauten und streng anonymisierten Suchanfrage. Private
  Namen, IDs, Gesprächsverläufe, Dokumenttexte sowie Gesundheits- und
  Finanzdaten dürfen nie an die Web-Suche gehen.
- **Fortschritt:** Die Oberfläche zeigt kurze, verständliche und wahrheitsgemäße
  Schritte. Technische Tool-Namen bleiben unsichtbar.
- **Quellen:** Unter der Antwort steht zunächst nur die beste Quelle kompakt.
  Weitere Quellen sind aufklappbar. Private und öffentliche Quellen bleiben
  unterscheidbar.
- **Gesprächskontext:** Gefundene Fakten und Quellen bleiben erhalten, bis der
  Nutzer „Neue Unterhaltung“ wählt.
- **Einstieg:** Der leere Chat zeigt drei persönliche, antippbare Fragen aus
  tatsächlich vorhandenen Familiendaten. Bei zu wenig Daten erscheinen
  hilfreiche allgemeine Themen.
- **Reparatur:** Nach Daumen runter wählt der Nutzer „falsche Antwort“,
  „falsches Dokument“ oder „unvollständig“. „Besser antworten“ startet eine
  echte neue Suche mit diesem Hinweis, keine bloße Umformulierung.
- **Nächster Schritt:** Ordilo darf nach einer Antwort genau eine passende
  Aktion anbieten. Schreibende Aktionen bleiben bis zur Aktionskarte und
  ausdrücklichen Bestätigung unverändert.

## Antwortzustände

1. **Beantwortet:** direkte Antwort im ersten Satz, danach knappe Einordnung.
2. **Teilweise beantwortet:** Gesichertes zuerst, dann klar benannte Lücke und
   eine gezielte Rückfrage oder nächste Möglichkeit.
3. **Widersprüchlich:** abweichende Angaben verständlich gegenüberstellen und
   sagen, welche Klärung fehlt.
4. **Nicht gefunden:** nennen, wo gesucht wurde, und eine sinnvolle nächste
   Möglichkeit anbieten. Keine unpassenden Dokumentkarten als Ersatz.
5. **Unterbrochen oder fehlgeschlagen:** erhaltene Teilantwort nicht als fertige
   Antwort darstellen; ein klarer Wiederholungsweg bleibt direkt verfügbar.

Web und iOS verwenden dieselben fachlichen Zustände und denselben
Stream-Vertrag. Die visuelle Umsetzung darf plattformspezifisch sein.

## Messbare Abnahmekriterien

### Qualität

- Mindestens 95 Prozent richtige direkte Antworten, wenn ein eindeutiger Fakt
  in einer Unterlage des festen Eval-Satzes steht.
- Keine unbelegte konkrete Tatsachenbehauptung im festen Eval-Satz.
- Jeder erste Satz beantwortet die Frage oder benennt klar die fehlende
  Information.
- Mindestens 90 Prozent richtige Behandlung von Mehrdeutigkeit, Widerspruch und
  Teilwissen.
- Mindestens 90 Prozent korrekte Nachfragen ohne unnötige neue Suche, wenn die
  nötige Information bereits im Gespräch steht.
- Eine Dokumentkarte ohne die erfragte Information ist immer ein Fehler.

### Suche, Quellen und Datenschutz

- Normalerweise höchstens drei Werkzeug-Runden. Danach liefert Ordilo einen
  ehrlichen Zustand statt weiterzulaufen.
- Keine privaten Informationen in automatisierten Web-Suchanfragen.
- Jede aktuelle Web-Aussage hat eine öffentliche Quelle.
- Jede private Tatsachenbehauptung hat eine gefundene private Quelle.
- Zunächst höchstens eine kompakte Quelle unter der Antwort.

### Geschwindigkeit und Robustheit

- Erster verständlicher Status in weniger als 500 Millisekunden.
- Reine Familienfrage: Zielwert höchstens 5 Sekunden Median und 12 Sekunden p95.
- Web- oder Mehrfachsuche: Zielwert höchstens 10 Sekunden Median und
  20 Sekunden p95.
- Abbruch reagiert sofort und hinterlässt keine leere oder irreführend fertige
  Antwort.
- Jede negative Bewertung kann eine begründete neue Suche auslösen.
- Web und iOS interpretieren dieselben Stream-Ereignisse und Antwortzustände.
- Telemetrie misst Qualität, Werkzeugnutzung und Laufzeit ohne Fragen oder
  Dokumentinhalte zu speichern.

## Offene Fragen für die Planung

- Welcher Web-Suchdienst erfüllt Quellenqualität, Datenschutz und Kostenrahmen?
- Welche Informationen werden als kompaktes Gesprächsgedächtnis gespeichert,
  ohne sensible Inhalte unnötig zu vervielfältigen?
- Wie werden persönliche Einstiegsfragen deterministisch und datensparsam
  erzeugt?

## Nächste Schritte

Einen konkreten Umsetzungsplan für Agent, Web-Suche, Datenschutzgrenze,
Stream-Vertrag, Web/iOS-Erlebnis, Reparaturfluss, Telemetrie und Eval-Suite
erstellen.
