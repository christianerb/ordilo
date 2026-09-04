---
date: 2026-09-04
topic: world-class-chat
brainstorm: ../brainstorms/2026-09-04-world-class-chat-brainstorm.md
---

# Umsetzungsplan: World-class Chat

## Ziel

Den bestehenden agentischen Chat zu einem freien, quellenbewussten
Familienassistenten ausbauen. Der Agent darf Familienwissen, Allgemeinwissen
und aktuelle Web-Recherche selbstständig verbinden. Server-Grenzen sichern
Datenschutz, Quellen, Laufzeit und bestätigungspflichtige Änderungen.

Die bereits committed Antwort-first- und Retrieval-Verbesserungen auf
`fix/chat-answer-first` bleiben die Grundlage.

## 1. Gemeinsamer Chat-Vertrag

- `ChatSource` additiv um Dokument- und Web-Quellen erweitern.
- Gemeinsame Antwort-Metadaten für Zustand und optionale nächste Aktion
  definieren.
- NDJSON-Ereignisse für Quellen, Status, Vorschlag, Abschluss und Fehler
  zwischen Server, Web und iOS angleichen.
- Alte gespeicherte Dokumentquellen weiterhin lesen können.
- Vertrag und Parser mit Web- und Mobile-Tests absichern.

## 2. Private Web-Recherche

- `search_web` als normales Werkzeug des Haupt-Agenten ergänzen.
- Vor dem Netzwerkzugriff eine reine, testbare Anonymisierung ausführen:
  bekannte Familiennamen, E-Mail, Telefon, Adressen, IDs, Geheimnisse,
  personenbezogene Datumsangaben sowie sensible Gesundheits- und Finanztexte
  entfernen oder verallgemeinern.
- Unsichere oder nach der Bereinigung inhaltsleere Anfragen blockieren.
- Mit der bereinigten Anfrage einen getrennten OpenAI-Responses-Aufruf mit
  `web_search` und `store: false` starten. Diesem Aufruf niemals Verlauf,
  Dokumentauszüge oder Familienkontext geben.
- Ergebnistext und HTTPS-Quellen normalisieren, deduplizieren, begrenzen und
  als öffentliche Quellen an den Haupt-Agenten zurückgeben.
- Aktuelle Aussagen ohne öffentliche Quelle nicht als geprüft ausgeben.

## 3. Freier Agent mit Qualitätsgrenzen

- Prompt auf die drei Wissensräume, freie Werkzeugwahl, direkte Antwort und
  ehrliche Teil-/Konflikt-/No-result-Antworten umstellen.
- Werkzeug-Runden von fünf auf normalerweise höchstens drei begrenzen.
- Vorhandene Hedging-, Quellen- und leere-Antwort-Prüfungen in den Live-Pfad
  einbinden; bei genau einem fehlgeschlagenen Prüfversuch regenerieren, danach
  ehrlich abbrechen.
- Dokument- und Web-Inhalte weiterhin ausschließlich als Daten behandeln.
- Optionales `suggest_next_action`-Werkzeug zulassen. Es liefert genau einen
  sicheren Folge-Prompt, führt aber selbst nichts aus.
- Kontakte, Zugangsdaten und alle schreibenden Aktionen unverändert
  serverseitig verifizieren beziehungsweise bestätigen lassen.

## 4. Gesprächsgedächtnis und Reparatur

- Bei vorhandener Unterhaltung den RLS-geprüften Serververlauf als
  maßgebliche Quelle verwenden, statt Client-Verlauf vorzuziehen.
- Gespeicherte Antwort, Kartenfelder und kompakte Quellen-Fakten in den
  Agentenkontext aufnehmen. Keine bloße Titelliste.
- Den bestehenden Feedback-Aufruf um eine kontrollierte Reparatur ergänzen:
  Grund speichern, ursprüngliche Frage serverseitig laden, schlechte Antwort
  aus dem Reparaturkontext entfernen und mit dem gewählten Hinweis neu suchen.
- Die bestehende Assistant-Nachricht erst nach erfolgreicher Reparatur
  ersetzen. Bei Fehler bleibt die alte Antwort mit erneutem Versuch erhalten.
- Reparatur verbraucht Rate-Limit, erzeugt aber keine doppelte Nutzerfrage.

## 5. Antwort-first UX für Web und iOS

- Antwort visuell vor Quellen und Feedback halten.
- Immer genau die beste Quelle kompakt zeigen; weitere Quellen aufklappbar.
- Dokumentquellen öffnen intern, Web-Quellen als sichere HTTPS-Links extern.
- Quellenart verständlich als „Eure Unterlage“ oder „Web-Quelle“ kennzeichnen.
- Kurze echte Fortschrittstexte aus dem gemeinsamen Vertrag verwenden:
  nachdenken, Familienwissen durchsuchen, Web prüfen, Antwort formulieren.
- Abbruch, unterbrochener Stream, leere Antwort, Rate-Limit und Retry auf
  beiden Plattformen gleich behandeln. Teiltext nie still als fertig markieren.
- Nach negativem Feedback Grundauswahl plus primäre Aktion „Besser antworten“
  anbieten.
- Optionalen nächsten Schritt als einen ruhigen Button unter der Antwort
  darstellen.

## 6. Persönlicher Einstieg

- Eine gemeinsame, deterministische Funktion erzeugt genau drei Vorschläge
  aus vorhandenen Aufgaben, jüngsten Dokumenten und Familienmitgliedern.
- Web und iOS verwenden dieselbe Logik und Reihenfolge.
- Bei wenig Daten auf drei hilfreiche Fragen aus Familienwissen,
  Allgemeinwissen und aktueller Web-Recherche zurückfallen.
- Vorschläge enthalten keine Geheimnisse oder unnötig sensiblen Details.

## 7. Messung und Evaluation

- Metriken um Wissensraum, Suchrunden, Antwortzustand, Reparatur und
  Quellenarten ergänzen, ohne Frage oder Inhalt zu protokollieren.
- Einen festen, versionierten Eval-Satz für exakte Fakten, Listen,
  Folgefragen, Konflikte, Teilwissen, No-result, Web-Aktualität,
  Anonymisierung, Reparatur und Prompt-Injection anlegen.
- Deterministische Unit- und Contract-Tests laufen in CI.
- Einen expliziten Live-Eval-Befehl für Modellqualität und Latenz bereitstellen;
  er läuft nur mit Testdaten und gesetzten Zugangsdaten.

## 8. Abnahme

- Fokus-Tests nach jeder Schicht.
- Vollständig: Web-Lint, Web-TypeScript, Web-Tests, Next.js-Build,
  Mobile-Lint, Mobile-TypeScript, Mobile-Tests und iOS-Export.
- `git diff --check`, Vereinfachungsprüfung und abschließendes Code-Review.
- Staged Diff auf Secrets und unbeabsichtigte Dateien prüfen.
- Danach Commits pushen und einen PR gegen `main` öffnen.
