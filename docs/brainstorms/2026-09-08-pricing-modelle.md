# Pricing-Modell für Ordilo

Stand: 2026-09-09
Status: Entscheidungsgrundlage, noch keine Implementierung

## Kurzfassung

Ordilo sollte mit **Free + einem Familienabo** starten:

- **Free:** Kernprodukt dauerhaft nutzbar, aber mit monatlichen Mengenlimits
- **Ordilo Plus:** ein Preis pro Familie, monatlich oder jährlich
- **Testphase:** 30 Tage Plus ohne Zahlungsdaten, danach automatisch Free
- **Launch-Preis:** zunächst **7,99 €/Monat oder 79 €/Jahr**
- **Founding-Angebot:** **59 €/Jahr für die ersten zwei Jahre**, begrenzte
  Kohorte; kein Lifetime-Angebot
- **Keine Credits, keine Werbung, kein Preis pro Familienmitglied**

Diese Empfehlung ist noch eine **zu testende Ausgangshypothese**. Die
technische Kostenmessung ist vorhanden, aber es fehlen belastbare
Nutzungs-, Conversion- und Retention-Daten echter zahlender Kohorten.

## 1. Was wir wissen und was wir nur annehmen

### Beobachtet

- Aktuell gibt es keine bezahlten Pläne und keine Entitlements.
- Harte Tageslimits begrenzen Missbrauch: 50 Chat-Nachrichten und 50
  Spracheingaben pro Familie und Tag. Auch Dokument-Uploads sind begrenzt.
- Das `api_usage`-Ledger erfasst Modell, Tokenverbrauch und geschätzte
  Provider-Kosten je Aufruf. Der Admin-Bereich aggregiert diese Daten.
- Datalab berechnete in einer synthetischen Probe etwa 0,01 $ pro OCR-Seite.
- Die Abrechnung von Browser-Realtime-Sprache ist noch nicht vollständig
  angebunden. Die Gesamtkostenmessung ist deshalb nicht vollständig.

Technische Referenzen:

- `src/lib/ai/rate-limit.ts`
- `src/lib/ai/voice-rate-limit.ts`
- `src/lib/analytics/api-usage.ts`
- `supabase/migrations/0079_api_usage.sql`
- `docs/quality/beta-usage.md`

### Noch nicht beobachtet

- durchschnittliche Kosten einer real aktiven Familie über mehrere Monate
- Kostenverteilung p50, p90, p95 und p99
- Verhältnis aktiver zu inaktiven Free-Familien
- Free→Paid- und Trial→Paid-Conversion
- Monats- und Jahres-Retention
- Zahlungsbereitschaft bei 4,99 €, 7,99 €, 9,99 € oder anderen Preisen
- Supportkosten pro Familie
- Kosten und Nutzung von Realtime-Sprache

Alle folgenden Profile und Szenarien sind daher Planungsannahmen, keine
Prognosen.

## 2. Kostenmodell

Provider-Tarife laut `docs/quality/beta-usage.md`, Stand 2026-09-07:

| Modell | Input / 1 Mio. | Cached / 1 Mio. | Output / 1 Mio. |
| --- | ---: | ---: | ---: |
| gpt-5.6-terra | 2,00 $ | 0,20 $ | 12,00 $ |
| gpt-5.6-luna | 0,20 $ | 0,02 $ | 1,20 $ |
| text-embedding-3-large | 0,13 $ | – | – |
| Datalab OCR | ca. 0,01 $ pro Seite | – | – |

### Geschätzte Kosten je Vorgang

| Vorgang | Arbeitshypothese |
| --- | ---: |
| Dokument, vollständig verarbeitet | **0,04–0,08 $** |
| KI-Frage an Ordilo | **0,02–0,05 $** |
| Suchanfrage | **<0,005 $** |
| Spracheingabe, Transkription | **<0,01 $** |
| Browser-Realtime-Sitzung | **unbekannt** |

Die Spannbreiten sind wichtiger als der Mittelwert. Mehrseitige Dokumente,
mehrere Tool-Runden und lange Antworten können deutlich teurer sein.

### Nutzungshypothesen je Familie

| Profil | Nutzung pro Monat | Geschätzte Kosten |
| --- | --- | ---: |
| Wenig | 5 Dokumente, 10 KI-Fragen, 15 Suchen | **ca. 0,60 $** |
| Typisch | 20 Dokumente, 30 KI-Fragen, 50 Suchen | **ca. 2,00 $** |
| Engagiert | 50 Dokumente, 70 KI-Fragen, Sprache | **ca. 4–6 $** |
| Power | 80 Dokumente, 120 KI-Fragen, Sprache | **ca. 8–9 $** |

Die Bezeichnungen „typisch“ und „Power“ sind noch nicht empirisch belegt.
Sie dürfen erst nach mehreren Wochen realer Nutzung als Benchmarks verwendet
werden.

### Was Mengenlimits tatsächlich leisten

100 Dokumente plus 100 KI-Fragen können nach den obigen Stückkosten
**6–13 $** kosten. Ein solches Limit garantiert deshalb keinen p99-Wert
unter 3 €. Limits schützen vor ungebremstem Missbrauch, ersetzen aber keine
Messung der realen Kostenverteilung.

Die Paid-Limits sollten nach dem Beta-Zeitraum so gesetzt werden, dass:

- die durchschnittlichen variablen Kosten einer zahlenden Familie
  möglichst bei oder unter **2 €** liegen,
- p95 möglichst bei oder unter **3,50 €** liegt,
- ungewöhnliche Nutzung zuerst freundlich erklärt und erst danach begrenzt
  wird,
- Limits serverseitig konfigurierbar und ohne App-Update anpassbar bleiben.

## 3. Die vier möglichen Modelle

### Modell A: Free + Familienabo

Ein dauerhaft nutzbarer Free-Plan führt in das Produkt. Ein Plus-Abo schaltet
höhere Mengen und Komfortfunktionen frei.

**Vorteile**

- entspricht der Erwartung in Familien- und Dokumenten-Apps
- senkt die Vertrauenshürde bei privaten Dokumenten
- Familien können den Nutzen vor einer Zahlung erleben
- ein einziges Abo bleibt einfach erklärbar

**Nachteile**

- Free-Nutzung verursacht reale Kosten
- niedrige Conversion kann die Marge des Paid-Plans aufzehren
- Limits und Upgrade-Momente müssen verständlich gestaltet werden

**Bewertung:** Beste Ausgangsbasis, wenn Free-Kosten und Conversion als
zusammengehörige Kennzahlen geführt werden.

### Modell B: Vollständige Testphase, danach harte Paywall

Alle erhalten 7–30 Tage den vollen Funktionsumfang. Danach ist eine Zahlung
notwendig.

**Vorteile**

- höhere kurzfristige Conversion ist möglich
- keine dauerhafte Free-Subvention
- einfache Einheitsökonomie

**Nachteile**

- Nutzer müssen Ordilo vertrauen, bevor genügend Dokumente verarbeitet sind
- ein Brief- und Familienrhythmus ist länger als ein typischer App-Test
- nach Ende der Testphase entsteht Unsicherheit über bereits hochgeladene
  Dokumente

**Bewertung:** Wirtschaftlich attraktiv, aber für ein sensibles Archivprodukt
zu hart. Als späterer Test denkbar, nicht als Launch-Standard.

### Modell C: Credits oder Pay-per-Use

Dokumente und KI-Fragen werden in Paketen verkauft.

**Vorteile**

- Nutzung und Umsatz sind direkt gekoppelt
- Gelegenheitsnutzer zahlen kein laufendes Abo

**Nachteile**

- Familien rationieren das Scannen und Fragen
- Vollständigkeit des Archivs wird bestraft
- Kosten werden bei jeder Nutzung sichtbar
- passt schlecht zur ruhigen, vertrauensvollen Marke

**Bewertung:** Als Kernmodell verwerfen. Ein späteres, seltenes
Overage-Angebot wäre nur dann sinnvoll, wenn reale Daten dafür Bedarf zeigen.

### Modell D: Lifetime

Eine einmalige Zahlung finanziert unbegrenzte zukünftige Nutzung.

**Vorteile**

- schneller Cashflow
- starke Founding-Botschaft
- keine Abo-Müdigkeit

**Nachteile**

- dauerhaft laufende KI- und Supportkosten
- besonders gute Retention verschlechtert die Wirtschaftlichkeit
- Preis-, Kosten- und Nutzungsrisiko liegt vollständig bei Ordilo

149 € brutto entsprechen nach Umsatzsteuer und Zahlungsgebühr nur ungefähr
123 € netto. Bei 1,85 € variablen Kosten pro Monat finanziert das rund
5½ Jahre typischer Nutzung, nicht „lebenslang“. Engagierte Familien
verbrauchen das Budget deutlich früher.

**Bewertung:** Verwerfen. Ein begrenzter Founding-Rabatt ist sicherer und
validiert wiederkehrende Zahlungsbereitschaft besser.

## 4. Wettbewerbsvergleich

Quellen wurden, soweit möglich, auf offiziellen Preis- und App-Store-Seiten
geprüft. US-Preise sind nur eingeschränkt auf deutsche Familien übertragbar.

### Direkte und nahe Wettbewerber

| Produkt | Schwerpunkt | Modell | Listenpreis |
| --- | --- | --- | ---: |
| **FamilyMind** | deutsche Familien-KI, Kalender, Aufgaben, Mahlzeiten, Foto- und Spracheingabe | Free + 7 Tage Premium-Test | **9,99 €/Monat, 69,99 €/Jahr** |
| **Trustworthy** | Familienarchiv, Erinnerungen, KI-Antworten, E-Mail-Import | Free + drei Paid-Stufen, jährlich | **10–40 $/Monat** |
| **Ohai.ai** | KI-Haushaltsassistenz, Kalender und Aufgaben | Free + Premium | **ab 9,99 $/Monat** |
| **fileee Free** | Dokumentenverwaltung und Extraktion | Free | **10 Dokumente/Monat** |
| **fileee Basic** | mehr Dokumente und Komfortfunktionen | Abo | **4,99 €/Monat, 3,99 € jährlich abgerechnet** |
| **fileee Smart** | hohe Dokumentmenge, Exporte, Overage | Abo | **9,99 €/Monat, 7,99 € jährlich abgerechnet** |
| FamilyWall Premium | Familien-Organizer | Freemium + Abo | ca. **4,99 $/Monat, 44,99 $/Jahr** |
| TimeTree Premium | gemeinsamer Kalender | Freemium + Abo | ca. **4,49 $/Monat, 44,99 $/Jahr** |
| Cozi Gold | Familien-Organizer | werbefinanziertes Free + Jahresabo | ca. **39 $/Jahr** |

Offizielle Kernquellen:

- [FamilyMind für Familien](https://familymind.ai/families/)
- [FamilyMind im deutschen App Store](https://apps.apple.com/de/app/familymind/id6740882851)
- [Trustworthy Pricing](https://www.trustworthy.com/pricing)
- [fileee Privatkundentarife](https://en.fileee.com/personal-pricing)
- [Ohai Funktions- und Preisübersicht](https://www.ohai.ai/how-it-works/)

### FamilyMind als wichtigster deutscher Vergleich

FamilyMind ist näher an Ordilo als ein klassischer Familienkalender:

- deutsche Zielgruppe
- eine KI für die ganze Familie
- Foto- und Spracheingabe
- Kalender, Aufgaben und Erinnerungen
- dauerhafter Free-Einstieg
- ein Premium-Plan für die Familie

FamilyMind zeigt, dass ein Preis von 7,99–9,99 € im deutschen
Familiensegment grundsätzlich darstellbar ist. Das Jahresabo von 69,99 €
setzt allerdings einen aggressiven Vergleichsanker gegen Ordilos geplante
79 €.

Die Produkte sind trotzdem nicht identisch:

- FamilyMind verkauft vor allem weniger Mental Load im laufenden Alltag.
- Ordilo verkauft ein dauerhaftes, strukturiertes und belegbares
  Familiendokumenten-Archiv.
- Ordilos stärkste Differenzierung sind Originaldokument, Extraktion,
  Fristen, belegte Antworten und langfristige Wiederauffindbarkeit.

Die bisherige Aussage „kein Wettbewerber verbindet Familienorganisation und
KI-Dokumentenaufnahme“ ist damit zu stark. Belastbarer ist:

> Kein geprüfter direkter Wettbewerber positioniert sich so klar als
> langfristiges, belegbares Familiendokumenten-Archiv mit KI-Antworten aus
> den Originalunterlagen.

### Trustworthy als Preis- und Packaging-Vergleich

Trustworthy begrenzt vor allem Familienmitglieder und KI-Antworten:

| Stufe | Preis bei Jahreszahlung | Mitglieder | KI-Antworten |
| --- | ---: | ---: | ---: |
| Free | 0 $ | 1 | 10/Monat |
| Silver | 10 $/Monat | 5 | 25/Monat |
| Gold | 20 $/Monat | 10 | unbegrenzt |
| Platinum | 40 $/Monat | unbegrenzt | unbegrenzt |

Das bestätigt KI-Antworten als verständliche Metering-Achse. Die
Mitgliederzahl sollte Ordilo dagegen nicht knapp halten: Zusammenarbeit ist
Teil des Familienversprechens und unterstützt Aktivierung und Retention.

### Was der Markt tatsächlich zeigt

1. **Free ist Kategorie-Norm**, aber nicht automatisch wirtschaftlich.
2. **Ein Preis pro Familie** ist verständlicher als ein Sitzpreis.
3. **7,99 € ist plausibel**, aber noch nicht validiert.
4. **69–79 € pro Jahr** ist für eine Familien-KI marktüblich; klassische
   Organizer liegen eher bei 40–50 €.
5. **Dokumentenspeicher allein trägt keinen Premiumpreis.** Der Wert liegt
   in Fristen, Aufgaben, Antworten und Sicherheit.
6. **Ordilo muss sich als Dokumenten-Assistent positionieren**, nicht als
   weiterer Familienkalender.

## 5. Empfohlenes Packaging

### 30 Tage Ordilo Plus testen

- beginnt erst nach dem ersten echten Wertmoment, zum Beispiel dem ersten
  erfolgreich bestätigten Dokument
- keine Zahlungsdaten erforderlich
- vollständiger Plus-Funktionsumfang
- danach automatische Rückstufung auf Free
- vorhandene Dokumente bleiben lesbar und durchsuchbar

Die Testphase und ein separates Start-Kontingent von 50 Dokumenten erfüllen
denselben Zweck. Beides gleichzeitig macht das Modell unnötig kompliziert.
Die Empfehlung lautet deshalb: **Testphase statt zusätzlichem
Start-Kontingent**.

### Ordilo Free

- 10 neue Dokumente pro Monat
- 10 KI-Antworten pro Monat
- Suche ohne sichtbaren Zähler
- Aufgaben, Erinnerungen und Familienfreigabe als Kernfunktionen
- vorhandene Inhalte bleiben zugänglich
- kein Realtime-Sprachmodus
- E-Mail-Import zunächst Plus

Diese Limits sind Startwerte. Erhöhungen sind leichter und
vertrauensfreundlicher als spätere Kürzungen.

### Ordilo Plus

- ein Plan für die ganze Familie
- deutlich höhere, fair kommunizierte Nutzung
- E-Mail-Import
- Sprache und zukünftige kostenintensive Assistentenfunktionen
- keine Credits im normalen Gebrauch
- interner Missbrauchsschutz bleibt bestehen

Konkrete Paid-Limits werden nicht aus den theoretischen Profilen abgeleitet.
Sie werden nach einer Beta-Auswertung von Durchschnitt, p90, p95 und p99
festgelegt. Die heutigen 50-pro-Tag-Limits sind für ein Familienabo zu hoch
und zu leicht automatisiert ausreizbar.

## 6. Preis und Einheitsökonomie

### Empfohlener Testpreis

- **7,99 €/Monat**
- **79 €/Jahr**

79 € entsprechen rund 6,58 € brutto pro Monat und etwa 17,6 % Rabatt
gegenüber zwölf Monatszahlungen. FamilyMinds 69,99 € machen den Jahrespreis
zum wichtigsten offenen Preistest.

Eine sinnvolle Alternative für den Test ist:

- 7,99 €/Monat
- 69,99 €/Jahr

Der niedrigere Jahrespreis verbessert wahrscheinlich die Jahresquote, senkt
aber den Deckungsbeitrag deutlich. Die Entscheidung sollte über echte
Checkout-Starts und Käufe fallen, nicht über reine Preisumfragen.

### Nettoerlös

Annahmen: 19 % Umsatzsteuer, Webzahlung ungefähr 1,4 % + 0,25 €,
App-Store-Small-Business-Provision 15 %.

| Preis und Kanal | Nettoerlös |
| --- | ---: |
| 7,99 € monatlich, Web | **ca. 6,35 €** |
| 7,99 € monatlich, iOS | **ca. 5,71 €** |
| 79 € jährlich, Web, pro Monat | **ca. 5,42 €** |
| 79 € jährlich, iOS, pro Monat | **ca. 4,70 €** |

Bei 50 % Web, 50 % iOS und 60 % Jahresabos ergibt sich ein gemischter
Nettoerlös von ungefähr **5,45 € pro zahlender Familie und Monat**.

Bei 2 € variablen Kosten bleiben vor Free-Subvention, Fixkosten, Support und
Gehältern ungefähr **3,45 € Deckungsbeitrag**. Das entspricht rund 63 %
Marge auf den Nettoerlös, nicht auf den Bruttopreis.

### Warum 4,99 € zu knapp ist

| Preis | Netto Web | Netto iOS, 15 % | Beitrag nach 1,85 € Nutzungskosten |
| --- | ---: | ---: | ---: |
| 2,99 € | ca. 2,22 € | ca. 2,14 € | **0,29–0,37 €** |
| 4,99 € | ca. 3,87 € | ca. 3,56 € | **1,71–2,02 €** |
| 7,99 € | ca. 6,35 € | ca. 5,71 € | **3,86–4,50 €** |

2,99 € ist bei typischer Nutzung nur knapp kostendeckend und wird durch
engagierte Familien sofort defizitär. 4,99 € funktioniert nur bei sehr
niedrigen Akquisitions- und Free-Kosten. 7,99 € schafft den nötigen
Sicherheitsraum.

## 7. Free-Subvention richtig rechnen

Free-Kosten müssen immer zusammen mit der Conversion betrachtet werden.

Bei einer Free→Paid-Conversion `c` gibt es je zahlender Familie
`(1−c)/c` Free-Familien.

| Conversion | Free-Familien je zahlender Familie |
| ---: | ---: |
| 3 % | 32,3 |
| 5 % | 19,0 |
| 7 % | 13,3 |
| 10 % | 9,0 |

Bei 5 % Conversion und durchschnittlich 0,15 € Kosten je registrierter
Free-Familie entstehen **2,85 € Free-Subvention pro zahlender Familie**.
Vom oben berechneten Paid-Deckungsbeitrag von 3,45 € bleiben dann nur
ungefähr **0,60 €** vor Fixkosten und Gehältern.

### Break-even des Free-Plans

Mit 3,45 € Deckungsbeitrag je zahlender Familie vor Free-Subvention:

| Durchschnittliche Free-Kosten | Nötige Free→Paid-Conversion |
| ---: | ---: |
| 0,10 €/Monat | **2,8 %** |
| 0,15 €/Monat | **4,2 %** |
| 0,20 €/Monat | **5,5 %** |
| 0,70 €/Monat | **16,9 %** |

Das ist die zentrale Freemium-Wette: Nicht die Kosten einer aktiven
Free-Familie allein entscheiden, sondern der aktivitätsgewichtete
Durchschnitt über alle Free-Konten.

### Korrigiertes Wachstumsszenario

Annahmen:

- 7,99 €/79 € Pricing
- 5,45 € gemischter Nettoerlös
- 2 € Paid-Nutzungskosten
- 5 % Free→Paid-Conversion
- 0,15 € durchschnittliche Kosten je registrierter Free-Familie

| Zahlende Familien | Nettoerlös | Paid-Kosten | Free-Familien | Free-Kosten | Beitrag vor Fixkosten |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1.000 | 5.450 € | 2.000 € | 19.000 | 2.850 € | **600 €** |
| 5.000 | 27.250 € | 10.000 € | 95.000 | 14.250 € | **3.000 €** |
| 20.000 | 109.000 € | 40.000 € | 380.000 | 57.000 € | **12.000 €** |

Das frühere Szenario setzte bei zehn Free-Familien pro Zahler 0,70 € Kosten
an, multiplizierte aber faktisch nur mit 0,07 €. Dadurch waren die
Free-Kosten um den Faktor zehn zu niedrig.

Die Tabelle ist bewusst konservativ und zeigt: Bei 5 % Conversion reicht
ein großer Free-Funnel allein nicht für ein attraktives Geschäft. Mindestens
einer dieser Werte muss besser werden:

- höhere Conversion,
- niedrigere durchschnittliche Free-Kosten,
- höherer Nettoerlös,
- niedrigere Paid-Kosten,
- bessere organische Retention.

## 8. Founding-Angebot

### Empfehlung

**59 €/Jahr für die ersten zwei Jahre**, begrenzt auf beispielsweise 100
Founding-Familien.

Danach gilt der bereits beim Kauf klar genannte reguläre Jahrespreis.

Das Angebot:

- bringt echten Umsatz statt nur Klickdaten,
- prüft wiederkehrende Zahlungsbereitschaft,
- belohnt frühes Vertrauen,
- begrenzt die langfristige Kostenverpflichtung,
- vermeidet ein wirtschaftlich offenes Lifetime-Versprechen.

Alternativ kann ein dauerhaft rabattiertes Founding-Abo angeboten werden,
aber erst, wenn reale Kosten zeigen, dass der Rabatt auch bei engagierten
Familien tragbar ist.

## 9. Perspektiven

### Aus Sicht einer Familie

- Ein Preis für alle ist verständlich.
- Bestehende Dokumente dürfen nach einem Downgrade nicht „eingesperrt“
  werden.
- Credits erzeugen bei jeder Nutzung Zweifel.
- 7,99 € müssen über weniger Sorgen und vermiedene Fehler erklärt werden,
  nicht über Speicher oder KI-Technik.

### Aus Produktsicht

- Dokumente sind das Fundament für späteren Wert.
- KI-Antworten sind eine verständliche laufende Mengenachse.
- Familienfreigabe sollte nicht künstlich knapp sein.
- E-Mail-Import und Sprache eignen sich als Plus-Komfortfunktionen.
- Das Ziel ist dauerhafter Kundennutzen, nicht künstlicher Lock-in.

### Aus Finanzsicht

- 7,99 € ist robuster als 4,99 €.
- Free kann den gesamten Paid-Deckungsbeitrag verbrauchen.
- Lifetime verschiebt langfristige Risiken vollständig zu Ordilo.
- Durchschnittskosten reichen nicht; Ausreißer müssen sichtbar sein.

### Aus Wachstumssicht

- Partner-Einladungen verbessern vor allem Aktivierung und Retention.
- Ein eingeladener Partner ist nicht automatisch eine neue zahlende Familie;
  der Invite-Loop hat deshalb nicht automatisch CAC 0.
- Paid Ads sollten erst starten, wenn Conversion, Retention und
  Deckungsbeitrag nach Free-Subvention bekannt sind.

### Aus Markensicht

- Free + ein ruhiges Familienabo passt zu Ordilo.
- Werbung, Credits und aggressive Paywalls passen nicht.
- Formulierungen wie „Unersetzbarkeit“ oder „die Familie hängt drin“ sind
  für ein vertrauensbasiertes Archiv unpassend.
- Datenexport und dauerhafte Lesbarkeit stärken Vertrauen.

## 10. Messplan

### Phase 1: Kosten-Baseline

Mindestens vier Wochen Beta-Nutzung auswerten:

- Kosten pro Dokument und KI-Frage
- Kosten je aktive und registrierte Familie
- p50, p90, p95 und p99
- Anteil der Familien an heutigen Tageslimits
- Realtime-Sprachkosten separat schließen

### Phase 2: Zahlungsbereitschaft

- eine echte Preis- oder Vorbestellseite bauen
- 7,99 €/79 € als Ausgangspunkt zeigen
- Checkout-Start, abgeschlossenen Kauf und Abbruch messen
- 69,99 € gegen 79 € nur bei genügend Traffic testen
- zusätzlich 10–20 qualitative Gespräche nach einem echten Wertmoment

Ein Fake-Door-Klick misst Interesse, aber noch keine Zahlungsbereitschaft.
Mindestens Checkout-Start oder Vorbestellung ist das stärkere Signal.

### Phase 3: Cohort-Test

- 30-Tage-Plus-Test ohne Zahlungsdaten
- danach Free mit 10 Dokumenten und 10 KI-Antworten
- Founding-Angebot für eine klar begrenzte Kohorte
- Kosten, Aktivierung, Conversion und Retention je Kohorte vergleichen

### Primäre Kennzahlen

| Bereich | Kennzahl |
| --- | --- |
| Aktivierung | erstes bestätigtes Dokument und erster daraus erzeugter Nutzen |
| Familie | angenommene Einladung und Nutzung durch mindestens zwei Personen |
| Conversion | Trial→Paid und Free→Paid nach 30, 60 und 90 Tagen |
| Retention | aktive Familien und zahlende Familien nach 30, 90 und 365 Tagen |
| Kosten | variable Kosten je registrierter, aktiver und zahlender Familie |
| Marge | Paid-Marge vor und nach Free-Subvention |
| Preis | Checkout→Kauf nach Monats- und Jahresoption |

### Stoppsignale

Das Modell muss neu bewertet werden, wenn:

- durchschnittliche Paid-Kosten dauerhaft über 2,50 € liegen,
- p95 dauerhaft über 4 € liegt,
- Free-Kosten bei realistischer Conversion den Paid-Deckungsbeitrag
  aufzehren,
- Familien den Nutzen überwiegend als Kalender statt als Dokumenten-
  Assistent verstehen,
- der Jahrespreis von 79 € gegenüber 69,99 € klar Conversion kostet.

## 11. Vorläufige Entscheidung

### Empfohlen

1. **Free + ein Plus-Abo**
2. **30 Tage Plus testen, danach Free**
3. **7,99 €/Monat und zunächst 79 €/Jahr**
4. **Founding: 59 €/Jahr für zwei Jahre**
5. **10 Dokumente + 10 KI-Antworten im Free-Plan**
6. **Familienfreigabe nicht pro Person bepreisen**
7. **E-Mail-Import und Realtime-Sprache in Plus**
8. **Limits nach echten Kostenverteilungen festlegen**

### Verworfen

- Pay-per-Use als Kernmodell
- Werbung im Free-Plan
- Lifetime-Angebot
- Preis pro Familienmitglied
- dauerhaft harte Paywall direkt nach der Testphase

## 12. Offene Entscheidungen

- 69,99 € oder 79 € pro Jahr?
- Startet die 30-Tage-Testphase bei Registrierung oder beim ersten
  bestätigten Dokument?
- Welche konkrete Nutzung fällt nach der Beta unter Fair Use?
- Soll E-Mail-Import während der Testphase standardmäßig aktiviert sein?
- Welche Export- und Leserechte gelten nach Kündigung?

Diese Fragen werden nicht durch weitere Modellrechnung entschieden, sondern
durch reale Nutzung, Checkout-Verhalten und Gespräche mit aktivierten
Familien.
