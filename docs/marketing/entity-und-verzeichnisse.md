# Ordilo: Entity-Kit, Verzeichnisse und GEO-Messung

Stand: 22. Oktober 2026. Zweck: Ordilo überall mit **denselben Fakten** beschreiben,
damit Suchmaschinen und KI-Assistenten die Marke eindeutig zuordnen können. Dieses
Dokument ist ein Arbeitskit, keine Garantie für Listungen, Rankings oder KI-Zitate.

Grundregeln (aus `PRODUCT.md` und `seo-geo-strategie.md`):

- Es gibt **keine** Testimonials, Nutzerzahlen, Bewertungen oder Presse. Nichts davon erfinden,
  auch nicht in Verzeichnis-Formularen („Anzahl Nutzer“, „Kundenstimmen“ leer lassen).
- Fakten nur aus dem Repository (Impressum, Datenschutz, Hilfe, App-Store-Notizen).
  Was hier nicht belegt ist, steht als **offen**.
- Ändert sich ein Fakt (Preis, Plattform, Länder), zuerst die Faktentabelle unten ändern,
  dann alle Profile nachziehen. Die Tabelle ist die Quelle der Wahrheit.

## 1. Kanonische Beschreibung

Alle drei Fassungen enthalten dieselben Kernfakten: deutschsprachig, für Familien,
scannen, gemeinsam ablegen, Fragen mit Fundstelle, Fristen, iPhone und Web,
kostenlos im Kern, Plus für Live-Gespräch.

**Ein Satz (DE):**

> Ordilo ist eine deutschsprachige Dokumenten-App für Familien: Briefe scannen, gemeinsam ablegen und Fragen an die eigenen Unterlagen stellen, mit Antwort und Fundstelle.

**Ein Satz (EN, für internationale Verzeichnisse):**

> Ordilo is a German-language document app for families: scan letters, share one family archive and ask questions about your own paperwork, with answers that cite the source page.

**Etwa 50 Wörter (DE):**

> Ordilo ist eine deutschsprachige Dokumenten-App für Familien. Ihr scannt Briefe oder fügt PDFs hinzu, prüft die erkannten Angaben und legt alles in einem gemeinsamen Familienbereich ab. Fragen an eure Unterlagen beantwortet Ordilo mit Fundstelle. Fristen werden zu Aufgaben mit Erinnerung. Scannen und Fragen sind kostenlos, für iPhone und im Browser.

**Etwa 150 Wörter (DE):**

> Ordilo ist eine deutschsprachige Dokumenten-App für Familien. Sie hilft Eltern, Briefe von Kita, Schule, Versicherung oder Vermieter gemeinsam im Griff zu behalten. Ihr scannt einen Brief mit dem iPhone oder fügt ein Foto oder PDF hinzu. Ordilo erkennt wichtige Angaben wie Fristen, Beträge und Nummern. Ihr prüft sie und bestätigt, was übernommen wird. Aus Fristen werden Aufgaben mit Erinnerung, die ihr einer Person zuordnen könnt. Später stellt ihr einfach eine Frage, zum Beispiel „Wann ist der Treffpunkt?“, und bekommt eine Antwort mit Fundstelle im Original. Die ganze Familie nutzt einen gemeinsamen Bereich, weitere Personen kommen per Einladung dazu. Scannen, Fragen und Diktieren sind kostenlos. Ordilo Plus ergänzt ein Live-Gespräch mit gesprochenen Antworten für 7,99 € im Monat oder 79,99 € im Jahr, für die ganze Familie. Dokumente liegen auf Servern in der EU; die KI-Analyse über OpenAI und Datalab startet erst nach Einwilligung. Betreiber ist die Erb Invest UG (haftungsbeschränkt) aus Hamburg.

## 2. Kanonische Fakten

| Fakt | Wert | Beleg im Repo |
| --- | --- | --- |
| Name | Ordilo | `src/lib/marketing.ts` |
| Name im App Store | Ordilo: Dokumente & Scanner | `docs/marketing/app-store-listing.md` |
| Untertitel im App Store | Papierkram für Familien ordnen | `docs/marketing/app-store-listing.md` |
| Kategorie | Dokumenten-App für Familien; App-Store-Kategorie Produktivität | `PRODUCT.md`, `app-store-listing.md` |
| Plattformen | iPhone (iOS) und Web-App im Browser | `PRODUCT.md`, `/hilfe` |
| Android | Keine native Android-App (geplant laut `PRODUCT.md`, ohne Datum) | `PRODUCT.md` |
| Sprache | Deutsch | `app-store-listing.md` |
| App-Store-Länder | Deutschland, Österreich, Schweiz | `seo-geo-strategie.md` (App Store Connect, 21.10.2026) |
| Version 1.0 | Seit 6. Oktober 2026 bereit für den Vertrieb | `seo-geo-strategie.md` |
| Altersfreigabe | 4+ (von Apple berechnet) | `app-store-listing.md` |
| Kostenlos | Scannen, Fragen mit Fundstelle, Diktieren, Ablage, Aufgaben, Erinnerungen | `/hilfe`, `/datenschutz` |
| Ordilo Plus | Live-Gespräch mit gesprochenen Antworten; 7,99 €/Monat oder 79,99 €/Jahr (DE); gilt für die ganze Familie; Abo über Apple | `/hilfe` |
| Plus-Kontingent | Zunächst 10 Live-Gespräche pro Familie und Monat, je höchstens 5 Minuten | `PRODUCT.md` |
| Speicherort | Server in der EU (Supabase) | `/datenschutz` |
| KI-Verarbeitung | OpenAI (Analyse, Antworten, Sprache) und Datalab (Texterkennung), erst nach Einwilligung; Übermittlung in die USA möglich (Standardvertragsklauseln) | `/datenschutz` |
| Training | Über die OpenAI-API übermittelte Inhalte werden nicht zum Training verwendet | `/datenschutz` |
| Website | https://ordilo.de | `src/lib/marketing.ts` |
| App Store | https://apps.apple.com/de/app/ordilo-dokumente-scanner/id6805133943 | `src/lib/marketing.ts` |
| Instagram | https://www.instagram.com/ordiloapp/ (Nutzername `ordiloapp`) | `src/lib/marketing.ts` |
| Kontakt | info@ordilo.de | `/hilfe` |
| Betreiber | Erb Invest UG (haftungsbeschränkt) | Impressum |
| Sitz | Hamburg | Impressum |
| Handelsregister | Amtsgericht Hamburg, HRB 142639 | Impressum |
| Geschäftsführer | Christian Erb | Briefing; vor Veröffentlichung mit Impressum abgleichen |
| Gründungsdatum Ordilo | **offen** | — |
| Gründungsdatum Erb Invest UG | **offen** | — |
| Nutzerzahlen, Downloads, Bewertungen | **nicht erhoben / keine** – nie Zahlen nennen | `PRODUCT.md` |
| Logo | https://ordilo.de/icons/icon-512.png | `src/lib/marketing.ts` |

## 3. Wikidata-Vorschlag

**Erst prüfen, dann anlegen.** Wikidata nimmt Einträge nur auf, wenn sie die
[Relevanzkriterien](https://www.wikidata.org/wiki/Wikidata:Notability) erfüllen, zum
Beispiel über unabhängige, seriöse Quellen. Solange es keine Presse über Ordilo gibt,
kann ein neuer Eintrag gelöscht werden. Empfehlung: anlegen, sobald mindestens ein
unabhängiger Bericht (Presse, Fachportal) existiert, und diesen als Referenz angeben.
Den Eintrag mit einem offen benannten Konto anlegen (Verbindung zu Ordilo auf der
Benutzerseite angeben, siehe Wikidata-Regeln zu Interessenkonflikten).

Alle Q-IDs außer den im Briefing genannten vor dem Speichern über die Wikidata-Suche
bestätigen. Diese Umgebung konnte wikidata.org nicht direkt abrufen.

### Bezeichnungen

| Sprache | Bezeichnung | Beschreibung | Auch bekannt als |
| --- | --- | --- | --- |
| de | Ordilo | Dokumenten-App für Familien | Ordilo: Dokumente & Scanner |
| en | Ordilo | German document organizer app for families | Ordilo: Dokumente & Scanner |

### Aussagen

| Eigenschaft | ID | Wert | Sicherheit |
| --- | --- | --- | --- |
| ist ein(e) | P31 | Mobile App (Q620615) | im Briefing genannt |
| ist ein(e) | P31 | Webanwendung (Q189210) | Q-ID prüfen |
| offizielle Website | P856 | https://ordilo.de | sicher |
| Entwickler | P178 | Erb Invest UG (haftungsbeschränkt) | braucht eigenes Item, siehe unten |
| Betriebssystem | P306 | iOS (Q48493) | sicher |
| Sprache des Werks | P407 | Deutsch (Q188) | sicher |
| Ursprungsland | P495 | Deutschland (Q183) | sicher |
| Instagram-Benutzername | P2003 | ordiloapp | sicher |
| App-Store-App-ID | P3861 | 6805133943 | Eigenschaft vor Eintragen prüfen |
| Gründung / Erscheinungsdatum | P571 / P577 | **offen** – nicht eintragen | — |

Nicht eintragen: Nutzerzahlen, Bewertungen, Personen (der Geschäftsführer ist eine
Privatperson ohne eigenen Wikidata-Eintrag).

Für P178 braucht es ein Item „Erb Invest UG (haftungsbeschränkt)“ (P31 Unternehmen,
P159 Hauptsitz Hamburg Q1055, P17 Deutschland Q183). Wenn das Unternehmen die
Relevanzkriterien nicht erfüllt, P178 weglassen statt ein schwaches Item anzulegen.

### QuickStatements (Version 1, Spalten mit Tabulator getrennt)

```text
CREATE
LAST	Lde	"Ordilo"
LAST	Len	"Ordilo"
LAST	Dde	"Dokumenten-App für Familien"
LAST	Den	"German document organizer app for families"
LAST	Ade	"Ordilo: Dokumente & Scanner"
LAST	P31	Q620615
LAST	P306	Q48493
LAST	P407	Q188
LAST	P495	Q183
LAST	P856	"https://ordilo.de"
LAST	P2003	"ordiloapp"
```

P31 Webanwendung, P3861 und P178 erst nach Prüfung von Hand ergänzen. Zu jeder Aussage
eine Referenz setzen (P854 Referenz-URL, z. B. https://ordilo.de/impressum oder die
App-Store-Seite).

## 4. Verzeichnisse (priorisiert)

Bedingungen, Gebühren und Zeichenlimits der Verzeichnisse konnten am 22.10.2026 nicht
live geprüft werden. Vor jeder Einreichung auf der Seite des Verzeichnisses prüfen.
Bezahlte „Featured“-Plätze nicht ohne Freigabe buchen. Felder für Nutzerzahlen,
Bewertungen oder Kundenlogos leer lassen.

| Prio | Verzeichnis | Passung | Sprache | Hinweis |
| --- | --- | --- | --- | --- |
| P0 | AlternativeTo | Gut: Endnutzer suchen Alternativen | EN | Als Alternative zu passenden Kategorien eintragen (z. B. Dokumentenverwaltung), nur ehrliche Vergleiche |
| P0 | Product Hunt | Gut für Sichtbarkeit und Backlink, aber englischsprachiges Publikum | EN | Launch planen (siehe `launch`-Ablauf); klar sagen, dass die App Deutsch ist |
| P1 | SaaSHub | Mittel | EN | Schneller Eintrag, Kategorie Dokumentenverwaltung/Produktivität |
| P1 | There's An AI For That | Mittel: KI-Verzeichnis | EN | Einreichung oft kostenpflichtig – vorher prüfen |
| P1 | Futurepedia | Mittel: KI-Verzeichnis | EN | Einreichung oft kostenpflichtig – vorher prüfen |
| P1 | Deutsche iOS-Portale (z. B. iphone-ticker.de, appgefahren.de, Apfelpage) | Gut: deutsches iPhone-Publikum | DE | Keine Verzeichnisse, sondern Redaktionen: kurzer Hinweis an die Redaktion, keine Erwartung einer Veröffentlichung |
| P1 | Eltern- und Familienportale (z. B. Eltern-Ratgeber, Familienblogs) | Gut: Zielgruppe | DE | Nur Redaktionen oder Blogger mit echtem Bezug ansprechen, siehe PR-Ansätze |
| P2 | OMR Reviews | Schwach: vor allem B2B-Software | DE | Nur eintragen, wenn Kategorie für Verbraucher-Apps passt |
| P2 | Capterra / GetApp DE | Schwach: B2B-Software-Vergleich | DE | Eintrag wahrscheinlich nicht passend; nur prüfen, nicht erzwingen |

### Einreichungstexte

**AlternativeTo (EN)**
- Name: Ordilo
- Short description: German-language document app for families: scan letters, share one family archive and ask questions with answers that cite the source.
- Description: Ordilo helps families keep track of letters from school, insurers or landlords. Scan a letter with your iPhone or add a photo or PDF. Ordilo suggests key details like deadlines and amounts; you check and confirm them. Deadlines become tasks with reminders. Ask questions in plain German and get an answer with the source page. Scanning and questions are free. Ordilo Plus adds live voice conversations (EUR 7.99/month or EUR 79.99/year, whole family). Available for iPhone and in the browser. Data is stored in the EU; AI processing via OpenAI and Datalab only after consent.
- Platforms: iPhone, Web. License: Freemium / proprietary.

**Product Hunt (EN)**
- Tagline: Your family's paperwork, answered with sources
- Description: Ordilo is a German-language document app for families. Scan letters, confirm the extracted details, share one family archive and ask questions like "When is the school trip meeting point?" – every answer links to the source. Free to scan and ask; Plus adds live voice talk.
- Erster Kommentar (Maker): wer dahintersteht (Erb Invest UG, Hamburg), warum Familien-Papierkram, was kostenlos ist, wo Daten liegen, was die App nicht kann (kein Android, nur Deutsch). Keine Upvote-Bitten in Gruppen, keine gekauften Stimmen.

**SaaSHub (EN)**
- Tagline: Family document app with answers from your own paperwork
- Description: kurze EN-Fassung aus Abschnitt 1.

**There's An AI For That / Futurepedia (EN)**
- Task / Use case: Organize family documents and ask questions about them
- Description: Ordilo reads scanned letters and PDFs, suggests details for you to confirm, and answers questions across your family's documents with a cited source. German-language, iPhone and web. Free core, paid Plus for live voice.
- Pricing: Freemium (Plus EUR 7.99/month or EUR 79.99/year).

**Deutsche iOS-Portale und Familienredaktionen (DE, kurze Mail)**
> Betreff: Neue iPhone-App für Familienpapierkram: Ordilo
>
> Hallo [Name], Ordilo ist eine deutschsprachige Dokumenten-App für Familien. Man scannt Briefe, prüft erkannte Fristen und fragt später einfach nach, etwa „Wann ist der Treffpunkt?“ – mit Fundstelle im Original. Scannen und Fragen sind kostenlos. Wir sind ein kleines Hamburger Team (Erb Invest UG). Falls das für eure Leser passt, schicke ich gern einen Zugang und Screenshots. Viele Grüße, [Name]
>
> App Store: https://apps.apple.com/de/app/ordilo-dokumente-scanner/id6805133943

**OMR Reviews / Capterra / GetApp (DE, nur falls Kategorie passt)**
- Kurzbeschreibung: 50-Wörter-Fassung aus Abschnitt 1.
- Zielgruppe: Familien und Privathaushalte (nicht Unternehmen).

### Tracking der Einreichungen

| Datum | Verzeichnis | Status | Profil-URL | Kosten | Backlink (follow/nofollow) | Nächster Schritt |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

## 5. Community-Playbook (ehrlich)

Ziel: hilfreich sein, wo Familien nach Lösungen fragen. Nicht: Links verteilen.

- **Immer offenlegen:** „Ich arbeite an Ordilo“ bzw. „Ich bin der Gründer“ – im
  Beitrag selbst, nicht nur im Profil.
- **Keine Fake-Konten, keine Sockenpuppen, keine bezahlten Empfehlungen ohne
  Kennzeichnung**, keine Bitte an Freunde, „zufällig“ zu empfehlen.
- **Erst helfen, dann erwähnen:** Antwort muss ohne Ordilo nützlich sein (Ordnerstruktur,
  Scan-Tipp, Fristen-Routine). Ordilo nur nennen, wenn es zur Frage passt, und
  Alternativen fair mit nennen (Papierordner, Cloud-Ordner, paperless-ngx).
- **Regeln der Community lesen:** Viele Subreddits und Foren verbieten Eigenwerbung
  ganz oder erlauben sie nur in bestimmten Threads. Im Zweifel Moderation fragen.
- **Orte:** passende deutschsprachige Subreddits (Eltern-, Organisations- und
  Technikthemen, nur bei echtem Bezug), gutefrage.net, Elternforen. Pro Woche
  wenige, gute Antworten.
- **Antworten auf eigene Ratgeber verlinken** statt auf die Startseite, wenn sie die
  Frage besser beantworten (z. B. `/ratgeber/dokumenten-app-familie-vergleich`).
- **Kritik stehen lassen** und sachlich antworten. Keine Bewertungen schönen.
- Kontaktaufnahme zu Creators und Redaktionen vorher intern freigeben
  (`seo-geo-strategie.md`, Abschnitt 8).

## 6. PR-Ansätze (ohne erfundene Zahlen)

1. **„Wer denkt an den Kita-Brief?“** – Mental Load beim Papierkram; Ordilo als
   Werkzeug, das Zuständigkeiten sichtbar macht. Belegt mit eigenem Ratgeber
   `/ratgeber/mental-load-familie`, nicht mit Umfragewerten.
2. **KI und Familiendokumente transparent** – was passiert mit einem gescannten Brief,
   wann fragt Ordilo nach Einwilligung, wo liegen die Daten, warum OpenAI und Datalab.
   Ehrlichkeit als Geschichte.
3. **Fairer Vergleich statt Werbung** – der Ratgeber „Dokumenten-App für Familien:
   welche Lösung passt?“ inklusive „Wann Ordilo nicht passt“ als Angebot für
   Verbraucher- und Elternredaktionen.
4. **Kleines Hamburger Team baut Familien-App** – Gründergeschichte; nur belegbare
   Daten (Start Version 1.0 im Oktober 2026, DE/AT/CH).
5. **Demo statt Behauptung** – ein erfundener, als Beispiel gekennzeichneter Brief vom Scan bis zur Antwort mit Fundstelle als Video für Redaktionen.

Nie: erfundene Studien, Nutzerzahlen, „bekannt aus“-Logos, Expertenzitate ohne echte Person.

## 7. Setup-Checkliste: Search Console, Bing, IndexNow

**Google Search Console**
- [ ] Domain-Property `ordilo.de` per DNS-TXT-Eintrag bestätigen.
- [ ] Sitemap `https://ordilo.de/sitemap.xml` einreichen.
- [ ] Neue Ratgeber per URL-Prüfung zur Indexierung anfragen (inkl. beider Vergleichsartikel).
- [ ] Bericht „Seiten“: indexiert vs. ausgeschlossen dokumentieren (Baseline).
- [ ] Leistungsbericht: 28-Tage-Baseline Brand vs. Non-Brand speichern.
- [ ] Rich-Results-Test für eine Ratgeberseite (BlogPosting, BreadcrumbList).

**Bing Webmaster Tools**
- [ ] Website über „Import aus Google Search Console“ hinzufügen (oder DNS/Meta bestätigen).
- [ ] Sitemap `https://ordilo.de/sitemap.xml` einreichen.
- [ ] URL-Prüfung für Startseite, `/hilfe` und Vergleichsartikel.
- [ ] Bing ist Grundlage mehrerer KI-Suchen; daher nicht auslassen.

**IndexNow**
- [ ] Der Schlüssel liegt als `public/<schlüssel>.txt` im Repo (Wert: `INDEXNOW_KEY`
      in `src/lib/marketing.ts`). Nach Deployment prüfen: `https://ordilo.de/<schlüssel>.txt`
      liefert den Schlüssel als reinen Text.
- [ ] Ping-Skript: `node scripts/indexnow.mjs /ratgeber/<slug>` nach Deployment mit den
      geänderten Pfaden ausführen (ohne Argumente: alle URLs aus der Sitemap).
- [ ] Nur echte Inhaltsänderungen melden, nicht bei jedem Build alle URLs.
- [ ] In Bing Webmaster Tools unter IndexNow prüfen, ob Meldungen ankommen.
- [ ] Hinweis: Google nutzt IndexNow nicht; dort bleiben Sitemap und Search Console maßgeblich.

**Crawler**
- [ ] `src/app/robots.ts` erlaubt öffentliche Seiten für alle Bots; private Routen
      sind ausgeschlossen. Bingbot und OAI-SearchBot nicht blockieren.

## 8. GEO-Messung: Vorlage

Promptset aus `seo-geo-strategie.md`, Abschnitt 9 (GEO-Promptset), ergänzt um zwei
Vergleichsfragen zu den neuen Ratgebern:

1. Wie organisiere ich Papierkram gemeinsam mit meinem Partner?
2. Welche App hilft Familien bei Kita- und Schulbriefen?
3. Wie finde ich Termine in eingescannten Briefen wieder?
4. Brauche ich eine zusätzliche Scanner-App auf dem iPhone?
5. Was unterscheidet eine Familienablage von einem Cloud-Ordner?
6. Was kostet Ordilo und welche Funktionen sind kostenlos?
7. Wo verarbeitet Ordilo meine Dokumente?
8. Wie kann ich Fragen an meine eigenen Unterlagen stellen?
9. *(neu)* Welche Dokumenten-App ist gut für Familien?
10. *(neu)* Soll ich für meine Dokumente Ordilo oder ChatGPT nutzen?

Messregeln: jede Frage in neuem Chat bzw. ohne Verlauf, angemeldet/abgemeldet notieren,
Sprache Deutsch, Standort Deutschland. Alle 4–6 Wochen wiederholen. „Nein“ ist ein
gültiges Ergebnis; nichts schönrechnen. Antwort-Screenshot im Ordner ablegen.

| Datum | Plattform | Modell | Suchmodus / angemeldet | Prompt-Nr. | Prompt | Ordilo erwähnt? (ja/nein) | Fakten korrekt? | zitierte URL | Wettbewerber genannt | Beleg (Screenshot-Datei) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-__-__ | ChatGPT | | | 1 | Wie organisiere ich Papierkram gemeinsam mit meinem Partner? | | | | | |
| 2026-__-__ | Perplexity | | | 1 | Wie organisiere ich Papierkram gemeinsam mit meinem Partner? | | | | | |
| 2026-__-__ | Google AI Overview / AI Mode | | | 1 | Wie organisiere ich Papierkram gemeinsam mit meinem Partner? | | | | | |
| 2026-__-__ | Microsoft Copilot | | | 1 | Wie organisiere ich Papierkram gemeinsam mit meinem Partner? | | | | | |
| 2026-__-__ | Gemini | | | 1 | Wie organisiere ich Papierkram gemeinsam mit meinem Partner? | | | | | |

Als CSV-Kopfzeile für eine Tabelle:

```csv
Datum,Plattform,Modell,Suchmodus,Angemeldet,Prompt-Nr,Prompt,Ordilo erwähnt?,Fakten korrekt?,Zitierte URL,Wettbewerber genannt,Beleg
```

Auswertung je Runde: Anteil Prompts mit Ordilo-Erwähnung je Plattform, Anteil mit
zitierter ordilo.de-URL, falsche Fakten (z. B. Android, falscher Preis) als Aufgabe
für Faktentabelle und Profile notieren.

## 9. Nicht verifiziert (Stand 22.10.2026)

- Wikidata-Q-ID für Webanwendung (Q189210) und Eigenschaft P3861 (App-Store-App-ID):
  aus dem Gedächtnis, vor Nutzung prüfen.
- Aktuelle Einreichungsbedingungen, Gebühren und Zeichenlimits aller Verzeichnisse.
- Ob Capterra, GetApp und OMR Reviews Verbraucher-Apps aufnehmen.
- Gründungsdaten von Ordilo und Erb Invest UG.
- Ob der IndexNow-Schlüssel nach dem Deployment live erreichbar ist.
