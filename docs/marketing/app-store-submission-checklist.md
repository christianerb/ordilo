# App Store: Einreichung Version 1.0 (mit Ordilo Plus)

Stand 04.10.2026. Entscheidung und Begründung: [app-store-launch-plan.md](app-store-launch-plan.md),
Abschnitt „Beschluss: Launch mit Ordilo Plus“. Auslöser war die Ablehnung von
Build 33 nach Richtlinie 2.1(b) („references to Plus plan, but the associated
In-App Purchase products have not been submitted for review“).

Frühere Ablehnung: Build 32 nach 2.5.4 (Hintergrund-Audio), behoben mit #236.

## 1. Vor der Einreichung: Nachweise

- [x] **TestFlight-Geräteabnahme** — erledigt am 23.09.2026 (Team-Lauf mit dem
      Produktionsbuild auf echten iPhones, Umfang nach
      [mobile-prelaunch.md](../quality/mobile-prelaunch.md)).
- [ ] **Umgebung prüfen**: EAS `production` hat
      `EXPO_PUBLIC_BILLING_ENTITLEMENTS_ENABLED=1` und
      `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`. Vercel Production hat
      `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_SIGNING_SECRET` und
      `REVENUECAT_ENTITLEMENT_ID=plus`; `BILLING_ENTITLEMENTS_ENABLED` bleibt
      **aus** (keine Monatskontingente für Gratis-Familien). Sentry-DSNs
      bleiben ungesetzt, sonst stimmt Abschnitt 5 der Datenschutzerklärung
      nicht mehr.
- [ ] **RevenueCat-Webhook-URL**: muss `https://ordilo.de/api/billing/revenuecat`
      sein. Die in [revenuecat-rollout.md](../plans/revenuecat-rollout.md)
      notierte `app.ordilo.de` löst nicht auf (geprüft 04.10.2026); dorthin
      zugestellte Verlängerungen, Kündigungen und Erstattungen gehen verloren.
      Danach in RevenueCat „Send test event“ — erwartet: HTTP 200.
- [ ] **Sandbox-Kauf auf TestFlight** mit dem neuen Build: Monatsabo kaufen,
      Paywall schließt, Live startet, `family_entitlements` zeigt
      `plan_code=plus`; „Käufe wiederherstellen“ auf einem zweiten Gerät.
- [ ] **Review-Account** gehört zu einer Familie mit Plan `free`, damit der
      Reviewer die Paywall sieht (Stand 04.10.2026: nur „Familie Erb“ ist
      manuell `plus`).

## 2. App Store Connect: Abos

Für **beide** Abos (Abo-Gruppe „Ordilo Plus“, ID `22383365`):
`com.ordilo.app.plus.monthly` (7,99 €) und `com.ordilo.app.plus.yearly`
(79,99 €).

- [ ] **Prüfungsinformationen → Screenshot**: `apps/mobile/release-assets/ordilo-plus-review-1260x2736.png`
      (Paywall auf dem iPhone).
- [ ] **Prüfungsinformationen → Notizen**: „Ordilo Plus unlocks the live
      voice conversation. On the Start screen tap the family faces at the
      top, then the gear icon (Einstellungen) → "Ordilo Plus ansehen". Or
      open "Ordilo fragen" and, with an empty text field, tap the round
      sound-wave button to the right of the microphone.“
- [ ] Lokalisierung (Deutsch), Preis und Verfügbarkeit sind gesetzt
      (siehe revenuecat-rollout.md). Status muss danach „Bereit zur
      Übermittlung“ sein.
- [ ] **Abo-Gruppe → Lokalisierung** Deutsch „Ordilo Plus“ vorhanden.

## 3. App Store Connect: Version 1.0

- [ ] **Build** auswählen: der neue Build mit Billing-Schalter (nicht 33).
- [ ] **In-App-Käufe und Abos**: beide Abos hinzufügen. Das ist der Schritt,
      dessen Fehlen zur Ablehnung führte.
- [ ] **Beschreibung** (Ende) ergänzen, Richtlinie 3.1.2:
      „Ordilo Plus: 7,99 € pro Monat oder 79,99 € pro Jahr. Das Abo
      verlängert sich automatisch, wenn du es nicht spätestens 24 Stunden vor
      Ablauf kündigst. Nutzungsbedingungen: https://ordilo.de/nutzungsbedingungen
      · Datenschutz: https://ordilo.de/datenschutz“
- [ ] **Screenshots**: Achter-Set aus `app-store-assets/1.0/` (unverändert).
- [ ] **Inhaltsrechte**, **Altersfreigabe 4+**, **Verschlüsselung**
      (`usesNonExemptEncryption: false`), **Verfügbarkeit** (DE, AT, CH; Mac
      und Vision abgewählt), **manuelle Veröffentlichung**: wie bisher.
- [ ] **App-Privacy**: „Kaufhistorie“ (verknüpft, App-Funktionalität) bleibt
      jetzt begründet stehen.
- [ ] **Review Notes** aus Abschnitt 5 einfügen.
- [ ] Im **Resolution Center** antworten (Text unten) und erneut einreichen.

Antwort im Resolution Center:

> Thank you for the review. The Ordilo Plus subscriptions
> (com.ordilo.app.plus.monthly and com.ordilo.app.plus.yearly) are now
> submitted for review together with the new build. To find them, tap the
> family faces at the top of the Start screen, then the gear icon
> (Einstellungen) → "Ordilo Plus ansehen". Alternatively open "Ordilo
> fragen" and, with an empty text field, tap the round sound-wave button to
> the right of the microphone.

## 4. Organisatorisch und rechtlich — Stand 04.10.2026

Geprüft gegen den Code, keine Rechtsberatung:

- [x] **Impressum**: vollständig. Einziger Nachtrag: USt-IdNr., sobald
      zugeteilt.
- [x] **Händlerstatus (EU DSA)**: Händler: ja (Erb Invest UG).
- [x] **Nutzungsbedingungen** § 6: Plus mit Preis, Laufzeit, automatischer
      Verlängerung, Kündigung, Wiederherstellen und Apples EULA.
- [x] **Datenschutzerklärung**: RevenueCat ist in der iPhone-App aktiv,
      Sentry bleibt aus.
- [x] **Website-Preise** stimmen mit dem App Store überein (7,99 € /
      79,99 €), Plus = Live-Gespräch.
- [x] **Paywall** (Richtlinie 3.1.2): Titel, Laufzeit, Preis pro Zeitraum,
      Verlängerungshinweis, „Käufe wiederherstellen“, Links zu Bedingungen
      und Datenschutz.

### App-Privacy-Abgleich (Code-Stand 04.10.2026)

| Datentyp (App Store Connect) | Verknüpft | Zweck | Code-Grundlage |
|---|---|---|---|
| E-Mail-Adresse | ja | App-Funktionalität (Login) | Einmalcode/Passwort via Supabase Auth |
| Fotos/Videos | ja | App-Funktionalität | Dokumenten-Upload |
| Audiodaten | ja | App-Funktionalität | Diktat/Live gehen an OpenAI, Ordilo speichert kein Audio |
| Sonstige Nutzerinhalte | ja | App-Funktionalität | Dokumente, Notizen, Chat |
| Suchverlauf | ja | App-Funktionalität | Suche über eigene Dokumente |
| Nutzer-ID | ja | App-Funktionalität | Konto/Familienkennung |
| Kaufhistorie | ja | App-Funktionalität | Ordilo Plus über RevenueCat/Apple |
| Produktinteraktion | ja | Analyse + App-Funktionalität | inhaltsfreie Nutzungsereignisse, keine Inhalte |
| Absturzdaten | nein | Analyse | Sentry, `sendDefaultPii` aus |
| Leistungsdaten | nein | Analyse | Sentry, 5-%-Traces, erst mit gesetztem DSN aktiv |
| Sonstige Diagnosedaten | nein | Analyse | Sentry |
| Tracking | nein | — | kein Tracking-SDK in der Codebasis |

## 5. Review Notes (finaler Text, Englisch)

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
> In-App Purchase: Ordilo Plus is an optional auto-renewable subscription
> (monthly or yearly) for the whole family. It unlocks the live voice
> conversation. To see it, tap the family faces at the top of the Start
> screen, then the gear icon (Einstellungen) → "Ordilo Plus ansehen". Or open
> "Ordilo fragen" and, with an empty text field, tap the round sound-wave
> button to the right of the microphone. The paywall shows
> price, period, renewal terms, "Käufe wiederherstellen" and links to the
> terms and privacy policy. Everything else in the app is free; daily
> anti-abuse limits apply. Dictating a question with the microphone button is
> free and is not the live conversation.
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
> requires it. The app does not play audio in the background.
>
> Encryption: standard HTTPS/TLS, the Apple Keychain, and AES-GCM (via the
> operating system's standard implementation) for offline copies of
> documents that the user explicitly saves on the device; the key is kept in
> the Keychain. This is exempt encryption (ITSAppUsesNonExemptEncryption =
> false).

## 6. Nach der Freigabe

- [ ] Manuell veröffentlichen, wenn Website und Support bereitstehen.
- [ ] Erste echte Käufe in RevenueCat und `family_entitlements` abgleichen.
- [ ] Suchimpressionen und Download-Conversion beobachten (ASO-Hypothesen
      einzeln auswerten).
- [ ] Erstes Update: Sentry-DSN setzen und den Sentry-Satz in der
      Datenschutzerklärung anpassen. `BILLING_ENTITLEMENTS_ENABLED=1` erst,
      wenn Paywall und Limit-Hinweise höhere Plus-Kontingente zeigen.
