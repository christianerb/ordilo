# Ordilo: App Store und Freemium – Arbeitsstand 23.09.2026

## Beschluss: Erstlaunch ohne Abo (23.09.2026)

Version 1.0 geht **komplett kostenlos** in den Store. Konkret:

- `EXPO_PUBLIC_BILLING_ENTITLEMENTS_ENABLED` und die RevenueCat-Schlüssel
  bleiben in der EAS-Produktionsumgebung **ungesetzt**; serverseitig bleibt
  `BILLING_ENTITLEMENTS_ENABLED` aus. Paywall und Plus-Bereich sind damit
  unsichtbar, `isPlus` gilt intern für alle, und die Tageslimits (50 Chats,
  Uploads, Transkriptionen) bleiben der Missbrauchsschutz.
- Live-Sprache bleibt **serverseitig** über `hasLiveConversationAccess`
  gesperrt (Plan `free` ⇒ 402). Einzelne Beta-Familien können bei Bedarf
  manuell auf `founding` gesetzt werden; alle anderen sehen den ehrlichen
  Hinweis „Live sprechen gibt es noch nicht.“
- Die vorbereiteten IAP-Produkte werden der Version 1.0 in App Store Connect
  **nicht** zugeordnet und nicht zur Prüfung eingereicht.
- Native Sentry-Diagnose wird auf die erste Version nach dem Launch
  verschoben; ohne `EXPO_PUBLIC_SENTRY_DSN` ist sie vollständig deaktiviert.
- Veröffentlichung in App Store Connect auf **manuell** umstellen, damit der
  Launch-Zeitpunkt kontrolliert wird.

Der Produktionsbuild für Version 1.0 ist erstellt. Nächster Schritt ist die
Geräte-Abnahme in TestFlight nach [mobile-prelaunch.md](../quality/mobile-prelaunch.md),
danach die Klickliste in [app-store-submission-checklist.md](app-store-submission-checklist.md).

## Gespeicherte ASO-Optimierung

Name: **Ordilo: Dokumente & Scanner** (27/30 Zeichen)

Untertitel: **Papierkram für Familien ordnen** (30/30 Zeichen)

Keywords: `pdf,ordner,ablage,rechnungen,briefe,fristen,aufgaben,kalender,schule,kita,ocr,haushalt,suche` (92/100 Zeichen).

Die vollständige gespeicherte Beschreibung steht in [app-store-listing.md](app-store-listing.md). Sie beginnt mit dem konkreten Nutzen und führt von Scannen über Prüfen zu Antworten mit Fundstellen und gemeinsamer Familienorganisation. Keine Preisversprechen oder unbelegten Datenschutz-Superlative.

Titel, Untertitel und Keywords ergänzen sich. Keyword-Auswahl ist eine qualitative Hypothese; es liegen keine gemessenen Suchvolumina oder Rankingdaten vor. Nach Launch Suchimpressionen, Produktseitenaufrufe und Download-Conversion beobachten; Änderungen einzeln auswerten. Beschreibung dient vor allem der Überzeugung, Keyword-Wiederholung ersetzt keine gute Positionierung. [Apple: Produktseite](https://developer.apple.com/app-store/product-page/), [Auffindbarkeit](https://developer.apple.com/app-store/discoverability/).

## Bilder: Qualität vor Anzahl

Aktuell 6 von maximal 10 Screenshots und 0 von maximal 3 App-Vorschauen.
iPhone 6,9 Zoll ist befüllt; App Store Connect skaliert die Bilder auf die
weiteren angebotenen iPhone-Größen. Die native Konfiguration unterstützt keine
iPads.

Hochgeladen ist die vollständige Erzählung:
Scannen → konkrete Alltagsfrage → Antwort mit Fundstelle → Angaben prüfen →
Ablage → Familienplan. Maße 1260 × 2736, RGB ohne Alpha. Die exakten
Store-Dateien liegen unter `app-store-assets/`.

Gestalterisch sind Kontrast, Typografie und die wiedererkennbare Farbwelt schlüssig. Inhaltlich zeigen zwei Bilder den vorbereiteten Beispielbrief. Für einen stärkeren vollständigen Produktbeweis sind als nächste Motive sinnvoll:

Die ergänzenden Motive **„Der richtige Brief. Wieder da.“** und
**„Zusammen dran denken.“** sind bereits vorhanden. Vor dem Erst-Submit muss
das Set trotzdem ersetzt werden: `06-gemeinsam.png` zeigt den entfernten
Button „Ich übernehme das“ (siehe [app-store-screenshots.md](app-store-screenshots.md)).
Das neue Achter-Set liegt unter `app-store-assets/1.0/` und wird vor der
Einreichung in App Store Connect hochgeladen.

Vor neuen Aufnahmen aktuelle Release-Funktionen auf einem sauberen Testkonto prüfen. Keine privaten Dokumente aus dem vorhandenen Simulator verwenden. Mehr Motive nur mit zusätzlichem Nutzen. Die Testvideos sind nicht automatisch App-Preview-fertig; Format, Länge und tatsächliches App-Footage separat prüfen.

## Was wo ausfüllen?

| Bereich in App Store Connect | Entscheidung / Stand | Noch erforderlich |
|---|---|---|
| App-Informationen: Name, Untertitel, Sprache | Deutsche ASO-Fassung gespeichert; Deutsch primär | Englische Lokalisierung übersetzen oder bewusst entfernen |
| Kategorie | Produktivität gespeichert | Sekundärkategorie optional; aktuell nicht nötig |
| Altersfreigabe | 4+ berechnet, nicht Kids Category | Bei Änderungen an öffentlichen Inhalten/Funktionen erneut prüfen |
| Inhaltsrechte | Entschieden (23.09.2026): **„Ja“, die App greift auf Drittinhalte zu**, und die Rechte bestätigen. Grundlage: Die Websuche im Chat zeigt Titel, kurze Zusammenfassung und Link öffentlicher Webseiten; alles andere sind familieneigene Uploads, Beispiel- und Screenshot-Inhalte sind synthetisch selbst erstellt | Antwort bei der Einreichung so übernehmen (Details in der Einreichungs-Checkliste) |
| Lizenzvertrag | Apple-Standardvertrag; öffentliche Nutzungsbedingungen ergänzt | Rechtliche Prüfung der Bedingungen; bei einem späteren Abo Preis-, Laufzeit- und Kündigungstexte ergänzen |
| iOS-Version: Beschreibung, Keywords, Werbetext | Überarbeitet und gespeichert | Nach echtem Gerätetest auf Feature-Parität prüfen |
| Screenshots | Sechs Motive gespeichert; Scan → Frage → Beleg steht zuerst | Kein weiteres Bild für den Erst-Submit nötig; App Preview optional |
| Support-/Marketing-URL, Copyright | Gespeichert; Impressum unter ordilo.de/impressum ist vollständig (§ 5 DDG, § 18 MStV, geprüft 23.09.2026) | USt-IdNr. nachtragen, sobald zugeteilt; eigene Supportseite bleibt eine spätere Verbesserung |
| Datenschutz-URL | Gespeichert | URL ersetzt keine Datenerklärung |
| App-Datenschutz | Fragebogen ausgefüllt und veröffentlicht (11 Datentypen, kein Tracking) | Antworten bei Änderungen an der Datenerhebung aktualisieren und erneut veröffentlichen |
| KI-Einwilligung (Richtlinie 5.1.2(i)) | Ausdrückliche Einwilligung vor der ersten Übertragung an OpenAI/Datalab umgesetzt: einmaliger Dialog in App und Web, serverseitig erzwungen (`user_consents`, 403 `AI_CONSENT_REQUIRED`), in den Einstellungen änder- und widerrufbar, Ablehnung sperrt nur KI-Funktionen | Dialog und Widerruf auf dem finalen Build prüfen; in den Review Notes und den App-Privacy-Antworten erwähnen |
| Öffentliche Datenschutzerklärung | Final (23.09.2026): DPAs mit allen Dienstleistern geschlossen, Auftragsverarbeitung in Abschnitt 5 genannt, Transfergrundlagen in Abschnitt 7 eingetragen (DPF: Vercel, Sentry; SCCs: OpenAI, Datalab, Resend, RevenueCat; Supabase mit EU-Datenhaltung), alle Prüf-Hinweise entfernt | Bei neuen Dienstleistern oder Funktionen (z. B. Sentry-Aktivierung) Liste und Grundlage nachziehen |
| Datenexport | Authentifizierter JSON-Export über mobile Einstellungen umgesetzt | Auf Release-Backend und echtem Gerät prüfen; Originaldateien werden bewusst einzeln geteilt und sind nicht im JSON |
| Kontolöschung | Fehler bei Auth-Löschung wird nicht mehr als Erfolg gemeldet; eingeladene Konten verlieren ihre Mitgliedschaft erst mit erfolgreicher Auth-Löschung | Owner-, Einladungs- und Fehlerfall mit Wegwerfkonten auf dem Release-Backend prüfen |
| Build | App- und Paketversion auf 1.0.0 gesetzt; CI baut den Produktions-iOS-Bundle; Produktionsbuild für 1.0 erstellt (23.09.2026) | Build in TestFlight installieren, Geräte-Abnahme, dann für Version 1.0 auswählen |
| Fehlerdiagnose | Native Sentry-Integration vorbereitet; ohne DSN vollständig deaktiviert, Standard-PII aus | **Für 1.0 nicht erforderlich** — verschoben auf das erste Update nach Launch; DSN und Secrets ungesetzt lassen |
| App-Prüfung | Kontakt vorhanden; bestehender TestFlight-Review-Zugang in iOS 1.0 übernommen | Sichern und Review Notes aktualisieren; erst nach finalem Build absenden |
| TestFlight-Testinformationen | Beständiger Review-Zugang und Kontakt vorhanden; Anmeldung am 16.09.2026 geprüft | Zugang mit finalem TestFlight-Build erneut prüfen |
| Preise und Verfügbarkeit | Entwurf | Kostenloser Download als Freemium-Hypothese; Startländer bewusst wählen |
| Geschäftliches / Händlerstatus | Entschieden (23.09.2026): **Händler**. Die Erb Invest UG (haftungsbeschränkt), HRB 142639, tritt gewerblich auf — das gilt auch bei kostenlosem Download | In App Store Connect als Händler angeben und Adresse/Telefon/E-Mail für die DSA-Anzeige verifizieren (Angaben wie im Impressum) |
| Pläne und Kontingente | Migration `0081_family_entitlements.sql` ist im verknüpften Projekt angewendet; serverseitige Entitlements und atomare Monatskontingente für Dokumente und KI-Antworten sind umgesetzt, die Durchsetzung bleibt standardmäßig aus | **Für 1.0 bleibt die Durchsetzung aus.** Vor einem späteren Bezahlstart Bestandsfamilien bewusst zuordnen, den Kauflebenszyklus nachweisen und erst dann `BILLING_ENTITLEMENTS_ENABLED=1` setzen |
| In-App-Käufe / Abonnements | RevenueCat, Paywall, Wiederherstellen, Webhook und Entitlement-Sync sind auf `main`; Store-Produkte sind vorbereitet | **Nicht Teil von Version 1.0.** Produkte der Version nicht zuordnen und nicht miteinreichen; für das Abo-Update Sandbox-Kauf, Wiederherstellung, Kündigung, Ablauf, Refund, Retry und Familienwechsel nachweisen und die Produkte dann der neuen Version zuordnen |
| Verschlüsselung | Release-Prüfpunkt | Tatsächliche Nutzung und Build-Deklaration abgleichen; keine pauschale Ausnahme behaupten |
| Mac / Vision-Verfügbarkeit | Zusätzliche Plattformen wurden angeboten | Für ersten Launch bewusst festlegen und gegebenenfalls gesondert testen |
| Veröffentlichung | Aktuell automatische Veröffentlichung ausgewählt | Vor Einreichung für kontrollierten Prelaunch auf manuelle Freigabe umstellen |
| Events, Produktseitenvarianten, zusätzliche Medien | Optional | Keine Voraussetzung zum Erstlaunch; später für nachweisbare Wachstumsfragen einsetzen |

Keine Einreichung, Preisänderung oder Veröffentlichung wurde vorgenommen.

## Testzugang und nachweisbare Abnahme

Der beständige TestFlight-Review-Account wurde am 16.09.2026 erneut per
Passwort gegen das aktuelle Backend angemeldet; die Produktions-API akzeptierte
die Session. Seine Zugangsdaten bleiben außerhalb des Repositories und sind in
TestFlight gespeichert. Sie wurden in die App-Review-Felder für iOS 1.0
übernommen. Die frühere lokale Datei
`/tmp/ordilo-chat-acceptance-state.json` ist aktuell nicht vorhanden und war
nicht die dauerhafte Ablage dieses Zugangs. Das Erzeugungsskript
`scripts/chat-acceptance-fixture.ts` nicht blind erneut ausführen: Es erzeugt
ein anderes Wegwerfkonto und echte Testdaten.

Das ist keine TestFlight-Abnahme. Live-Befund in TestFlight:

- Build 24 / Version 0.1.0: bereit zur Übermittlung; eine Einladung, noch keine angezeigte Installation oder Sitzung.
- Build 23: eine Installation, acht angezeigte Sitzungen.
- Build 13: „Im Test“, interne und externe Gruppe zugeordnet.
- Build 12: „Abgelehnt“; Ursache in diesem Durchgang nicht untersucht.

Installationszahlen beweisen keine vollständigen Tests. Mit dem finalen Build müssen Login, Kamera/Mehrseitenscan, PDF-Import, Verarbeitung/Fehlerfall, Angabenprüfung, Frage/Fundstelle, Familienfreigabe, JSON-Export und Kontolöschung einschließlich Serverfehler auf einem echten Gerät geprüft werden. Bei Monetarisierung zusätzlich Kauf, Wiederherstellung und Kündigungs-/Erstattungsfälle. Abnahmematrix: [mobile-prelaunch.md](../quality/mobile-prelaunch.md).

## Freemium: Empfehlung zur Diskussion

**Dauerhaft kostenlos nutzbar; größere Nutzung über ein Familienabo.** Keine Abrechnung einzelner Fragen und kein automatischer kostenpflichtiger Mehrverbrauch. Der Nutzen entsteht wiederholt bei echten Briefen, oft über Wochen. Eine kurze reine Testversion kann enden, bevor diese Routine entsteht. Das ist eine Produkthypothese, noch kein gemessenes Ergebnis.

| Modell | Vorteil | Schwäche für Ordilo |
|---|---|---|
| Begrenztes Freemium + Familienabo | Niedrige Einstiegshürde; echter Alltagsnutzen vor Kauf | Kosten und Missbrauch im Gratisbereich müssen begrenzt werden |
| Zeitlich begrenzter Test + nur bezahlt | Klare Zahlungsentscheidung; begrenzt lange Gratisnutzung | Familien haben möglicherweise zu wenig relevante Briefe während der Testzeit |
| Abrechnung pro Dokument/Frage | Verbrauch und Umsatz hängen zusammen | Jede Frage fühlt sich wie eine Kaufentscheidung an; Kosten schwer vorhersehbar |

Startpunkt für einen Test, nicht live gesetztes Angebot:

- **Gratis:** ein gemeinsamer Familienbereich, 10 neue Dokumente und 10 KI-Antworten pro Monat. Einladung zur Familie, bestehende Dokumente und Fundstellen bleiben zugänglich.
- **Familie Plus:** zunächst 7,99 €/Monat oder 79 €/Jahr als messbare Hypothese für den ganzen Familienbereich. Paid-Limits werden erst nach der Beta anhand von p50/p90/p95/p99 festgelegt; die Datenbank behandelt sie bis dahin als produktseitig ungekappt, während die Tageslimits gegen Missbrauch aktiv bleiben.
- Bestehende Unterlagen bleiben bei erreichtem Limit bzw. Abo-Ende lesbar und exportierbar; neue kostenverursachende Verarbeitung stoppt nach klarer Erklärung. Speicher-, Dateigrößen- und Seitenlimits separat verständlich definieren, damit Dokumentzählung nicht durch sehr große PDFs ausgehöhlt wird.

Noch nicht belastbar: Zahlungsbereitschaft, tatsächliche Kosten pro Scan-Seite/Frage, Verhältnis Gratis-/Zahlhaushalte und Supportaufwand. Vor Preisentscheidung messen. Die aktuelle Rechnung und ihre Annahmen stehen in [2026-09-08-pricing-modelle.md](../brainstorms/2026-09-08-pricing-modelle.md). Tatsächliche Steuern, Apple-Konditionen und Abrechnung können abweichen. Jahresabos reduzieren den monatlichen Erlös zusätzlich.

Ein einzelner Marktanker: fileee bietet derzeit 10 Dokumente monatlich kostenlos sowie Basic für 4,99 €/Monat mit 50 Dokumenten. Daraus folgt keine validierte Zahlungsbereitschaft für Ordilo; Ordilos Familienworkflow muss den Unterschied beweisen. [Offizielle fileee-Preise](https://www.fileee.com/personal-pricing).

### Technischer Stand und erforderliche Umsetzung

Der Code enthält weiterhin tägliche Schutzlimits von jeweils 50 für Chat-Nachrichten, Uploads und Sprachtranskription. Die im verknüpften Projekt angewendete Migration `0081_family_entitlements.sql` stellt daneben die Pläne `free`, `founding` und `plus`, Trial-/Abo-Zustände, server-only Billing-Ereignisse und atomare UTC-Monatskontingente bereit. Chat und Upload verwenden stabile Operationsschlüssel; Wiederholungen werden nicht doppelt gezählt, fehlgeschlagene Verarbeitung gibt die Reservierung zurück. Die Durchsetzung bleibt bis zur bewussten Aktivierung mit `BILLING_ENTITLEMENTS_ENABLED=1` aus.

Store-Produkte, RevenueCat-Offering und -Entitlement, HMAC-Webhook,
Wiederherstellen und die Paywall sind implementiert. Vor Bezahlstart fehlen die
Sandbox-Nachweise für Kauf, Wiederherstellung, Kündigung, Refund, Ablauf,
Grace Period, Retry und Familienwechsel. Erst danach beide Billing-Schalter
aktivieren und einen neuen Produktionsbuild erstellen. Für digitale Funktionen
gelten die Apple-IAP-Vorgaben. [Apple Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [Abonnements](https://developer.apple.com/app-store/subscriptions/).

Händlerstatus ist eine separate Compliance-Angabe, kein „Paid-only“-Modell. Ihn anhand des tatsächlichen Unternehmensstatus beantworten, unabhängig davon, ob der Download gratis ist. [Apple: EU-Händlerstatus](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-eu-digital-services-act-compliance-information).
