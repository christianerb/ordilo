# Ordilo · Store listing · 16 September 2026

## Saved in App Store Connect

- App: Ordilo, ID 6805133943, iOS version 1.0.
- Primary language: German. Existing English localization retained.
- Category: Productivity. No secondary category.
- German name: Ordilo: Dokumente & Scanner
- German subtitle: Papierkram für Familien ordnen
- Promotional text: Morgen Klassenfahrt. Wann war der Treffpunkt? Frag eure abgelegten Briefe und finde Antworten mit Fundstelle. Du bist Elternteil. Keine Suchmaschine.
- Keywords: pdf,ordner,ablage,briefe,rechnungen,fristen,schule,kita,ocr,haushalt,suche,versicherung,unterlagen
- Support URL: https://ordilo.de/impressum (public contact email verified there; dedicated help page is a future improvement).
- Marketing URL: https://ordilo.de
- Copyright: 2026 Erb Invest UG (haftungsbeschränkt), based on the public operator information.
- German privacy URL: https://ordilo.de/datenschutz (public page verified).
- Age rating: Apple calculated 4+, regional equivalents. No Kids Category selection.

## German description currently saved

Papierkram rein. Kopf frei.

Ordilo ist die Dokumenten-App für Familien: Briefe scannen, wichtige Angaben prüfen und Antworten mit Fundstelle finden. Für Schulpost, Rechnungen und all die Unterlagen, die gerade „da irgendwo“ liegen.

FRAG DEINEN PAPIERKRAM
Wann ist der Treffpunkt zur Klassenfahrt? Was muss zum Ausflug mit? Welche Kundennummer steht auf der Rechnung? Frag Ordilo zu euren abgelegten Dokumenten. Du bekommst eine Antwort und passende Fundstellen zum Nachsehen.

SCANNEN STATT STAPELN
Erfasse Briefe mit der iPhone-Kamera oder füge Fotos und PDFs hinzu. Auch mehrseitige Dokumente finden ihren Platz in eurer digitalen Ablage.

DAS WICHTIGE IM BLICK
Ordilo liest mit und erkennt Angaben wie Termine, Beträge und Nummern. Du prüfst die Ergebnisse, korrigierst sie bei Bedarf und bestätigst, was übernommen werden soll.

WIEDERFINDEN STATT WEITERSUCHEN
Bewahre Dokumente, Notizen und Kontakte an einem Ort auf. So könnt ihr später nachsehen, was im Schulbrief stand oder welche Information ihr noch braucht.

ZUSAMMEN DRAN DENKEN
Lade weitere Personen in euren Familienbereich ein. Behaltet Unterlagen, Aufgaben und Termine gemeinsam im Blick und ordnet Aufgaben zu. Damit nicht alles an einer Person hängen bleibt.

EINFACH AUSPROBIEREN
Starte mit dem vorbereiteten Schulbrief. Erlebe, wie Frage, Antwort und Fundstelle zusammenpassen. Danach ist euer eigener Papierkram dran.

Du bist Elternteil. Keine Suchmaschine.

Ordilo nutzt KI. Prüfe wichtige Angaben und Antworten, denn Fehler sind möglich. Bewahre Originale auf, wenn du sie noch brauchst.

Hilfe: info@ordilo.de
Datenschutz: https://ordilo.de/datenschutz

## Age-rating rationale

Current app is a private document utility. No public feed or broad distribution of user content; the questionnaire explicitly defines UGC in terms of broad distribution. The AI document chat is not direct communication between users. No parental-control or age-assurance mechanism, unrestricted browser, advertising, gambling, competitive gameplay, sexual/violent/adult editorial content, or medical/lifestyle advice feature is supplied by Ordilo. Private uploaded documents are not an editorial content catalogue. Revisit answers if app behavior changes.

## Screenshots

**For 1.0 (ready, not yet uploaded):** eight German 6.9-inch screenshots in
`docs/marketing/app-store-assets/1.0/`, 1320 × 2868, RGB PNGs without alpha.
Real app captures from the 1.0 code (iPhone 17 Pro Max simulator, status bar
9:41) of a dedicated screenshot account with a fictional family (Berger) and
self-made letters. Unframed captures live in `app-store-assets/raw/`;
`node scripts/compose-store-screenshots.mjs` rebuilds the set.

1. `01-fragen.png` — "Bis wann kann ich den Handyvertrag kündigen?" with the
   answer and the highlighted quote.
2. `02-rein-damit.png` — Intake sheet: scan, photos, file, email forwarding.
3. `03-liest-mit.png` — School letter with extracted dates and calendar toggles.
4. `04-fundstelle.png` — "Die Fundstelle" reading sheet with the highlight.
5. `05-heute.png` — Plan list with faces on tasks.
6. `06-wer-macht-was.png` — "Wer macht das?" assignee picker.
7. `07-alles-an-einem-ort.png` — Document library with types and faces.
8. `08-sicher.png` — Face ID lock screen.

Upload order = file order. Delete the old six first: `06-gemeinsam.png` shows
the removed "Ich übernehme das" button. Concept and rules:
[app-store-screenshots.md](app-store-screenshots.md).

**App Preview (ready, optional):** `app-store-assets/1.0/app-preview.mp4`,
28.9 s, 886 × 1920, H.264 High 30 fps, silent stereo AAC track. Real screen
recording of the 1.0 app: Start → ask the Handyvertrag question → Ordilo
works through the documents (sped up 2×) → answer with quote → "Die
Fundstelle" → Plan, assign a task → Dokumente. No overlays or captions. Upload
under 6.9-inch as the first preview; pick a poster frame showing the answer.

**Still saved in App Store Connect (to be replaced):** six 1260 × 2736 images
(`01-papierkram` … `06-gemeinsam`), copies in `docs/marketing/app-store-assets/`.

## App Review access

- The existing dedicated review account from TestFlight signs in successfully
  against the current backend using the password flow. The production `/api/me`
  endpoint accepted its session on 16 September 2026.
- Its credentials exist in TestFlight Test Information and were copied into the
  iOS 1.0 App Review fields. They are intentionally not recorded in this
  repository or in release logs.
- The existing TestFlight note says the account contains only synthetic sample
  data. The final review notes text for iOS 1.0 lives in
  [app-store-submission-checklist.md](app-store-submission-checklist.md),
  section 4: password sign-in without email code, the scan → question →
  source path, the one-time AI consent dialog (guideline 5.1.2(i),
  changeable in settings), and the fact that version 1.0 contains no
  in-app purchases.
- The earlier local fixture file
  `/tmp/ordilo-chat-acceptance-state.json` is not the source of the permanent
  review credentials and is currently absent.

## Pending blockers — Stand 23.09.2026

Nach dem Beschluss „Erstlaunch ohne Abo“
([app-store-launch-plan.md](app-store-launch-plan.md)) und der Geräteabnahme
vom 23.09.2026 ist von den früheren Blockern übrig:

- **Klicks in App Store Connect**: Build auswählen, keine IAPs zuordnen,
  Inhaltsrechte „Ja“ (Websuche zeigt öffentliche Webseiten), englische Lokalisierung entfernen, Veröffentlichung
  auf manuell, Review Notes einfügen (alles mit fertigen Antworten in der
  Checkliste).
- **Review-Zugang** mit dem finalen Build einmal neu anmelden.

Erledigt oder entfallen: Inhaltsrechte-Erklärung (entschieden: „Ja“,
wegen der Websuche), Händlerstatus (entschieden: Händler), Produktionsbuild
(erstellt 23.09.2026), Geräteabnahme (23.09.2026), Datenschutzerklärung
final (DPAs geschlossen, Transfergrundlagen eingetragen, Prüf-Hinweise
entfernt, 23.09.2026), Sentry (auf das erste Update verschoben),
Sandbox-Kaufnachweise und englische Store-Texte (entfallen für 1.0, weil
kein Abo und keine englische Lokalisierung).

Die App-Privacy-Antworten (11 Datentypen, kein Tracking) sind veröffentlicht
und decken sich mit dem Code-Stand; der Abgleich steht in der Checkliste,
Abschnitt 3.

No app was submitted for review or released.
