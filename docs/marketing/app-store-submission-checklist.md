# App Store: Einreichung Version 1.0 (ohne Abo)

Stand 23.09.2026. Entscheidung und Begründung: [app-store-launch-plan.md](app-store-launch-plan.md),
Abschnitt „Beschluss: Erstlaunch ohne Abo“. Geräteabnahme ist erfolgt, die
Datenschutzerklärung ist final (DPAs überall geschlossen, Transfergrundlagen
eingetragen), alle fachlichen Antworten sind vorbereitet — was bleibt, sind
die Klicks in App Store Connect.

## 1. Vor der Einreichung: Nachweise

- [x] **TestFlight-Geräteabnahme** — erledigt am 23.09.2026 (Team-Lauf mit dem
      Produktionsbuild auf echten iPhones, Umfang nach
      [mobile-prelaunch.md](../quality/mobile-prelaunch.md)).
- [ ] **Review-Zugang erneut prüfen**: einmal mit dem finalen Build anmelden
      (beständiger Review-Account, Zugangsdaten liegen in TestFlight und in
      den App-Review-Feldern, nicht im Repo).
- [ ] **Umgebung prüfen**: In der EAS-Produktionsumgebung sind
      `EXPO_PUBLIC_BILLING_ENTITLEMENTS_ENABLED` und die
      `EXPO_PUBLIC_REVENUECAT_*`-Schlüssel **nicht** gesetzt; auf dem Server
      (Vercel) ist `BILLING_ENTITLEMENTS_ENABLED` **nicht** gesetzt. Nur so
      bleiben Paywall unsichtbar und Limits unerzwungen. Ebenso sind
      `NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_DSN` (Vercel) und der Sentry-DSN der
      App **nicht** gesetzt, sonst stimmt der Sentry-Satz in der
      Datenschutzerklärung (Abschnitt 5) nicht mehr.

## 2. App Store Connect: Version 1.0 — Klickliste mit fertigen Antworten

- [ ] **Build auswählen**: der Produktionsbuild vom 23.09.2026.
- [ ] **Screenshots ersetzen**: Das neue Achter-Set liegt fertig unter
      `app-store-assets/1.0/` (1320 × 2868, RGB, ohne Alpha). Das alte
      Sechser-Set löschen und die acht Bilder in Dateireihenfolge hochladen
      (6,9 Zoll). Das alte `06-gemeinsam.png` zeigt den entfernten Button
      „Ich übernehme das“ und darf nicht eingereicht werden.
- [ ] **In-App-Käufe**: nichts zuordnen. Die vorbereiteten Abo-Produkte
      bleiben unverknüpft und werden nicht zur Prüfung eingereicht.
- [ ] **Inhaltsrechte** → Antwort: **„Ja“** (die App greift auf Drittinhalte
      zu), dann bestätigen, dass die nötigen Rechte vorliegen. Grund: Fragt
      eine Familie nach aktuellen, öffentlichen Informationen, holt die
      Websuche (`search_web`, über OpenAI) öffentliche Webseiten und zeigt
      deren Titel, eine kurze Zusammenfassung und den Link als Quelle; der
      Link öffnet die Originalseite in Safari. Ordilo übernimmt keine
      fremden Inhalte in eigene Kataloge. Alles andere sind familieneigene
      Uploads; Beispiel- und Screenshot-Inhalte sind synthetisch selbst
      erstellt.
- [ ] **Altersfreigabe**: 4+ beibehalten (Begründung in
      [app-store-listing.md](app-store-listing.md), „Age-rating rationale“).
      „Uneingeschränkter Webzugang“ bleibt **Nein**: Die App hat keinen
      eingebauten Browser; Links aus der Websuche öffnen Safari außerhalb
      der App.
- [ ] **Verschlüsselung**: Die Build-Deklaration steht auf
      `usesNonExemptEncryption: false` (nur befreite Verschlüsselung).
      Tatsächliche Nutzung: TLS, Apple Keychain, AES-GCM für Offline-Kopien
      mit Standard-Algorithmus. Damit bleibt „false“ die richtige Angabe;
      die jährliche Selbsteinstufung (Self-Classification Report, Frist
      Ende Januar) einplanen.
- [ ] **Verfügbarkeit**: Mac- und Vision-Verfügbarkeit abwählen. Länder:
      Deutschland, Österreich, Schweiz (App und Store-Texte sind
      deutschsprachig).
- [ ] **Englische Lokalisierung**: für 1.0 **entfernen**. Die App ist
      deutschsprachig; eine halbe englische Produktseite wirft Fragen in der
      Review auf. Kann mit einer späteren englischen App-Version
      zurückkommen.
- [ ] **Veröffentlichung**: von automatisch auf **manuell** umstellen.
- [ ] **App-Prüfung**: Review Notes aus Abschnitt 4 einfügen, Kontakt und
      Review-Zugang sichern.

## 3. Organisatorisch und rechtlich — Stand nach Prüfung am 23.09.2026

Geprüft gegen den Code, keine Rechtsberatung:

- [x] **Impressum**: vollständig (§ 5 DDG, Vertretung, HRB, § 18 MStV,
      Streitbeilegung). Einziger Nachtrag: USt-IdNr., sobald zugeteilt.
- [x] **Händlerstatus (EU DSA)**: geklärt — die Erb Invest UG
      (haftungsbeschränkt) tritt gewerblich auf, also **Händler: ja**. In
      App Store Connect Adresse, Telefon und E-Mail für die Händleranzeige
      verifizieren (Angaben wie im Impressum). Gilt auch bei kostenlosem
      Download.
- [x] **Nutzungsbedingungen**: vollständig, keine Platzhalter. § 6
      beschreibt das Plus-Abo mit Preisen, das in 1.0 noch nicht kaufbar
      ist — unkritisch, weil es ausdrücklich „sobald es dir in der App
      angeboten wird“ heißt. Beim Abo-Launch Preise und Texte erneut
      abgleichen.
- [x] **Dienstleisterliste in der Datenschutzerklärung**: deckt sich mit den
      tatsächlichen Abhängigkeiten (Supabase, OpenAI, Datalab, Resend,
      Vercel; RevenueCat, Apple IAP und Sentry sind als bedingte Punkte
      formuliert und werden erst mit der jeweiligen Aktivierung relevant).
      Kein Tracking- oder Analytics-SDK in der Codebasis.
- [x] **Vertragsmappe Datenschutz**: erledigt (23.09.2026) — DPAs sind mit
      allen Dienstleistern geschlossen. Die Datenschutzerklärung nennt die
      Auftragsverarbeitung (Art. 28 DSGVO) in Abschnitt 5 und die
      Transfergrundlagen in Abschnitt 7: Vercel und Sentry über das EU-US
      Data Privacy Framework (Art. 45 DSGVO), OpenAI, Datalab, Resend und
      RevenueCat über Standardvertragsklauseln (Art. 46 Abs. 2 lit. c
      DSGVO), Supabase mit Datenhaltung in der EU. Alle Prüf-Hinweise sind
      aus dem öffentlichen Text entfernt.
- [ ] **KI-Einwilligung (5.1.2(i))** auf dem finalen Build einmal
      durchspielen: Dialog erscheint vor der ersten Übertragung, Widerruf in
      den Einstellungen sperrt nur KI-Funktionen. In den Review Notes ist
      der Ablauf bereits beschrieben.
- [ ] **App-Privacy-Fragebogen abgleichen**: Die veröffentlichten Antworten
      (11 Datentypen, kein Tracking) gegen die Tabelle unten prüfen; bei
      Abweichung korrigieren und erneut veröffentlichen.

### App-Privacy-Abgleich (Code-Stand 23.09.2026)

| Datentyp (App Store Connect) | Verknüpft | Zweck | Code-Grundlage |
|---|---|---|---|
| E-Mail-Adresse | ja | App-Funktionalität (Login) | Einmalcode/Passwort via Supabase Auth |
| Fotos/Videos | ja | App-Funktionalität | Dokumenten-Upload |
| Audiodaten | ja | App-Funktionalität | Diktat/Live gehen an OpenAI, Ordilo speichert kein Audio |
| Sonstige Nutzerinhalte | ja | App-Funktionalität | Dokumente, Notizen, Chat |
| Suchverlauf | ja | App-Funktionalität | Suche über eigene Dokumente |
| Nutzer-ID | ja | App-Funktionalität | Konto/Familienkennung |
| Kaufhistorie | ja | App-Funktionalität | erst relevant, sobald das Abo live ist — für 1.0 prüfen, ob der Eintrag entfernt oder begründet bleibt |
| Produktinteraktion | ja | Analyse + App-Funktionalität | inhaltsfreie Nutzungsereignisse, keine Inhalte |
| Absturzdaten | nein | Analyse | Sentry, `sendDefaultPii` aus |
| Leistungsdaten | nein | Analyse | Sentry, 5-%-Traces, erst mit gesetztem DSN aktiv |
| Sonstige Diagnosedaten | nein | Analyse | Sentry |
| Tracking | nein | — | kein Tracking-SDK in der Codebasis |

Hinweis: Ohne gesetzten Sentry-DSN werden in 1.0 faktisch keine
Diagnosedaten gesendet; die drei Diagnose-Einträge sind als „vorbereitet“
deklariert und können bleiben, sobald Sentry im ersten Update aktiviert
wird.

## 4. Review Notes (finaler Text, Englisch)

> Ordilo is a German-language family document organizer. Families scan or
> upload letters, Ordilo reads them (OCR + AI), extracts dates and tasks, and
> answers questions with quoted sources from the family's own documents.
>
> Sign-in: use the review account provided in the App Review Information
> fields (password flow, no email code needed). The account contains only
> synthetic sample data. "Ordilo mit Beispiel ausprobieren" in Settings
> shows a short walkthrough with one sample letter; it does not create any
> documents or tasks.
>
> Suggested review path: open "Dokumente" and pick a sample letter, tap the
> Ordilo button in the bottom bar and ask a question about it, then tap the
> cited source under the answer to see the quoted passage.
>
> AI consent (Guideline 5.1.2(i)): before any user content is sent to our
> AI providers (OpenAI for answers/transcription, Datalab for OCR), the app
> asks once for explicit consent. The choice is stored server-side, enforced
> by the API (requests without consent are refused with 403), and can be
> changed or withdrawn in Settings at any time. Declining only disables AI
> features; the document library stays fully usable.
>
> Camera, photo library, and microphone access are used solely for document
> scanning, file selection, and voice input. The app does not use location;
> the location usage string exists only because the document-scanner library
> requires it.
>
> This version contains no in-app purchases and no subscriptions. All
> features in this version are free; daily anti-abuse limits apply. Live
> voice conversation is not part of this version and has no entry point;
> dictating a question with the microphone button is available.
>
> Encryption: standard HTTPS/TLS, the Apple Keychain, and AES-GCM (via the
> operating system's standard implementation) for offline copies of
> documents that the user explicitly saves on the device; the key is kept in
> the Keychain. This is exempt encryption (ITSAppUsesNonExemptEncryption =
> false).

## 5. Nach der Freigabe

- [ ] Manuell veröffentlichen, wenn Website und Support bereitstehen.
- [ ] Suchimpressionen und Download-Conversion beobachten (ASO-Hypothesen
      einzeln auswerten).
- [ ] Erstes Update: Sentry-DSN setzen, den Sentry-Satz in der
      Datenschutzerklärung anpassen und synthetischen Testfehler prüfen,
      danach Abo-Nachweise (Sandbox-Matrix) und
      `BILLING_ENTITLEMENTS_ENABLED=1`.
