# Dokumentenchat: Implementierung und Abnahme

Stand: 05.09.2026. Die Nachweise beziehen sich auf den lokalen Feature-Branch,
eine echte lokale API mit den angebundenen Diensten und eine isolierte synthetische
Testfamilie. Sie sind keine Messung der gesamten Produktion.

## Antwort und Beleg

Dokumentsuche und Graphabfragen laden zusätzlich Originalseiten. `read_document`
kann gezielt nachlesen. `answer_from_documents` verbindet jeden Antwortsatz mit
Dokument, tatsächlicher Seite und zusammenhängendem Originalzitat. Die Prüfung
kontrolliert Zitat, Personenbezug, Zahlen, Datumswerte und Hervorhebung. Sie verhindert
unter anderem, dass die Kündigungsfrist als Ticketgültigkeit ausgegeben wird oder
eine belegte Zeitfrage allein mit einem Ort beantwortet wird. Sie ist keine
vollständige semantische Beweisprüfung; Interpretationen brauchen weiter Live-Tests.

Unklare Fragen erhalten eine Suche mit Thema und Person aus dem Gespräch. Mehrere
kurze Folgefragen behalten den vorherigen Dokumentbezug. Fehlende Angaben und
widersprüchliche Belege werden ausdrücklich dargestellt. Ein späterer Upload allein
beweist keine Verlängerung. Der bestehende Wissensgraph und die vorhandenen
Familienrelationen bleiben die Grundlage; eine neue persistente Graphstruktur wird
mit dieser Änderung nicht eingeführt.

## Wartezeit und Speicherung

Erkennbare Dokumentfragen starten die Suche vor dem ersten Modellaufruf. Die erste
Suche spart Query-Expansion und zusätzliches Modell-Reranking; ein breiterer zweiter
Versuch bleibt möglich. Vor einer Dokumentantwort muss das Modell die gelesenen Seiten mit
`answer_from_documents` prüfen lassen. Die geprüften Aussagen bleiben anschließend
für die vollständige Antwort erhalten. Weitere Web-, Aufgaben- oder Kalenderabfragen
können folgen; erst die abschließende Formulierung beendet die Antwort. Sie muss die
geprüften Dokumentaussagen unverändert enthalten und öffentliche Angaben weiterhin
mit einer Webquelle verbinden. Die öffentliche Recherche behält auch nach der
Belegprüfung Zugriff auf alle privaten Quellauszüge für ihre Datenschutzprüfung.
Unbelegte Antwortkarten können diesen Ablauf nicht abkürzen.

Servermetriken unterscheiden Retrieval, Reranking, Seitenlesen und Modellrunden.
Die Schleife ist auf drei Werkzeugrunden plus Abschluss begrenzt; der Server bricht
nach 45 Sekunden ab. Der Nutzer kann vorher stoppen. `answer_ready` beendet die
sichtbare Wartephase vor der Speicherung.

Die Live-Abnahme fand einen tatsächlichen Speicherfehler: Der Insert setzte das
nicht vorhandene Legacy-Feld `chat_messages.feedback`. Bewertungen liegen bereits
in `chat_feedback_events`; das veraltete Feld wird nicht mehr geschrieben. Bei einem
weiteren Speicher- oder Transportfehler nach fertiger Antwort bleibt die Antwort
samt Quelle sichtbar und kopierbar. Ein klarer Hinweis sagt, dass sie noch nicht im
Verlauf gespeichert ist. Ein früher Abbruch bleibt ein abgebrochener Versuch.

## Dokumenttyp

Die Extraktion unterscheidet Reiseberechtigung/QR-Code von Accountzugängen. Ein
zusätzlicher konservativer Klassifikationsschritt korrigiert `credentials` nur bei
klarer Fahrkartenüberschrift, Gültigkeitsangabe und Datum ohne Login-/Passwortmarker.
Vier echte Modell-Extraktionen bestanden: QR-Ticket und Barcode-Fahrkarte als
`other`, Portal- und Schulzugang weiterhin als `credentials`.

Bestehende Fehlklassifikationen werden beim Lesen sicher behandelt: Ein klarer
hochgeladener Reisebeleg kann mit Originalseiten gelesen werden; bei manuellen oder
unklaren Zugangsdokumenten bleibt nur die streng geprüfte Gültigkeitszeile freigegeben.
Private Produktionsdokumente wurden nicht umklassifiziert.

## Reproduzierbare Live-Abnahme

- `chat-documents.json`: 15 synthetische Dokumente mit Namen, Fristen, Beträgen,
  expliziter Verlängerung, gleichrangigem Widerspruch und OCR-Lücken.
- `chat-cases.json`: 50 Alltagsfragen einschließlich fünf aufeinanderfolgender
  Nachfragen in einem gespeicherten Gespräch.
- `chat-edge-cases.json`: zwölf zusätzliche Fälle zu älterem/jüngerem Kind,
  Schule, Verlängerung, Konflikt, OCR und bewusst fehlendem Dokument.
- `chat-acceptance-fixture.ts`: erstellt eine getrennte Testfamilie mit expliziten
  Familienrelationen, durchläuft echte Analyse und Bestätigung inklusive Index/Graph.
- `live-chat-eval.ts`: nutzt die authentifizierte `/api/chat`-Route, prüft Fakten,
  passende zitierte Quellen, Antwortzustand, vollständigen Stream und Speicherung.
  Folgefragen nutzen den gespeicherten Gesprächsverlauf.

Beispiel mit den vorhandenen lokalen Server-Umgebungsvariablen:

```sh
NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local scripts/chat-acceptance-fixture.ts seed
NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local scripts/chat-acceptance-fixture.ts run
NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local scripts/chat-acceptance-fixture.ts run docs/quality/chat-edge-cases.json
```

Die Fixture speichert ihren isolierten Zugang ausschließlich in einer temporären
Datei mit Modus 0600. Sie prüft Eigentümer und Testfamiliennamen vor Änderungen.
Nur das synthetische Kontingent wird für Wiederholungsläufe zurückgesetzt. Keine
Tokens in Logs oder Versionsverwaltung aufnehmen. Temporäre native QA-Login-Routen
wurden nach der Abnahme entfernt und gehören nicht zum Lieferumfang.

Der alternative Runner `eval:chat:model` prüft nur Modellantworten mit vorgegebenen
Quellen und darf nicht mit diesem Retrievaltest verwechselt werden.

## Native Bedienung

Im iPhone-SE-Simulator (375 × 667 Punkte) geprüft: ungenaue Ticketfrage, Folgefrage
zum anderen Kind, Stoppen während der Antwort, erneut geöffnetes gespeichertes
Gespräch mit Zitat, Quellenansicht und echtes synthetisches Original-PDF in Safari.
Die Texteingabe lag bei `accessibility-large` vollständig über der sichtbaren
Systemtastatur. Lesetexte skalieren; Überschriften und kurze Navigation passen sich
an den knappen Platz an. Notizen ohne Originaldatei zeigen keinen kaputten
„Original öffnen“-Knopf. Nach der Abnahme wurden Schrift- und Systemeinstellung
wiederhergestellt.

Unabhängiger Impeccable-Abschlussreview: **ship**, begrenzt auf die vorgelegten
SE-Ansichten gespeicherter Antworten/Quellen bei Standard- und großer Schrift.
Der Tastatur-Screenshot entstand vor der letzten Überschrift-/Placeholder-Anpassung.
Die dunkle Systemeinstellung wurde geprüft; die App bleibt gemäß vorhandenem
Design bewusst hell. Das ist kein Nachweis einer dunklen App-Variante.

Nicht durch diese Abnahme belegt: physische iPhones, VoiceOver-Bedienreihenfolge,
Android, beliebige mehrseitige PDF-Sprünge, große Bibliotheken und komplexe
Relationsketten jenseits des Testkorpus. Eine neue dauerhafte Graph-Lernschicht,
Versionierungsregeln für alle Dokumentarten und ein unabhängiger Holdout-Prüfsatz
sind durch die vorhandenen Familienrelationsfälle ebenfalls nicht bewiesen.

## Messergebnisse

Der letzte breite Lauf besteht **50/50** Fälle einschließlich Quellen und
Speicherung. Median: **5.502 ms**, p95: **7.166 ms**. Das erfüllt die gesetzten
95-%-/8-Sekunden-Ziele in diesem synthetischen Lauf, ist aber kein Produktions-SLO.

Die Entwicklungsläufe werden vollständig als Metadaten in `chat-results.json`
festgehalten: zunächst 41/50 (p50 5.853 ms, p95 7.929 ms), anschließend unter anderem
44/50 und 48/50. Der 48/50-Lauf hatte p95 11.837 ms und führte zu den letzten
Korrekturen. Es werden keine Erfolgsfälle aus unterschiedlichen Läufen zu einem
scheinbar perfekten Durchlauf zusammengesetzt. Ein semantisch richtiger Ausdruck
„fehlt“ wurde im Hund-Versicherungsfall als zusätzliche zulässige Negation ergänzt;
Fakten, Quellenanforderungen und der breite Prüfsatz wurden nicht abgeschwächt.

Der frühere Grenzfalllauf bestand **12/12** einschließlich Speicherung, mit
p50 4.028 ms und p95 9.209 ms. Komplexe Konflikt-/Negativsuchen können länger dauern
als einfache Dokumentfragen. Die finale Wiederholung wird ebenfalls in
`chat-results.json` geführt. Die Läufe nutzen echte externe Dienste, aber einen
lokalen Entwicklungsserver; Korpusumfang und Code änderten sich zwischen ihnen.
Sie zeigen Fehlerbehebungen und Laufzeitschwankungen, keine isolierte kausale
Performance-Messung. Wiederholungen und ein unabhängiger Prüfsatz mit größeren
Bibliotheken bleiben für einen allgemeinen Qualitätsanspruch notwendig.

Der erste Wiederholungslauf der Grenzfälle zeigte einen 45-Sekunden-Timeout bei
der fehlenden Hundeversicherung (11/12). Das Modell hatte den Zustand bereits
auf `not_found` gesetzt, aber noch keine abschließende Antwort geliefert. Nach
diesem Befund wurde das separate Zustandswerkzeug bei gelesenen Dokumentseiten
aus der Werkzeugauswahl entfernt; Antwort und Zustand schließen gemeinsam ab.
Dieser fehlgeschlagene Lauf bleibt im Ergebnisartefakt erhalten.

Die gezielte Wiederholung nach der Abschlusskorrektur besteht **12/12**:
p50 **5.450 ms**, p95 **8.828 ms**; der zuvor abgebrochene Negativfall endet nach
**7.580 ms** korrekt und gespeichert. Der komplexe Fristenkonflikt benötigt
**8.828 ms**. Die Acht-Sekunden-Marke ist daher für den breiten Alltagslauf, nicht
für jeden Grenzfall nachgewiesen. Der 50/50-Lauf entstand vor dieser letzten,
zusätzlich durch Orchestrierungstests abgesicherten Werkzeugauswahl-Korrektur.

Technische Prüfungen: 200 Web-Testsuiten mit 2.908 Tests und 34 Mobile-Testsuiten
mit 342 Tests bestanden; Web-/Mobile-Lint und beide TypeScript-Prüfungen grün.
Der bereinigte Produktionsbuild (`npm run build`) ist ebenfalls erfolgreich.


## Review-Korrekturen vom 06.09.2026

P1: Ein altes Dokumentthema wird nur entlang einer ununterbrochenen Kette von
Folgefragen übernommen. Ein Themenwechsel beendet diese Kette; ein Fragewort allein
macht „Wann ist Ostern?“ oder „Wie wird morgen das Wetter?“ nicht zur Ticketfrage.

P2: Die Dokumentprüfung ist kein vorzeitiger Gesprächsabschluss mehr. Die endgültige
Antwort kann Dokumentfakten mit Web- und Aufgabenergebnissen verbinden. Webquellen
bleiben erhalten, während die Oberfläche geprüfte Dokumentzitate statt bloßer
Suchauszüge zeigt. Veränderte Dokumentdaten und unbelegte öffentliche Ergänzungen
werden auch bei der letzten Formulierung abgefangen. Regressionstests prüfen beide
Reihenfolgen einer gemeinsamen Werkzeugrunde und spätere Aufgabenabfragen.

Acht zusätzliche Live-Fälle (`chat-review-cases.json`) bestanden, darunter ein
Themenwechsel, allgemeines Wissen plus Dokumentfakt, Aufgaben plus Dokumentfakt und
zusammenhängende Folgefragen. Median 5.325 ms; längster Fall 14.827 ms (kombinierte
Aufgabenfrage). Das zusätzliche abschließende Formulieren kostet eine Modellrunde;
die früheren 50er-Latenzen sind daher kein Nachweis für diese Orchestrierungsversion.
Die Kombination mit Webrecherche ist zusätzlich deterministisch mit kontrollierten
öffentlichen Quellen geprüft. Es wird kein neuer breiter 50er-Lauf behauptet.
