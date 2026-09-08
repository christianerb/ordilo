# Pricing-Modelle für Ordilo — Kostenanalyse und drei Vorschläge

Stand: 2026-09-08. Ziel: Aus „Free for All" wird ein Modell, das die Kosten
trägt, zur Familien-App-Marke passt und sich im Prelaunch messbar testen
lässt. Dieses Dokument ist die Entscheidungsgrundlage — noch keine
Implementierung.

## 1. Ausgangslage

- Aktuell zahlt niemand, es gibt keine Pläne, keine Entitlements.
- Kostenbremse heute nur über harte Tageslimits pro Familie
  (`src/lib/ai/rate-limit.ts`, `src/lib/ai/voice-rate-limit.ts`,
  E-Mail-Import): 50 Chat-Nachrichten/Tag, 50 Spracheingaben/Tag,
  50 Dokumente/Tag.
- Der Verbrauch wird bereits sauber gemessen: `api_usage`-Ledger
  (Migration `0079_api_usage.sql`) mit Modell, Tokens und USD-Kosten je
  Aufruf, aggregiert im Admin-Tab „Kosten" (`src/app/admin/costs-tab.tsx`).
- Provider-Tarife (Stand 2026-09-07, `docs/quality/beta-usage.md`):

  | Modell | Input / 1M | Cached / 1M | Output / 1M |
  | --- | --- | --- | --- |
  | gpt-5.6-terra (Analyse, Chat) | $2,00 | $0,20 | $12,00 |
  | gpt-5.6-luna (Suche, Rerank) | $0,20 | $0,02 | $1,20 |
  | text-embedding-3-large | $0,13 | — | — |
  | Datalab OCR | ca. $0,01 pro Seite (Synthetik-Probe) |

## 2. Kosten je Vorgang (Schätzung)

Annahmen aus dem Pipeline-Aufbau; die Spanne deckt kurze Briefe bis
mehrseitige Verträge ab.

| Vorgang | Treiber | Kosten |
| --- | --- | --- |
| Dokument komplett (OCR + Analyse + Embeddings) | ~2 Seiten OCR ($0,02), ~6k Input / 1,5k Output auf terra ($0,03), Embeddings <$0,001 | **$0,04–0,08** |
| Chatfrage („Ordilo fragen") | ~8k Input (teils gecacht), ~600 Output, Tool-Runden | **$0,02–0,05** |
| Suchanfrage | luna Augmentierung + Rerank + Embedding | **<$0,005** |
| Spracheingabe (Transkript) | gpt-4o-mini-transcribe | **<$0,01** |
| Browser-Sprachsitzung (Realtime) | gpt-realtime-2.1 | **unbekannt — noch nicht bepreist** |

## 3. Kosten je Familie und Monat

| Profil | Nutzung / Monat | Variable Kosten |
| --- | --- | --- |
| Wenig | 5 Dokumente, 10 Chatfragen, 15 Suchen | **~$0,60** |
| Typisch | 20 Dokumente, 30 Chatfragen, 50 Suchen | **~$2,00** |
| Power | 80 Dokumente, 120 Chatfragen, 150 Suchen, Sprache | **~$8–9** |
| Anschlag heute (alle Tageslimits × 30) | 1.500 Dokumente, 1.500 Chats | **~$120** — zeigt, warum Limits bleiben müssen |

Fixkosten dazu: Vercel Pro, Supabase Pro, Resend — grob 50–80 €/Monat,
bei wenigen hundert Familien vernachlässigbar pro Familie.

**Kernaussage:** Eine typische Familie kostet ~2 €/Monat variabel. Jeder
Preis ab ~5 €/Monat trägt die Kosten mit deutlicher Marge
(Zahlungsgebühren ~0,30–0,50 € pro Abo-Buchung eingerechnet).

## 4. Drei Vorschläge

### Vorschlag A — Freemium

- **Free:** 25 Dokumente/Monat, 10 Chatfragen/Tag, 2 Familienmitglieder,
  kein E-Mail-Import.
- **Familie Plus:** 5,99 €/Monat oder 59 €/Jahr: großzügige Fair-Use-
  Limits (200 Dokumente/Monat, 50 Chats/Tag), E-Mail-Import, Sprache,
  beliebig viele Mitglieder.
- **Pro:** Niedrige Einstiegshürde, Free-Nutzer werden zu zahlenden
  Familien, sobald das Limit „spürbar" wird; bewährtes Muster.
- **Contra:** Free-Kontingent kostet bei Erfolg reales Geld (~0,60–2 €
  pro Free-Familie/Monat); zwei Produktklassen müssen gepflegt werden;
  Limit-Kommunikation muss warm bleiben, sonst kippt sie in Scanner-App-
  Nerverei (Anti-Pattern laut PRODUCT.md).
- **Messbar im Prelaunch:** Quote der Familien, die ans Free-Limit stoßen
  (429er und `api_usage` liefern das heute schon).

### Vorschlag B — Pay-per-Use (Credits)

- Scan-Pakete, z. B. 100 Dokumente für 4,99 €; Chat-Kontingent monatlich
  inklusive, Aufladung bei Bedarf.
- **Pro:** Jede Nutzung bezahlt sich selbst; kein Abo-Druck; attraktiv
  für Gelegenheitsnutzer.
- **Contra:** Familien beginnen zu rationieren („lohnt sich der Scan
  dieses Briefes?") — genau das Gegenteil der Gewohnheit, die Ordilo
  aufbauen will. Der Wert entsteht durch Vollständigkeit des Archivs;
  Rationierung zerstört ihn. Fühlt sich nach Scanner-App-Nickel-and-
  Diming an und kollidiert mit der Markenlinie. Unplanbarer Umsatz.
- **Fazit:** Passt ökonomisch, aber nicht zum Produkt. Nicht empfohlen.

### Vorschlag C — Familien-Flatrate mit Founding-Angebot

- **Ein Preis pro Familie, alles drin:** 4,99 €/Monat oder 49 €/Jahr
  (2 Monate geschenkt). Keine Feature-Klassen, keine Credits.
- **Prelaunch:** „Founding-Familien" — 2,99 €/Monat auf Lebenszeit für
  die ersten N Familien, alternativ 29 €/Jahr. Erzeugt frühen Umsatz,
  Bindung und Testimonials; Preiserhöhungen treffen nur Neukunden.
- **30 Tage kostenlos testen** statt Free-Tier: voller Funktionsumfang,
  danach Entscheidung.
- **Pro:** Eine Entscheidung statt Tarifdschungel („eine Flatrate für
  die ganze Familie" passt zur warmen Marke); planbarer MRR; keine
  Rationierung; Limits bleiben unsichtbarer Missbrauchsschutz.
- **Contra:** Ohne Free-Tier braucht es Überzeugung vor der Registrierung
  (Landing Page, Trial); Trial-Missbrauch muss adressiert werden
  (E-Mail-Verifizierung, ggf. Zahlungsdaten bei Trial-Start).

## 5. Empfehlung

**C als Zielbild, A-Mechanik als Sicherheitsnetz darunter.** Konkret:

1. **Prelaunch (jetzt):** Founding-Preis 2,99 €/Monat oder 29 €/Jahr,
   30 Tage kostenlos. Wer zahlt, validiert den Preis besser als jede
   Umfrage.
2. **Launch:** 4,99 €/Monat / 49 €/Jahr, ein Plan, Fair-Use-Limits an die
   heutigen Tageslimits angelehnt (50/Tag ≈ weit über Power-Profil).
3. **Später optional:** kleines Free-Kontingent (A) als Top-of-Funnel,
   wenn organisches Wachstum es braucht — technisch dasselbe Entitlement-
   System, nur ein weiterer Plan.
4. **Pay-per-Use (B) verworfen** aus Produkt- und Markengründen.

Bei ~2 € variablen Kosten je typischer Familie bleiben bei 4,99 € über
50 % Marge vor Fixkosten; bei 2,99 € Founding-Preis ist jede Familie
immer noch kostendeckend.

## 6. Wie wir es herausfinden (Messplan)

1. **Schon heute möglich, ohne neuen Code:** Aus `api_usage` und den
   429ern im Admin-Tab ablesen, wie viele Familien an die Tageslimits
   stoßen — das ist die natürliche Grenze zwischen Free und Plus.
2. **DB-Fundament (nächster Schritt, sobald Modell entschieden):**
   `families.plan`-Tier (`founding`, `plus`, `free`) + Entitlements-
   Tabelle; die bestehenden Rate-Limit-Checks lesen dann plan-abhängige
   Limits. Migration idempotent, Default `free`/bisheriges Verhalten.
3. **Fake-Door (Prelaunch-Messung):** `/preise`-Seite mit den zwei
   Founding-Preisen, Klicks als `product_events` (System existiert:
   `recordProductEvent`). Misst echte Kaufabsicht, bevor Stripe angebunden
   wird.
4. **Zahlung (nach Fake-Door-Signal):** Stripe Checkout + Customer
   Portal, Webhook setzt `families.plan`. Erst dann entfallen Limits
   plan-abhängig.
5. **Offenes Kostenrisiko schließen:** Browser-Realtime-Sprachsitzungen
   sind unbepreist (`docs/quality/beta-usage.md`). Vor dem Paid-Launch
   Provider-Abrechnung anbinden oder Feature im Free/Trial begrenzen.

## 7. Offene Entscheidungen

- Founding-Kontingent: feste Anzahl (z. B. 100 Familien) oder Zeitfenster
  (z. B. bis Launch)?
- Trial mit oder ohne Zahlungsdaten bei Start?
- Jahresabo-Rabatt: 2 Monate geschenkt (17 %) oder aggressiver?
- Preisanker auf der Landing Page testen: 4,99 € vs. 5,99 €.
