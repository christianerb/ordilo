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
| **Free-Plan, realistisch** | ~10 Dokumente, ~5 KI-Fragen, ~20 Suchen | **~$0,65** |
| **Free-Plan, am Anschlag** | 25 Dokumente, 10 KI-Fragen, Suchen frei | **~$1,55** (25 × $0,05 + 10 × $0,03) |
| Anschlag heute (alle Tageslimits × 30) | 1.500 Dokumente, 1.500 Chats | **~$120** — zeigt, warum Limits bleiben müssen |

Selbst eine Free-Familie, die jeden Monat beide Limits voll ausreizt,
kostet also ~1,55 $ — weniger als der Zahlungsgebühren-Anteil von zwei
Plus-Monaten. 100 Free-Familien am Anschlag ≈ 155 $/Monat: das ist
das tatsächliche Budget, das der Free-Plan als Marketing kostet.
Speicher und Datenbank fallen nicht ins Gewicht (wenige MB pro
Dokument; Bruchteile von Cents).

Fixkosten dazu: Vercel Pro, Supabase Pro, Resend — grob 50–80 €/Monat,
bei wenigen hundert Familien vernachlässigbar pro Familie.

**Kernaussage:** Eine typische Familie kostet ~2 €/Monat variabel. Jeder
Preis ab ~5 €/Monat trägt die Kosten mit deutlicher Marge
(Zahlungsgebühren ~0,30–0,50 € pro Abo-Buchung eingerechnet).

## 4. Drei Vorschläge

### Vorschlag A — Freemium

- **Free:** 25 Dokumente/Monat, 10 KI-Fragen/Monat, 2 Familienmitglieder,
  kein E-Mail-Import. **Suchen werden nicht gemessen** — unter einem
  halben Cent pro Anfrage, das ist Messrauschen, und ein dritter Zähler
  macht das Modell nur komplizierter.
- **Warum Dokumente großzügig und Fragen knapp (nicht umgekehrt):**
  Ein Dokument kostet einmalig ~5 ct (OCR ~2 ct, Analyse ~3 ct,
  Embeddings ≈ 0) und liegt danach praktisch kostenlos im Archiv.
  Jedes Dokument erhöht den Wert und die Wechselkosten — ein Archiv mit
  200 Dokumenten ersetzt keine Konkurrenz-App mehr. Eine KI-Frage
  kostet ~3 ct, **wiederholt sich aber ewig** und baut keinerlei
  Bindung auf. Dokumente sind außerdem natürlich begrenzt (niemand
  bekommt 500 Briefe im Monat), Chat skaliert mit Spielfreude und ist
  die Missbrauchsfläche. Free-Dokumente sind also eine Investition in
  Unersetzbarkeit, Free-Fragen sind laufender Verbrauch. Anker:
  Trustworthy gibt free 10 KI-Antworten/Monat, fileee 10 Dokumente —
  wir drehen das Verhältnis bewusst um, weil unsere Stückkosten und
  unsere Lock-in-Logik das Gegenteil nahelegen.
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

## 4b. Competitor-Benchmark (Listenpreise, Stand 09/2026)

Quellenlage: ✓ = auf der offiziellen Anbieterseite verifiziert, ~ = aus
Zweitquelle (Review/Preisblog, teils von Wettbewerbern betrieben — mit
Vorsicht). SEO-Preisblogs wie usecalendara.com gehören selbst
Konkurrenzprodukten und sind keine neutralen Quellen.

**Familien-Organizer (Kalender/Listen, teils Dokumentenablage):**

| Produkt | Modell | Preis | Quelle |
| --- | --- | --- | --- |
| FamilyWall Premium | Freemium + Abo, 30 Tage Trial | $4,99/Monat, $44,99/Jahr | ✓ |
| Cozi Gold | Freemium (Werbung) + Jahresabo; ein Kauf gilt für die ganze Familie auf allen Geräten | $39/Jahr, kein Monatsabo | ✓ |
| TimeTree Premium | Freemium + Abo | $4,49/Monat, $44,99/Jahr | ✓ |
| Maple | Freemium + Abo | Preis nicht öffentlich sauber belegt | ~ |
| Skylight Calendar | Hardware + optionales Plus-Abo | ~$300 Gerät + $79/Jahr | ~ |
| Hearth Display | Hardware + Membership | $699 Gerät + Membership | ~ |

**Dokumenten-/Vertrags-Apps (DE-nah):**

| Produkt | Modell | Preis | Quelle |
| --- | --- | --- | --- |
| fileee Free | Freemium-Stufe | 0 €, 10 Dokumente/Monat, werbefrei | ✓ |
| fileee Basic | Abo | €4,99/Monat (€3,99 im Jahresabo), 50 Dok/Monat | ✓ |
| fileee Smart | Abo + Overage | €9,99/Monat (€7,99 im Jahresabo), 100 Dok/Monat, danach €0,10/Dokument | ✓ |
| Volders | Kostenlos, Monetarisierung über Kündigungs-/Wechselservices | 0 € | ✓ |
| SwiftScan | Freemium + Abo/Lifetime | Lifetime-Deals ~$40; Abo-Historie öffentlich als „Abo-Monster" kritisiert | ~ |
| Evernote | Freemium + Abo | zweistellig/Monat; Preiserhöhung 2026 mit massivem Backlash | ~ |
| Google One | Abo | 100 GB für €19,99/Jahr | ✓ |

**KI-Familienassistenten (die eigentliche neue Kategorie):**

| Produkt | Modell | Preis | Quelle |
| --- | --- | --- | --- |
| **Trustworthy (US) — „The Family Operating System®"** | Freemium, 4 Stufen, Jahresabo | s. Detailtabelle unten | ✓ |
| Ohai.ai (US) | Freemium + Premium | Free-Version + Premium ab $9,99/Monat; KI + menschliche Assistenten dahinter | ✓ |
| Duckbill (US) | Membership, 3 Stufen | $99/Monat Individual, $169 Family, $449 VIP — KI + Menschen, „Execution statt Dashboards" | ~ (CNET) |
| Yohana (Panasonic) | High-Touch-Concierge | nicht mehr als eigenständiges Produkt — in PanasonicWELL aufgegangen | ✓ (Panasonic) |
| FamilyOS (familyos.systems) | On-Device, privacy-first | neu, unklar | ~ |

**Trustworthy im Detail** (offizielle Pricing-Seite, 09/2026) — das
nächstliegende Produkt zu Ordilo: Dokumente reinwerfen, automatische
Organisation, Erinnerungen, Chat-Antworten aus dem Archiv, E-Mail-
Import („Inbox Autopilot"). Preise jeweils bei jährlicher Zahlung:

| Stufe | Preis/Monat | Mitglieder | KI-Antworten | Speicher | Bemerkenswert |
| --- | --- | --- | --- | --- | --- |
| Free | $0 (für immer) | 1 | 10/Monat | 2 GB | **keine Erinnerungen**, kein Teilen |
| Silver | $10 | 5 | 25/Monat | 10 GB | Erinnerungen, SecureLinks |
| Gold | $20 | 10 | unbegrenzt | 100 GB | alle Berechtigungen |
| Platinum | $40 | unbegrenzt | unbegrenzt | unbegrenzt | dedizierter Concierge (3 h inkl.) |

Dazu: 50 % Dauerrabatt für Militär, Lehrer, Pflege etc. Die Stufen
metern exakt zwei Dinge: **Mitgliederanzahl** und **KI-Antworten pro
Monat** — beides Entitlements, die wir bereits technisch abbilden
könnten (`chat_usage` zählt Nachrichten pro Familie schon heute).

**Was der Markt uns sagt:**

1. **Der Preisanker für Familien-Organizer ist ~40–50 €/Jahr.** Cozi,
   FamilyWall und TimeTree sitzen alle in diesem Korridor. Unsere
   Empfehlung (49 €/Jahr, 4,99 €/Monat) liegt damit genau im
   etablierten Rahmen — nicht mutig, nicht billig. Founding-Preis
   29 €/Jahr liegt glaubwürdig darunter.
2. **Freemium ist die Markt-Norm in dieser Kategorie.** Alle drei
   Organizer-Konkurrenten haben ein brauchbares Free-Kontingent. Ein
   reines „30 Tage Trial, danach zahlen" (Vorschlag C pur) ist dort die
   Ausnahme. Das schwächt das Argument gegen Vorschlag A: Ein kleines
   Free-Kontingent ist kein Nice-to-have, sondern die Erwartung.
3. **Scanner-Apps leiden unter Abo-Müdigkeit.** SwiftScan wird für
   Abo-Umbauten öffentlich kritisiert, Lifetime-Deals verkaufen sich.
   Bestätigt die Ablehnung von Pay-per-Use/Credits (B) — und erklärt,
   warum ein Founding-Angebot mit Bestandsgarantie funktionieren kann.
4. **Preiserhöhungen bei Bestandskunden sind der Backlash-Fall**
   (Evernote 2026). Ein Founding-Versprechen („2,99 € auf Lebenszeit")
   muss gehalten werden, sonst zerstört es genau das Vertrauen, das die
   Marke aufbaut.
5. **Dokumentenverwaltung allein ist in Deutschland ein Gratis-
   Angebot** (Volders, Google One: 100 GB für ~1,67 €/Monat). Der Preis
   von Ordilo muss am KI-Assistenten und am Familien-Nutzen hängen,
   nicht an „wir scannen eure Briefe".
6. **Kein Wettbewerber verbindet Familien-Organizer mit einem KI-
   Dokumenten-Assistenten.** FamilyWall hat Dokumente als Ablage, aber
   keine Extraktion, keine Fristen, keine Fragen ans Archiv. fileee hat
   Extraktion, aber keinen Familienplan (die eigene FAQ bewirbt ihn als
   „kommt noch") und keinen dialogfähigen Assistenten. Ohai hat den
   Assistenten, aber kein deutsches Dokumentenarchiv mit OCR-Intake.
7. **fileee belegt: Quoten-Freemium funktioniert im deutschen
   Dokumentenmarkt.** 10 Dokumente gratis, 50/100 in den Paid-Stufen,
   €0,10 Overage pro Dokument nur als Nebenmechanik im teuersten Plan.
   Unser Free-Kontingent (25/Monat) ist großzügiger als fileees — bei
   unseren ~5 ct Stückkosten vertretbar, aber die Obergrenze sollte beim
   Launch geprüft werden.
8. **Ohai zeigt Preis-Kopfraum nach oben.** $9,99/Monat (mit Menschen
   im Loop) für genau unser Kernversprechen — Foto vom Schulbrief →
   Termine und Aufgaben. Wer den Assistenten in den Vordergrund stellt,
   kann mehr als €4,99 verlangen; die Organizer-Positionierung
   (Kalender + Listen) deckelt bei ~$45/Jahr.
9. **Duckbill und Yohana markieren Decke und Warnsignal.** Menschen-
   gestützter Concierge für $99–449/Monat ist ein anderes Marktsegment;
   Yohana ist als eigenständiges Produkt in PanasonicWELL aufgegangen —
   High-Touch skaliert nicht in den Familien-Massenmarkt. Ordilos Lücke
   liegt dazwischen: reine Software, Assistenten-Qualität, ~5 €.
10. **Trustworthy beweist, dass Familien für genau dieses Produkt
    $10–20/Monat zahlen.** Automatische Organisation, Erinnerungen,
    KI-Antworten, E-Mail-Import — das ist Ordilos Feature-Set, zum 2–4-
    fachen unseres Zielpreises (US-Markt, USD). Ihre Metrik — KI-
    Antworten pro Monat und Mitgliederanzahl — ist die sauberste
    Entitlement-Achse im Markt und bei uns technisch schon gezählt
    (`chat_usage`, Familienmitglieder). Zwei Lehren: (a) Unser 4,99-€-
    Vorschlag ist eher konservativ; 7,99 €/Monat ist durch Trustworthy
    und Ohai gedeckt. (b) Ihr Free-Plan ist hart kastriert (keine
    Erinnerungen, kein Teilen) — für eine warme Familienmarke die
    falsche Stelle zum Sparen; lieber Mengen (Dokumente, KI-Fragen)
    begrenzen als Grundfunktionen sperren.
11. **Ein Kauf gilt für die ganze Familie** (Cozi explizit, Trustworthy
    über Mitgliederanzahl) — niemand verkauft Familien-Abos pro Person.
    Bestätigt: Preis pro Familie, nicht pro Nutzer.

**Konsequenz für die Vorschläge:** Die saubere Trennung „A oder C" war
zu scharf. Der Markt zeigt: Free-Kontingent (A) als Eintritt +
Flatrate-Abo (C) als Hauptprodukt + Founding-Angebot als Prelaunch-
Motor. Genau diese Kombination wird in Abschnitt 5 empfohlen.

## 4c. Einordnung: Indie-App-Pricing-Erfahrung (Video-Transkript, 09/2026)

Praxisbericht eines Indie-Entwicklers ($200 → $4.000 MRR im Portfolio):
Lifetime $19,99 + monatlich $3,99 mit 7-Tage-Trial, kein Jahresabo,
harte Paywall statt Freemium, Preis-Lokalisierung nach Kaufkraft. Was
davon auf Ordilo überträgt — und was nicht:

**Überträgt sich:**

1. **Lifetime ist ein legitimer Prelaunch-Hebel — mit Rechenpflicht.**
   Sein Kernargument („KI-Kosten sind Cents pro Nutzer und Monat") ist
   auch unsere Rechnung: ~2 €/Monat für eine typische Familie. Ein
   Lifetime-Deal bei 149 € deckt also ~6 Jahre typischer Nutzung. Aber
   Vorsicht: Sein zweites Argument („Nutzer hören eh nach ein paar
   Wochen auf") gilt für Water-Tracker, nicht für ein Familienarchiv.
   Ordilo wird mit jedem Dokument wertvoller — Retention ist hier das
   Feature, nicht das Risiko. Eine Power-Familie (~9 €/Monat) macht
   Lifetime ab ~1,5 Jahren verlustig. **Fazit: Lifetime nur als
   begrenztes Founding-Angebot** (z. B. 100 Familien, 149 € einmalig,
   Fair-Use-Limits bleiben), nicht als Daueroption. Cash im Prelaunch,
   Validierung, Testimonials — ohne dauerhaftes Kostenrisiko.
2. **Zwei Optionen, keine drei.** Sein „No-Brainer-Choice"-Prinzip
   stützt Vorschlag C (ein Plan, ein Preis). Jahresabo als dritte
   Option nennt er verwirrend — für unsere Kategorie (FamilyWall,
   TimeTree, fileee zeigen alle Monat + Jahr mit ~20 % Rabatt) ist der
   Jahrespreis aber Markt-Standard und passt zum Familien-Rhythmus.
   Kompromiss: Free + ein Paid-Plan, dargestellt als „monatlich oder
   jährlich", nicht als zwei Tarife.
3. **Keine Dark Patterns im Paywall** (Timer, Fake-Deals, versteckte
   Paywalls) — deckt sich zu 100 % mit der Markenlinie (DESIGN.md
   lehnt Upsell-Banner explizit ab) und mit dem Apple-Review-Risiko.
4. **Preis aus Sicht der Zielgruppe, nicht der eigenen Marge.**
   Deutsche Familien mit klammer Kassenlage sind Teil der Zielgruppe —
   4,99 € ist ein No-Brainer, 19,99 € nicht. Stützt den Preis-Korridor.

**Überträgt sich nicht bzw. widerspricht:**

5. **„Harte Paywall statt Freemium" — für Ordilo falsch.** Sein
   Argument: Freemium lohnt sich nur für Top-1-%-Apps mit organischem
   Sharing. Genau das hat eine Familien-App aber eingebaut: Der Partner-
   Invite ist ein natürlicher Viral-Loop, den ein Wasser-Tracker nicht
   hat. Dazu ist Free in dieser Kategorie Markt-Norm (alle Organizer,
   fileee, Trustworthy, Ohai). Und Trustworthy zeigt die harte Variante
   bereits im Markt — deren Free-Plan ist bewusst kastriert. Unsere
   Position dazwischen: großzügiges Free in den Mengen, kein Kastrieren
   von Grundfunktionen.
6. **7-Tage-Trial ist für Wochen-Rhythmen zu kurz.** Seine Apps liefern
   Wert beim ersten Öffnen. Ordilo liefert Wert, wenn der nächste Brief
   kommt — das kann 10 Tage dauern. 30 Tage Trial bleibt; die
   Trial-Länge (7/14/30) ist trotzdem eine offene Messfrage.
7. **Wochen-Abo und aggressive Preis-Lokalisierung:** irrelevant für
   den DE-first Launch (Lokalisierung notieren für spätere Märkte).

Seine eigene Warnung gilt auch hier: Was für eine Vibe-coded Tracker-
App mit null Serverkosten funktioniert, ist keine Blaupause für ein
Archiv-Produkt mit echten laufenden KI-Kosten pro Familie.

## 4d. Einheitsökonomie: Was von 4,99 € wirklich übrig bleibt

Der Listenpreis ist nicht der Umsatz. Reihenfolge der Abzüge pro
Monatsabo (4,99 €, inkl. 19 % MwSt.):

| Kanal | Brutto | − MwSt. (19 %) | − Gebühr | = Netto |
| --- | --- | --- | --- | --- |
| Web (Stripe, EU-Karte ~1,4 % + 0,25 €) | 4,99 € | 4,19 € | −0,31 € | **~3,88 €** |
| iOS (App Store, Small Business 15 %) | 4,99 € | 4,19 € | −0,63 € | **~3,56 €** |
| iOS ohne Small Business (30 %) | 4,99 € | 4,19 € | −1,26 € | **~2,93 €** |
| Jahresabo 49 € (Web, pro Monat gerechnet) | 4,08 € | 3,43 € | −0,08 €* | **~3,35 €** |

\* eine Stripe-Gebühr pro Jahr statt zwölf. Jahresabo glättet zusätzlich
Cashflow und Churn-Messung.

Dagegen die variablen Kosten (Abschnitt 3):

| Familien-Profil | Kosten/Monat | Marge Web (3,88 €) | Marge iOS (3,56 €) |
| --- | --- | --- | --- |
| Typisch (~2 $) | ~1,85 € | **~2,00 € (52 %)** | ~1,70 € (48 %) |
| Engagiert (~5 $) | ~4,60 € | **−0,70 €** | −1,00 € |
| Power am Fair-Use-Anschlag (~9 $) | ~8,30 € | **−4,40 €** | −4,70 € |

**Ehrliche Antwort: Ja, bei voller Ausnutzung ist 4,99 € Casino.** Das
Modell trägt sich nur unter drei Bedingungen:

1. **Die Verteilung rettet uns, nicht der Preis.** Familien-Apps zeigen
   starke Saisonalität (Schulanfang, Versicherungswechsel) und danach
   ruhige Monate. Erwartbarer Mittelwert über zahlende Familien:
   1,50–2,50 € Kosten. Die Power-Familie mit 8 €+ ist die Ausnahme —
   aber genau deshalb braucht Plus **Fair-Use-Kappen** (z. B. 100
   KI-Fragen/Monat, 100 Dokumente/Monat), die den p99 unter ~3 € halten.
   Die heutigen Tageslimits (50/Tag!) sind als Obergrenze für ein
   5-€-Abo viel zu hoch.
2. **Bei ~1,70–2,00 € Deckungsbeitrag ist CAC der Engpass, nicht die
   Marge.** Faustformel: 6 % Monats-Churn (Consumer-typisch) → ~16
   Monate Lebensdauer → ~28 € Deckungsbeitrag auf Lebenszeit. CAC darf
   also nur ~10 € betragen — klassische Paid Ads sind damit praktisch
   unbezahlbar. **Konsequenz: Akquise muss über Invite-Loop, ASO und
   Content laufen, nicht über Ads.** Das ist eine Strategie-Entscheidung,
   keine Marketing-Feinheit.
3. **7,99 € ändern die Welt mehr als jede Optimierung.** Bei 7,99 €
   (Web ~6,20 €, iOS ~5,70 € netto) verdoppelt sich der Deckungsbeitrag
   auf ~4 €/Monat, CAC-Decke steigt auf ~20 €, und selbst engagierte
   Familien bleiben profitabel. Trustworthy ($10–20) und Ohai ($9,99)
   belegen die Zahlungsbereitschaft. **Empfehlung daher: Fake-Door
   testet 4,99 € gegen 7,99 € — nicht als Feinheit, sondern weil die
   Einheitsökonomie bei 4,99 € von Disziplin abhängt und bei 7,99 €
   robust ist.**

Fixkosten-Einordnung: Vercel/Supabase/Resend ~60 €/Monat → ~35 zahlende
Familien decken die Infrastruktur. Gründerzeit ist hier bewusst nicht
eingerechnet.

## 4e. Marktgröße und Wirtschaftlichkeit (DE/DACH)

**Markt (Destatis/Mikrozensus):** ~8,2 Mio Familien mit minderjährigen
Kindern in Deutschland (dabei 1,62 Mio Alleinerziehende), DACH grob
~10 Mio. Unser Kernsegment: Eltern, die den „Papierkram-Haushalt"
digital führen — konservativ 15–20 % zahlen grundsätzlich für Apps →
**SAM ~1,5–2 Mio Familien**. Realistischer 3–5-Jahre-Anteil: 0,5–2 %
davon = **10.000–40.000 zahlende Familien** (SOM).

**Benchmarks (RevenueCat State of Subscription Apps 2026, 115k Apps):**

| Kennzahl | Wert | Was es für uns heißt |
| --- | --- | --- |
| Freemium Download→Paid (Tag 35) | 2,1 % | Free konvertiert langsam — Geduld einplanen |
| Hard Paywall Download→Paid | 10,7 % (5×) | Der Indie aus 4c hat datenseitig recht; unser Free bleibt trotzdem wegen Invite-Loop und Kategorie-Norm |
| Trial→Paid, 17–32 Tage | 42,5 % | Unser 30-Tage-Trial ist der starke Hebel |
| Trial→Paid, <4 Tage | 25,5 % | Kurze Trials opfern Conversion für schnelles Cash |
| Jahresabo: Kündigung Auto-Renewal in Monat 1 | 35 % | Jahr 2 muss ab Woche 1 verdient werden |
| Jahresabo: Erneuerung nach Jahr 1 | ~28 % | Jahresabo ≈ „1 Jahr sicher, danach neu gewinnen" |
| KI-Apps: LTV-Premium Jahr 1 | +41 % ($30,16 vs. $21,37) | KI verkauft sich |
| KI-Apps: Churn | 36 % schneller | KI-Novellety allein hält nicht — unser Archiv-Lock-in ist genau das Gegenmittel |
| Median-Jahres-Retention (Jahresabo, Freemium) | 28 % | konsistent mit oben |
| CAC Mobile (Benchmark) | $1–5 pro Install, $20–80 pro zahlendem Nutzer | Paid UA bei 5–8 €-Preisen nur organisch schönrechnbar |

**Wirtschaftlichkeit bei 7,99 €/Monat (netto ~6,20 € Web / ~5,70 € iOS):**

- Deckungsbeitrag pro typischer Familie: **~4 €/Monat** (nach ~2 €
  KI-Kosten).
- LTV-Deckungsbeitrag bei 6 % Monats-Churn (~16 Monate): **~65–70 €**
  → CAC-Decke (3:1): **~20 €**. Paid Ads liegen bei $20–80 pro zahlen-
  dem Nutzer: grenzwertig — der Invite-Loop bleibt der Hauptkanal.

**Szenarien (50/50 Web/iOS-Mix, Jahresanteil 60 %):**

| Zahlende Familien | Netto-Umsatz/Monat | − KI-Kosten | − Free-Kosten* | Deckungsbeitrag/Monat |
| --- | --- | --- | --- | --- |
| 1.000 | ~5.900 € | ~2.000 € | ~700 € | **~3.200 €** |
| 5.000 | ~29.500 € | ~10.000 € | ~3.500 € | **~16.000 €** |
| 20.000 | ~118.000 € | ~40.000 € | ~14.000 € | **~64.000 €** |

\* angenommen: 10 Free-Familien pro zahlender Familie à 0,70 €.
Fixkosten (~60 €/Monat Infrastruktur) sind hier vernachlässigbar;
Gründergehälter sind es nicht — ~5.000 zahlende Familien tragen ca.
zwei Vollzeitgehälter.

**Einordnung:** Das ist ein gesundes Kleinunternehmen bei 5–20k
Familien, kein Venture-Case. Der Hebel nach oben ist DACH → EU
(Lokalisierung) und der Assistenten-Preis, nicht das Dokumentenvolumen.

## 5. Empfehlung

**C als Zielbild, A-Mechanik als Sicherheitsnetz darunter.** Konkret:

1. **Prelaunch (jetzt):** Founding-Angebot, zwei Varianten zur Wahl
   stellen: 2,99 €/Monat auf Lebenszeit **oder** 149 € einmalig
   (Lifetime, auf ~100 Familien begrenzt). Lifetime deckt bei ~2 €
   Monatskosten ~6 Jahre typischer Nutzung und bringt sofort Cash;
   die Begrenzung hält das Risiko klein (s. 4c). 30 Tage kostenlos
   testen. Wer zahlt, validiert den Preis besser als jede Umfrage. Alle
   Founding-Versprechen sind bindend — der Evernote-Backlash 2026
   zeigt, was passiert, wenn Bestandspreise nachträglich kippen.
2. **Launch:** **7,99 €/Monat, 79 €/Jahr** („2 Monate geschenkt",
   ~17 % Rabatt; die 20-%-Variante wäre 76,70 € — 79 € ist die
   sauberere Zahl). Begründung in 4d: 4,99 € hängt an Disziplin,
   7,99 € ist robust — und Trustworthy ($10–20) sowie Ohai ($9,99)
   belegen die Zahlungsbereitschaft über dem Organizer-Korridor. Ein
   Plan, zwei Laufzeiten, Fair-Use-Kappen (z. B. 100 Dokumente, 100
   KI-Fragen/Monat) statt der heutigen 50/Tag-Limits. Vor dem Launch
   per Fake-Door gegen 4,99 € testen — kostet nichts, entscheidet mit
   echten Klicks.
3. **Free-Kontingent ab Launch, nicht optional:** Der Benchmark zeigt,
   dass Freemium in dieser Kategorie Erwartung ist, nicht Zugeständnis.
   Kontingent (25 Dokumente/Monat, 10 KI-Fragen/Monat, Suchen frei —
   Begründung in Vorschlag A) als Top-of-Funnel — technisch dasselbe
   Entitlement-System, nur ein weiterer Plan. Variable Kosten einer
   Free-Familie (≈$0,65 realistisch, ≈$1,55 am Anschlag) sind das
   Marketing-Budget.
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
  (z. B. bis Launch)? Und: Lifetime-Variante (149 € einmalig) neben dem
  2,99-€-Dauerpreis anbieten oder nur eine Variante?
- Trial-Länge: 30 Tage (Familien-Rhythmus, Briefe kommen nicht täglich)
  oder kürzer (7–14 Tage, Indie-Erfahrung sagt: kürzer konvertiert
  besser)? Messbar per A/B, sobald der Fake-Door steht.
- Trial mit oder ohne Zahlungsdaten bei Start?
- Jahresabo-Rabatt: 2 Monate geschenkt (17 %) oder aggressiver?
- Preisanker auf der Landing Page testen: 4,99 € vs. 5,99 €.
- Free-Kontingent: 25 Dokumente/Monat (großzügig) oder fileee-nah
  10/Monat (schnellerer Upgrade-Druck)? Erst Fake-Door-Messung, dann
  festlegen.
- Positionierung testen: „Organizer-Preis" (4,99 €, Korridor-Konform)
  vs. „Assistenten-Preis" (7,99–9,99 €, Ohai-/Trustworthy-nah) — der
  Fake-Door kann beide Preise gegenüberstellen.
- Metering-Achse: KI-Fragen pro Monat staffeln (Trustworthy-Vorbild:
  10/25/unbegrenzt) statt oder zusätzlich zu Dokumenten? Chat-Nutzung
  wird schon pro Familie gezählt — Umsetzung wäre klein.
- Werbung im Free-Plan: **erwogen und verworfen.** Ad-Erlöse liegen bei
  Cents pro Nutzer und Monat und brauchen Millionen DAU (Cozi-Skala);
  Werbung in einer App mit Schulbriefen, Rechnungen und Arztberichten
  widerspricht dem Vertrauensversprechen (Trustworthy wirbt mit „never
  shared, sold, or monetized") und der Markenlinie (DESIGN.md: keine
  Upsell-/Scanner-Muster). DSGVO-Consent und Ad-SDKs kämen obendrauf.
  Der Free-Plan ist das Marketing — über den Partner-Invite, nicht über
  Banner.
