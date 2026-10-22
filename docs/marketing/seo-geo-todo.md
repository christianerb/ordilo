# SEO/GEO: offene Aufgaben

Stand: 22. Oktober 2026, nach PR #242 (statische Startseite, Schema-Graph,
„Brief verstehen“-Ratgeber, Vergleiche, llms.txt, IndexNow, App-Bewertung).
Erledigtes abhaken oder löschen. Hintergrund: `seo-geo-strategie.md` und
`entity-und-verzeichnisse.md`.

## Direkt nach dem Deploy (ca. 30 Minuten)

- [ ] Live prüfen: `https://ordilo.de/`, `/ueber-uns`, `/llms.txt`, `/sitemap.xml`,
      `/ratgeber/steuerbescheid-pruefen/og` und
      `https://ordilo.de/97c497ac75251ff7dbcc5df553311002.txt` (muss den Schlüssel zeigen).
- [ ] Eingeloggt `https://ordilo.de/` öffnen → muss nach `/home` weiterleiten.
      Ausgeloggt → Landingpage.
- [ ] [Rich Results Test](https://search.google.com/test/rich-results) für `/` und einen
      Ratgeber: Organization, MobileApplication, VideoObject, BlogPosting ohne Fehler.
- [ ] Google Search Console: Domain-Property `ordilo.de` anlegen bzw. prüfen,
      Sitemap `https://ordilo.de/sitemap.xml` einreichen, Startseite und 2–3 neue
      Ratgeber per URL-Prüfung zur Indexierung anfordern.
- [ ] Bing Webmaster Tools: Website aus Search Console importieren, Sitemap einreichen.
      (Bing speist ChatGPT-Suche und Copilot.)
- [ ] IndexNow anstoßen: `node scripts/indexnow.mjs` (ohne Argument = alle URLs aus der Sitemap).
      Danach in Bing Webmaster Tools unter „IndexNow“ prüfen, ob die Meldungen ankommen.
- [ ] App Store Connect: Support-URL auf `https://ordilo.de/hilfe` umstellen.

## Inhalte prüfen

- [ ] Quellen-Links in `src/content/document-guides.ts` und `src/content/comparison-guides.ts`
      stichprobenartig öffnen (gesetze-im-internet.de, Verbraucherzentrale,
      Familienportal, BA). Die Fakten sind per Websuche geprüft, die Seiten selbst
      waren beim Schreiben nicht abrufbar.
- [ ] Ratgeber zu Steuer, Krankenkasse, Kita-Gebühren und Kindergeld/Elterngeld einmal
      fachlich gegenlesen (lassen). Sie enthalten Fristen.

## Analytics

- [ ] Event `app_review_requested` für die Bewertungsabfrage in der App: braucht eine neue
      idempotente Migration, die den Namen zur Check-Constraint von `product_events`
      hinzufügt (letzte Liste: `supabase/migrations/0089_live_conversation_ended_event.sql`),
      plus den Namen in `src/lib/analytics/product-events.ts` und
      `apps/mobile/src/lib/analytics.ts`, dann ein `recordProductEvent` in
      `notePositiveMoment` (`apps/mobile/src/lib/app-review.ts`) mit nur `{ moment }`.
- [ ] Baseline erheben: GSC (28 Tage, Brand vs. Non-Brand) und GEO-Promptset aus
      `entity-und-verzeichnisse.md` einmal durchlaufen und Ergebnisse speichern.
      Nach 4–6 Wochen wiederholen.

## Außerhalb der Website (GEO)

- [ ] Wikidata-Eintrag anlegen (Vorschlag in `entity-und-verzeichnisse.md`).
      Property-IDs dort vorher prüfen, die Firma braucht ggf. ein eigenes Item.
- [ ] Verzeichnisse eintragen, Reihenfolge und Texte siehe `entity-und-verzeichnisse.md`
      (Product Hunt, AlternativeTo, SaaSHub, …). Überall dieselbe Firmenbeschreibung nutzen.
- [ ] Erste echte Erwähnungen: Eltern-Creator, Ordnungscoaches, Familienportale
      (Playbook im selben Dokument). Keine Fake-Accounts, Zugehörigkeit offenlegen.

## Später

- [ ] Sobald echte App-Store-Bewertungen da sind: `aggregateRating` in
      `softwareApplication` (`src/lib/marketing.ts`) mit echten Werten ergänzen.
- [ ] FAQ „Gibt es Ordilo für Android?“ in `src/app/landing-page.tsx` aktualisieren,
      wenn die Android-App erscheint; dann auch `operatingSystem` im Schema.
- [ ] Nach Search-Console-Daten: Titles/Descriptions der Ratgeber mit Impressionen,
      aber wenig Klicks überarbeiten.
- [ ] Weitere „Brief verstehen“-Ratgeber nur nach echten Suchanfragen oder Supportfragen
      (z. B. Rundfunkbeitrag, Strom-Jahresabrechnung, Arztrechnung/GOÄ).
- [ ] Optional: „Brief-Erklärer“ als kostenloses Tool ohne Login. Braucht zuerst eine
      Entscheidung zu KI-Kosten, Missbrauchsschutz und Datenschutzerklärung.
