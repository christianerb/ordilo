# App Store: Einreichung Version 1.0 (ohne Abo)

Stand 23.09.2026. Entscheidung und Begründung: [app-store-launch-plan.md](app-store-launch-plan.md),
Abschnitt „Beschluss: Erstlaunch ohne Abo“. Diese Liste ist die Klickfolge für
App Store Connect plus die Punkte, die außerhalb des Repos erledigt werden
müssen. Reihenfolge einhalten: Geräte-Abnahme vor Einreichung.

## 1. Vor der Einreichung: Nachweise

- [ ] **TestFlight-Geräteabnahme** nach [mobile-prelaunch.md](../quality/mobile-prelaunch.md),
      Tabelle „Required device acceptance before launch“: mindestens ein
      kleines und ein aktuelles iPhone, finaler Produktionsbuild. Offene
      Pflichtzeilen: Erstnutzung, Scan bis bestätigtes Dokument, Korrektur,
      Verbindungsabbruch beim Upload, Offline-Zugriff, Familienzugriff und
      Entzug, VoiceOver, Berechtigungs-Verweigerung, Live-Chat-Fehlerfälle.
- [ ] **Review-Zugang erneut prüfen**: mit dem finalen TestFlight-Build
      anmelden (beständiger Review-Account, Zugangsdaten liegen in TestFlight,
      nicht im Repo).
- [ ] **Umgebung prüfen**: In der EAS-Produktionsumgebung sind
      `EXPO_PUBLIC_BILLING_ENTITLEMENTS_ENABLED` und die
      `EXPO_PUBLIC_REVENUECAT_*`-Schlüssel **nicht** gesetzt; auf dem Server
      (Vercel) ist `BILLING_ENTITLEMENTS_ENABLED` **nicht** gesetzt. Nur so
      bleiben Paywall unsichtbar und Limits unerzwungen.

## 2. App Store Connect: Version 1.0

- [ ] Build auswählen (der Produktionsbuild vom 23.09.2026).
- [ ] **In-App-Käufe**: keine Produkte der Version zuordnen. Die vorbereiteten
      Abo-Produkte bleiben unverknüpft und werden nicht zur Prüfung
      eingereicht.
- [ ] **Inhaltsrechte**: Frage beantworten anhand der tatsächlichen Inhalte.
      Die App zeigt nur eigene Dokumente der Familie; Beispielinhalte sind
      selbst erstellt. Wenn das stimmt: „keine Drittinhalte“ — nichts
      behaupten, was nicht geprüft ist.
- [ ] **Altersfreigabe**: 4+ ist berechnet; Fragen erneut durchgehen, falls
      sich Funktionen geändert haben.
- [ ] **Verschlüsselung**: Build-Deklaration mit der tatsächlichen Nutzung
      abgleichen (HTTPS, Keychain, AES-GCM für Offline-Kopien via
      Exempt-Category prüfen). `usesNonExemptEncryption: false` steht bereits
      in der `app.json`; die jährliche Selbsteinstufung nicht vergessen.
- [ ] **Verfügbarkeit**: Mac- und Vision-Verfügbarkeit für 1.0 abwählen,
      Startländer bewusst wählen (DACH naheliegend, App ist deutschsprachig).
- [ ] **Veröffentlichung**: von automatisch auf **manuell** umstellen.
- [ ] **App-Prüfung → Review Notes**: Text aus Abschnitt 4 einfügen, Kontakt
      und Review-Zugang sichern.
- [ ] Englische Lokalisierung: übersetzen oder bewusst entfernen (steht
      bereits im Launch-Plan).

## 3. Organisatorisch und rechtlich

Keine Rechtsberatung — das ist die Arbeitsliste für die Prüfung, idealerweise
mit juristischer Unterstützung:

- [ ] **Händlerstatus (EU DSA)**: anhand des tatsächlichen Unternehmensstatus
      beantworten. Wer die App geschäftsmäßig betreibt, ist Händler — das gilt
      auch bei kostenlosem Download und muss mit Adresse verifiziert werden.
      [Apple: EU-Händlerstatus](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-eu-digital-services-act-compliance-information)
- [ ] **Nutzungsbedingungen**: öffentliche Seite ist verlinkt; vor Launch
      rechtlich prüfen lassen (Haftung, Verfügbarkeit, KI-Antworten ohne
      Gewähr, Minderjährige im Familienkontext).
- [ ] **Datenschutzerklärung**: pro Dienstleister Rollen und Grundlagen
      gegen die Vertragsunterlagen prüfen: Supabase (Hosting, AVV, Region),
      OpenAI und Datalab (Auftragsverarbeitung, Drittlandtransfer-Grundlage,
      Zero-Retention-/Trainingsklauseln), Vercel, Expo/EAS. Apples
      App-Privacy-Antworten (11 Datentypen, kein Tracking) müssen zur
      Erklärung passen.
- [ ] **Impressum**: deutsche Impressumspflicht gilt auch für kostenlose
      Apps mit geschäftlichem Hintergrund; Impressum auf der verlinkten
      Support-/Marketingsseite vollständig machen.
- [ ] **KI-Einwilligung (5.1.2(i))**: auf dem finalen Build einmal
      durchspielen (Dialog erscheint vor der ersten Übertragung, Widerruf in
      den Einstellungen sperrt nur KI-Funktionen) und in den Review Notes
      erwähnen.
- [ ] **App-Datenschutz-Fragebogen**: nach der Geräteabnahme gegen die
      tatsächliche Datenerhebung abgleichen und erneut veröffentlichen, falls
      sich etwas geändert hat.

## 4. Review Notes (Entwurf, Englisch)

> Ordilo is a German-language family document organizer. Families scan or
> upload letters, Ordilo reads them (OCR + AI), extracts dates and tasks, and
> answers questions with quoted sources from the family's own documents.
>
> Sign-in: use the review account provided in the App Review Information
> fields. Both email-code and password sign-in work; the password flow is
> fastest for review.
>
> AI consent (Guideline 5.1.2(i)): before any user content is sent to our
> AI providers (OpenAI for answers/transcription, Datalab for OCR), the app
> asks once for explicit consent. The choice is stored server-side, enforced
> by the API (requests without consent are refused), and can be changed or
> withdrawn in Settings at any time. Declining only disables AI features;
> the document library stays fully usable.
>
> Camera, photo library, and microphone access are used solely for document
> scanning, file selection, and voice input respectively. The app declares
> no use of location; the location usage string exists only because the
> document-scanner library requires it.
>
> This version contains no in-app purchases and no subscriptions. All
> features are free; daily anti-abuse limits apply.
>
> Demo content: the review account is seeded with synthetic example
> documents. "Mit Beispiel ausprobieren" in Settings loads a demo family.
>
> Encryption: standard HTTPS/TLS and Apple Keychain only; exempt.

## 5. Nach der Freigabe

- [ ] Manuell veröffentlichen, wenn Website und Support bereitstehen.
- [ ] Suchimpressionen und Download-Conversion beobachten (ASO-Hypothesen
      einzeln auswerten).
- [ ] Erstes Update: Sentry-Diagnose aktivieren, dann Abo-Nachweise
      (Sandbox-Matrix) und `BILLING_ENTITLEMENTS_ENABLED=1`.
