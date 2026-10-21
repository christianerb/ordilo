# Ordilo: SEO- und GEO-Strategie

Stand: 21. Oktober 2026. Ziel: Familien erreichen, die ihren Papierkram gemeinsam
organisieren möchten, und sie bis zum ersten nützlichen Dokument begleiten.
Keine Ranking-, Installations- oder KI-Zitat-Garantie. Ergänzung vom selben Tag:
25 Keyword-Spannen aus Google Keyword Planner stehen in
`keyword-planner-2026-10-21.csv`; Priorisierung und drei zusätzliche Artikel in
`listicles-und-carousels.md`. Keyword Difficulty, Search-Console-Daten und
AI-Visibility-Baselines sind weiterhin **nicht erhoben**. Die folgenden Abschnitte
dokumentieren den ursprünglichen Startplan mit drei Artikeln; die Ergänzung erhöht
den Bestand auf sechs.

## 1. Befund und Prioritäten

| Befund im Code / Browser | Wirkung | Umsetzung |
| --- | --- | --- |
| Startseiten-CTA nur zum Web-Login | iPhone-Besucher gelangen nicht direkt zum Store | App-Store-Link als primärer Einstieg, Browser-Einstieg bleibt |
| Nur Startseite und Rechtstexte in Sitemap | Kaum eigenständige Antworten auf Suchfragen | Ratgeberindex, drei Artikel und Hilfe |
| Sitemap schreibt bei jedem Aufruf `new Date()` | Unzuverlässiges Änderungssignal | Nur belegtes Textdatum bei Artikeln, sonst kein `lastmod` |
| Software-Schema behauptet Android | Widerspruch zum verfügbaren nativen Produkt | iOS und Web; Store-URL und kostenloser Basisumfang |
| Pauschale EU- und ChatGPT-Aussagen | Ungenaue Produktabgrenzung | Speicher und KI-Verarbeitung unterscheiden, sachlicher Vergleich |
| Fehlende Social-Preview-Angaben | Unkontrollierte Link-Vorschau | Markenbild, konsistente OG-/Twitter-Metadaten |
| Support führt in App Store Connect zum Impressum | Unklarer Einstieg bei Fragen | Neue `/hilfe`; Store-URL nach Deployment ändern |

App Store Connect am 21.10.2026: Version 1.0 seit 6.10. bereit für Vertrieb,
öffentlich in DE/AT/CH. Acht Screenshots und Vorschauvideo vorhanden. Keine
Bewertungen. Analysezeitraum bis 19.10.; „–“ bzw. „Daten nicht ausreichend“.
Das belegt weder null Downloads noch eine schlechte Conversion. Web-SEO und
App-Store-Suche werden getrennt gemessen.

## 2. Was wir aus dem Reesi-Blog übernehmen

Gelesene Referenzen in `/Users/christian/Documents/reesi-blog`:
`SEO-GEO.md`, `GEO-CONTENT.md`, `FANOUT-PROCESS.md` und
`docs/reviews/knowledge-seo-geo-2026-10-15.md`.

- Eine Nutzerfrage und ein primärer Intent je URL; ähnliche Fragen bündeln.
- Direkte, eigenständig verständliche Antwort am Artikelanfang.
- Quellen, Produktbehauptungen und eigene Vorschläge unterscheiden.
- Metadaten, Canonical, Navigation, strukturierte Daten und Sitemap konsistent halten.
- Redaktionelles Datum nicht bei jedem Build auf heute setzen.
- Beobachtete Suchfragen von vermuteten Fragen trennen; ohne Baseline kein Uplift.
- Neue Seiten müssen mehr leisten als ein umformuliertes Keyword.

Nicht übertragen: medizinische Templates, Krankheits-/Ortskombinationen,
Studienzahlen und medizinische Freigaben. Auch alte Reesi-Erfolgsannahmen sind
kein Nachweis für Ordilo. Die historischen Quellenregeln wurden gegen aktuelle
Google- und OpenAI-Dokumentation geprüft.

## 3. Positionierung und Zielgruppe

Primär: deutschsprachige Eltern mit Kita-/Schulkindern, die Briefe, Rückmeldungen,
Termine und Unterlagen gemeinsam bewältigen. Sekundär: Paare und Haushalte mit
ähnlichem Dokumentenbedarf. Die Inhalte sprechen beide Eltern an.

Versprechen: **Briefe scannen, Angaben prüfen, Antworten mit Fundstelle finden und
Verantwortung teilen.** Kein Ersatz für eine Kita-Kommunikationsplattform, keine
Rechtsberatung, kein autonomes Erledigen von Zahlungen oder Kündigungen.

Drei Schritte: hilfreiche Suchantwort → konkreter Produktbeweis → iPhone-App oder
Web-Einstieg. Freche Social-Copy kann Aufmerksamkeit schaffen. Ratgeber bleiben
klar und praktisch; eine verlässliche Antwort muss ohne Werbespruch funktionieren.

## 4. Keyword- und Seitenplan

Die ausführliche Zuordnung mit 30 Suchphrasen steht in `seo-keywords.csv`.
Prioritäten sind redaktionelle Einschätzungen nach Produktnähe und Suchintention,
keine aus einem SEO-Tool gemessenen Werte.

| Cluster | Leitfrage / Suchbegriffe | Zielseite | Priorität |
| --- | --- | --- | --- |
| Produkt | Dokumenten-App Familie; Familienablage App | `/` | P0 |
| Organisation | Papierkram organisieren Familie; private Ordnerstruktur | `/ratgeber/papierkram-organisieren-familie` | P0 |
| Elternpost | Kita-Briefe organisieren; Schulbriefe Termine | `/ratgeber/kita-schulbriefe-organisieren` | P0 |
| Scannen | Dokumente scannen iPhone; Briefe digitalisieren | `/ratgeber/dokumente-scannen-iphone` | P1 |
| Produktvertrauen | Ordilo kostenlos; Ordilo Datenschutz; Ordilo Hilfe | `/hilfe`, `/#preise`, `/datenschutz` | P0 |
| Aufgaben teilen | Papierkram aufteilen; Mental Load Familienorganisation | zunächst Elternpost-Artikel ergänzen; eigene URL erst bei eigenem Mehrwert | P1 |
| Entscheidung | Scanner oder Dokumenten-App; gemeinsame Ablage wählen | zunächst Vergleich im Scan-Artikel | P1 |
| Konkrete Verträge | Kundennummer wiederfinden; Vertragsunterlagen organisieren | später eigener Ratgeber mit Produktdemo | P2 |

### Suchergebnis-Stichprobe vom 21.10.2026

Die beobachteten Quellen belegen Themen-/Intent-Passung, **kein Suchvolumen und
keine verlässliche Google-Rangfolge**. Die Websuche liefert eine Momentaufnahme:

- „Papierkram organisieren“ + Familie: [Die Papierburg](https://die-papierburg.de/index.html)
  und [Einfach.Ordnung](https://www.einfach-ordnung.com/papierkram) zeigen
  Dienstleistungsintention. Ordilo beantwortet bewusst die Selbsthilfe-Frage,
  nicht „jemanden zum Sortieren beauftragen“.
- „Elternbriefe organisieren“: [FamPilot](https://fampilot.de/) verbindet Briefe
  mit Aufgaben. [Elternnachricht](https://www.elternnachricht.de/funktionen)
  adressiert Kommunikation durch Einrichtungen. Unser Artikel richtet sich an
  Eltern nach Eingang eines Briefs; die App wird nicht als Schulportal verkauft.
- „Dokumente scannen iPhone“: [Apple Support](https://support.apple.com/de-de/108963)
  beantwortet die Grundfunktion bereits. Unser Zusatznutzen liegt bei Lesbarkeit,
  Familienablage und Wiederfinden, nicht beim Behaupten, eine Extra-App sei nötig.
- „Digitale Dokumentenablage privat Familie“: vielfältige Ordner-/DMS-Antworten.
  Noch keine belastbare Entscheidung über ein eigenes Landingpage-Cluster.

Breite „Scanner“-Begriffe nicht zum einzigen Wachstumsziel machen. Keine
Ortsseiten für „Papierkram Berlin/München“ ohne lokale Leistung. Keine
Aufbewahrungsfristen-/Steuerratgeber ohne aktuelle Fachquellen und Prüfung.

## 5. Architekturentscheidung: Next.js statt zusätzlichem Astro

Ordilo läuft bereits auf Next.js 15. Die neuen öffentlichen Seiten werden
statisch erzeugt. Artikel liegen typisiert in `src/content/guides.ts`, der
Inhalt ist Markdown mit gemeinsamen Templates. Es kommen keine neuen
Laufzeit-Abhängigkeiten hinzu; `react-markdown` und `remark-gfm` existieren bereits.

URLs bleiben unter `ordilo.de/ratgeber`, ohne Subdomain oder Domainmigration.
Astro wäre bei einem eigenständig betriebenen Redaktionsteam/Publishing-System
plausibel, erzeugt jetzt aber ein zweites Deployment, doppelte Layouts und
Routing-Aufwand. Es ist kein Rankingvorteil an sich. Ein späterer Wechsel muss
bestehende URLs erhalten oder sauber weiterleiten.

## 6. Redaktion und erste Artikel

Die ersten drei vollständigen Artikel sind im Code enthalten:

1. **Papierkram organisieren:** Eingang, Kategorien, Zuständigkeiten, konkrete
   Ordnerbeispiele, Vergleich Papier/Cloud/App und eine Checkliste.
2. **Kita-/Schulbriefe:** vier Fragen pro Brief, deutlich als erfunden markiertes
   Ausflugsbeispiel, Rückgabefrist vs. Termin, mehrere Eingangskanäle, Routine.
3. **iPhone scannen:** faire Erklärung der vorhandenen Apple-Funktion mit
   Primärquelle, Lesbarkeitscheck, Auswahlhilfe und Übergang zur Familienablage.

Jeder Artikel erhält eine kurze direkte Antwort, Zwischenüberschriften,
Inhaltsnavigation, Quellen/Einordnung, verwandte Artikel und einen Produkt-CTA.
Ordilo wird als Anbieter und Herausgeber genannt. Keine erfundenen Personen,
Expertenprüfungen, Erfahrungen, Testimonials oder Erfolgszahlen. „Textstand“ ist
keine Behauptung einer externen Prüfung oder eines historischen Veröffentlichungstags.

### Redaktioneller Ablauf für jeden weiteren Artikel

1. GSC-Suchfrage, Supportfrage oder SERP-Beobachtung im Brief dokumentieren.
2. Zielgruppe, Intent, Ziel-URL und Abgrenzung zu bestehenden Artikeln festlegen.
3. Primärquelle für externe Fakten; Produktabläufe im aktuellen Build prüfen.
4. Direkte Antwort schreiben, danach nachvollziehbare Schritte und ein Beispiel.
5. Text auf Kosten, Datenschutz, Funktionsumfang und übertriebene Versprechen prüfen.
6. Interne Links, Canonical, Schema, mobile Darstellung und Build prüfen.
7. Erst dann veröffentlichen. Textdatum nur bei inhaltlicher Änderung aktualisieren.

### Acht Wochen nach Freigabe

| Woche | Arbeit | Entscheidungskriterium |
| --- | --- | --- |
| 1 | Drei Startartikel + Startseitenänderungen veröffentlichen, Sitemap einreichen | Seiten erreichbar, indexierbar, sichtbare CTA-Links korrekt |
| 2 | Reale Demo zum Elternbrief aufnehmen; Artikel und Reel verbinden | Funktioniert ein Brief bis zur geprüften Antwort? |
| 3 | Beitrag „Papierkram gemeinsam übernehmen“ recherchieren | Eigenständige Fragen vorhanden, kein Duplikat des ersten Artikels |
| 4 | Erste GSC- und Quellenprüfung; Titles nur bei genügend Daten anpassen | Impressionen, passende Queries und Klicks getrennt betrachten |
| 5 | Dokumentensuche-/Vertragsartikel anhand tatsächlicher Fragen | Keine unbelegten Rechts-/Kündigungsratschläge |
| 6 | Fairen Vergleich Cloud-Ordner vs. Familienablage vertiefen | Funktionen live geprüft; keine pauschalen Konkurrenzbehauptungen |
| 7 | Bestehende Artikel anhand Supportfragen verbessern | Konkrete Lücke, kein künstliches Frische-Update |
| 8 | Entscheidung: vertiefen, neuen Cluster starten oder Conversion verbessern | Organische Besucher → Einstieg → nützliche Nutzung |

Ein guter Artikel pro Woche ist die geplante Obergrenze für diesen Start, keine
Pflicht zur Veröffentlichung. Lieber bestehende Antworten verbessern, wenn
neue Themen keinen zusätzlichen Nutzen liefern.

## 7. Technische SEO-Best-Practices

- Öffentliche Inhalte und Links als HTML ohne Login; keine privaten Dokumente indexieren.
- Pro Seite eine sichtbare H1, eindeutiger Title und passende Beschreibung.
- Canonical ohne Trackingparameter; in Ordilo bestehende URLs ohne Slash am Ende.
- Sitemap nur für öffentliche kanonische Seiten. `lastmod` nur bei echter Inhaltsänderung.
- Ratgeber von Startseite und Navigation erreichbar; verwandte Artikel verknüpfen.
- Unbekannte Artikel liefern 404 statt leerer Seiten oder Weiterleitung zur Startseite.
- Statische Artikel, keine neue clientseitige Bibliothek für die Redaktion.
- OG-Bild mit Alternativtext; mobile Tabelle innerhalb des Inhalts scrollbar.
- Strukturierte Daten entsprechen sichtbarem Inhalt: Organization, WebSite,
  SoftwareApplication, BlogPosting und BreadcrumbList. Keine erfundenen Sterne.
- FAQ-Inhalte sind nützlich; FAQ-Rich-Results für eine normale App-Website nicht versprechen.
- Nach Deployment Rich Results Test, Search Console URL-Prüfung und mobile
  Performance prüfen. Lokaler Build ist kein Nachweis guter realer Core Web Vitals.

## 8. GEO / Sichtbarkeit in KI-Antworten

Google nennt keine zusätzlichen technischen Voraussetzungen für AI Overviews
oder AI Mode über die SEO-Grundlagen hinaus. Deshalb keine speziellen
„GEO-Tags“, Keyword-Stapel oder künstlichen Autoritätszahlen.

Für Ordilo praktisch: Produkt und kostenlosen Umfang klar benennen, pro Frage
selbstständig verständliche Antworten liefern, Quellen unmittelbar zuordnen,
Alternativen fair erklären und Anbieteridentität konsistent halten.

Crawler unterscheiden: **OAI-SearchBot** dient OpenAI-Suche, **GPTBot** Training.
Eine Freigabe für Training ist keine Voraussetzung für Suchsichtbarkeit.
Googlebot und Google-Extended haben ebenfalls unterschiedliche Zwecke. Die
vorhandene öffentliche Crawl-Freigabe bleibt; private Routen sind weiter geschützt.
`robots.txt` ersetzt keine Authentifizierung. Keine Änderung der Trainingspolitik
nur für ein vermeintliches Rankingversprechen. `llms.txt` ist hier bewusst kein
P0: ein optionales Experiment, kein belegter Ersatz für HTML, Indexierung oder Links.

Externe Präsenz: Eltern-Creator, Ordnungscoaches und Familienportale mit echtem
Produktbezug. Eine nachvollziehbare Anwendungsgeschichte ist wertvoller als eine
bezahlte Linkliste. Keine erfundenen Nutzerfragen, Eigenempfehlungen unter falscher
Identität oder massenhaften Blogkommentare. Kontaktaufnahme separat freigeben.

## 9. Messung und Experimente

**Noch offen:** Zugang/Property für Google Search Console, Bing Webmaster Tools,
Website-Analytics und Attribution zwischen Website/App Store/App-Nutzung.
Die Website-Änderung installiert keine neue Trackingsoftware.

Vor Deployment bzw. als dokumentierte erste Baseline:

- GSC: letzte 28 Tage, Land/Gerät, Brand vs. Non-Brand, Query und Zielseite.
- Indexierungsstatus: Startseite, Ratgeberindex, drei Artikel und Hilfe prüfen.
- Website: organische Besuche und CTA-Klicks getrennt für Store und Web, sofern
  datenschutzgerecht messbar. Noch keine funktionierende Messung behaupten.
- App Store: Kampagnenlinks für SEO/Social/Creator anlegen und deren Grenzen prüfen;
  ein UTM-Link allein misst keine durchgehende iOS-Installation.
- Produkt: erster eigener Upload, erste Antwort mit geöffneter Fundstelle,
  Einladung und Wiederkehr nach sieben Tagen. Nur Ereignisse ohne Dokumentinhalt
  oder konkrete Fragen protokollieren; Messkonzept und Datenschutz vorher prüfen.

Leitkennzahl: Familien, die über einen Kanal kommen und einen eigenen Brief
nützlich verwenden. Downloads sind ein Zwischenschritt. Fehlende Zahlen bleiben
„nicht erhoben“, nicht 0. Bei winzigen Fallzahlen keine A/B-Signifikanz behaupten.

GEO-Promptset (Baseline noch offen):
1. Wie organisiere ich Papierkram gemeinsam mit meinem Partner?
2. Welche App hilft Familien bei Kita- und Schulbriefen?
3. Wie finde ich Termine in eingescannten Briefen wieder?
4. Brauche ich eine zusätzliche Scanner-App auf dem iPhone?
5. Was unterscheidet eine Familienablage von einem Cloud-Ordner?
6. Was kostet Ordilo und welche Funktionen sind kostenlos?
7. Wo verarbeitet Ordilo meine Dokumente?
8. Wie kann ich Fragen an meine eigenen Unterlagen stellen?

Für jede Messung: Datum, Plattform/Modell, Sprache, Suchmodus, genaue Frage,
Antwortbeleg, Markenmention und tatsächlich zitierte URL getrennt speichern.
Nach 4–6 Wochen unter vergleichbaren Bedingungen wiederholen. Schwankungen und
Personalisierung dokumentieren; keine KI-Zitate als zugesicherte Folge verkaufen.

## 10. Nach dem Merge / Deployment

- Live-URLs, Canonicals, 404, Sitemap und OG-Bild erneut prüfen.
- Search Console: Property prüfen, Sitemap einreichen, URLs inspizieren.
- App Store Connect Support-URL auf `https://ordilo.de/hilfe` ändern, **erst wenn live**.
- Social und Creator auf konkrete Demo oder passende Ratgeber verweisen.
- Keine laufende Automation eingerichtet; Wochenplan ist ein Arbeitsplan.

## Primärquellen (abgerufen am 21.10.2026)

- [Google: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- [Google: Sitemaps und lastmod](https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping)
- [Google: Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article)
- [OpenAI: Crawlers](https://developers.openai.com/api/docs/bots)
- [Apple: Dokumente scannen](https://support.apple.com/de-de/108963)
- [Apple: App Store Search](https://developer.apple.com/app-store/search/)

Ergänzend wurden die aktuelle Ordilo-Datenschutzerklärung im Repository,
die App-Store-Connect-Angaben und die bestehenden Landingpage-Tests geprüft.
