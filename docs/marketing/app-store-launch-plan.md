# Ordilo: App Store und Freemium – Arbeitsstand 08.09.2026

## Gespeicherte ASO-Optimierung

Name: **Ordilo: Dokumente & Scanner** (27/30 Zeichen)

Untertitel: **Papierkram für Familien ordnen** (30/30 Zeichen)

Keywords: `pdf,ordner,ablage,rechnungen,briefe,fristen,aufgaben,kalender,schule,kita,ocr,haushalt,suche` (92/100 Zeichen).

Die vollständige gespeicherte Beschreibung steht in [app-store-listing.md](app-store-listing.md). Sie beginnt mit dem konkreten Nutzen und führt von Scannen über Prüfen zu Antworten mit Fundstellen und gemeinsamer Familienorganisation. Keine Preisversprechen oder unbelegten Datenschutz-Superlative.

Titel, Untertitel und Keywords ergänzen sich. Keyword-Auswahl ist eine qualitative Hypothese; es liegen keine gemessenen Suchvolumina oder Rankingdaten vor. Nach Launch Suchimpressionen, Produktseitenaufrufe und Download-Conversion beobachten; Änderungen einzeln auswerten. Beschreibung dient vor allem der Überzeugung, Keyword-Wiederholung ersetzt keine gute Positionierung. [Apple: Produktseite](https://developer.apple.com/app-store/product-page/), [Auffindbarkeit](https://developer.apple.com/app-store/discoverability/).

## Bilder: Qualität vor Anzahl

Aktuell 3 von maximal 10 Screenshots und 0 von maximal 3 App-Vorschauen. Diese Zähler zeigen Medienplätze, keinen Fertigstellungsgrad. Drei Screenshots müssen nicht auf zehn aufgefüllt werden. iPhone 6,9 Zoll ist befüllt; die angebotene Skalierung deckt 6,5 Zoll ab. Die derzeitige native Konfiguration unterstützt keine iPads.

V2 ist hochgeladen: Scannen → konkrete Alltagsfrage → Antwort mit Fundstelle. Maße 1260 × 2736, RGB ohne Alpha. Vorschau: `app-store-screenshots/v2/preview-v2.png`.

Gestalterisch sind Kontrast, Typografie und die wiedererkennbare Farbwelt schlüssig. Inhaltlich zeigen zwei Bilder den vorbereiteten Beispielbrief. Für einen stärkeren vollständigen Produktbeweis sind als nächste Motive sinnvoll:

4. **Alles wiederfinden. Auch ohne dich.** Echte native Dokumentenablage eines rein synthetischen Familienkontos.
5. **Nicht alles an dir hängen lassen.** Echte native gemeinsame Aufgaben-/Terminansicht mit synthetischen Daten.

Vor neuen Aufnahmen aktuelle Release-Funktionen auf einem sauberen Testkonto prüfen. Keine privaten Dokumente aus dem vorhandenen Simulator verwenden. Mehr Motive nur mit zusätzlichem Nutzen. Die Testvideos sind nicht automatisch App-Preview-fertig; Format, Länge und tatsächliches App-Footage separat prüfen.

## Was wo ausfüllen?

| Bereich in App Store Connect | Entscheidung / Stand | Noch erforderlich |
|---|---|---|
| App-Informationen: Name, Untertitel, Sprache | Deutsche ASO-Fassung gespeichert; Deutsch primär | Englische Lokalisierung übersetzen oder bewusst entfernen |
| Kategorie | Produktivität gespeichert | Sekundärkategorie optional; aktuell nicht nötig |
| Altersfreigabe | 4+ berechnet, nicht Kids Category | Bei Änderungen an öffentlichen Inhalten/Funktionen erneut prüfen |
| Inhaltsrechte | Noch offen | Tatsächliche Drittinhalte und Nutzungsrechte bestätigen; keine Lizenzbehauptung erfinden |
| Lizenzvertrag | Apple-Standardvertrag; öffentliche Nutzungsbedingungen ergänzt | Rechtliche Prüfung der Bedingungen; bei einem späteren Abo Preis-, Laufzeit- und Kündigungstexte ergänzen |
| iOS-Version: Beschreibung, Keywords, Werbetext | Überarbeitet und gespeichert | Nach echtem Gerätetest auf Feature-Parität prüfen |
| Screenshots | Drei V2-Motive gespeichert | Zwei ergänzende Produktansichten empfehlenswert, nicht Pflicht |
| Support-/Marketing-URL, Copyright | Gespeichert | Eigene Supportseite verbessert Hilfe; Impressum enthält derzeit Kontakt |
| Datenschutz-URL | Gespeichert | URL ersetzt keine Datenerklärung |
| App-Datenschutz | Fragebogen unvollständig | Native App, Backend und SDKs auf tatsächliche Datenerhebung, Zuordnung und Zwecke prüfen |
| Öffentliche Datenschutzerklärung | Einmalcode und Passwort beschrieben; vorläufiges Launch-Versprechen entfernt | Verträge, Rollen der Dienstleister und Drittland-Grundlagen pro Anbieter rechtlich und anhand der Vertragsunterlagen prüfen |
| Datenexport | Authentifizierter JSON-Export über mobile Einstellungen umgesetzt | Auf Release-Backend und echtem Gerät prüfen; Originaldateien werden bewusst einzeln geteilt und sind nicht im JSON |
| Kontolöschung | Fehler bei Auth-Löschung wird nicht mehr als Erfolg gemeldet; eingeladene Konten verlieren ihre Mitgliedschaft erst mit erfolgreicher Auth-Löschung | Owner-, Einladungs- und Fehlerfall mit Wegwerfkonten auf dem Release-Backend prüfen |
| Build | App- und Paketversion auf 1.0.0 gesetzt; CI baut den Produktions-iOS-Bundle | Frischen EAS-Produktionsbuild erstellen, in TestFlight installieren und für Version 1.0 auswählen |
| Fehlerdiagnose | Native Sentry-Integration vorbereitet; ohne DSN vollständig deaktiviert, Standard-PII aus | EAS-Secrets (`EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`) setzen, frischen Native-Build erstellen und einen synthetischen Testfehler prüfen |
| App-Prüfung | Login/Kontakt im Store-Versionsformular leer | Beständigen synthetischen Review-Zugang und Kontakt hinterlegen; genaue Testschritte ergänzen |
| TestFlight-Testinformationen | Benutzername vorhanden, Passwortfeld leer; Kontakttelefon/-mail leer | Zugang im aktuellen Build prüfen und Angaben vervollständigen |
| Preise und Verfügbarkeit | Entwurf | Kostenloser Download als Freemium-Hypothese; Startländer bewusst wählen |
| Geschäftliches / Händlerstatus | Noch offen | Unternehmenseigenschaft und erforderliche Kontaktdaten verifizieren; Händlerstatus ist unabhängig vom Preismodell |
| Pläne und Kontingente | Migration `0081_family_entitlements.sql`, serverseitige Entitlements sowie atomare Monatskontingente für Dokumente und KI-Antworten umgesetzt; standardmäßig per Feature-Flag aus | Migration im Zielprojekt trocken prüfen und anwenden, Bestandsfamilien bewusst zuordnen, dann `BILLING_ENTITLEMENTS_ENABLED=1` setzen |
| In-App-Käufe / Abonnements | Provider-neutrales Backend-Fundament vorhanden; noch keine StoreKit-/RevenueCat-Integration oder Paywall | Produkte, Kauf, Wiederherstellen, Webhook-Synchronisierung, Ablauf, Grace Period und Refunds implementieren und in der Sandbox prüfen |
| Verschlüsselung | Release-Prüfpunkt | Tatsächliche Nutzung und Build-Deklaration abgleichen; keine pauschale Ausnahme behaupten |
| Mac / Vision-Verfügbarkeit | Zusätzliche Plattformen wurden angeboten | Für ersten Launch bewusst festlegen und gegebenenfalls gesondert testen |
| Veröffentlichung | Aktuell automatische Veröffentlichung ausgewählt | Vor Einreichung für kontrollierten Prelaunch auf manuelle Freigabe umstellen |
| Events, Produktseitenvarianten, zusätzliche Medien | Optional | Keine Voraussetzung zum Erstlaunch; später für nachweisbare Wachstumsfragen einsetzen |

Keine Einreichung, Preisänderung oder Veröffentlichung wurde vorgenommen.

## Testzugang und nachweisbare Abnahme

Ein bestehender lokaler synthetischer Account wurde gefunden. Seine Anmeldung am konfigurierten Backend wurde erfolgreich geprüft, einschließlich erwarteter Benutzer-/Familienzuordnung und Zugriff auf 15 Dokumente. Zugangsdaten bleiben außerhalb des Repositories. Lokaler Fundort: `/tmp/ordilo-chat-acceptance-state.json` (temporär, nicht dauerhaft gesichert); Erzeugungsskript: `scripts/chat-acceptance-fixture.ts`. Dieses Skript nicht blind erneut ausführen: Es erzeugt Testdaten.

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

Der Code enthält weiterhin tägliche Schutzlimits von jeweils 50 für Chat-Nachrichten, Uploads und Sprachtranskription. Daneben stellt Migration `0081_family_entitlements.sql` die Pläne `free`, `founding` und `plus`, Trial-/Abo-Zustände, server-only Billing-Ereignisse und atomare UTC-Monatskontingente bereit. Chat und Upload verwenden stabile Operationsschlüssel; Wiederholungen werden nicht doppelt gezählt, fehlgeschlagene Verarbeitung gibt die Reservierung zurück. Die Durchsetzung bleibt bis zur bewussten Aktivierung mit `BILLING_ENTITLEMENTS_ENABLED=1` aus.

Vor Bezahlstart fehlen noch In-App-Purchase-Produkte, verifizierte Provider-Webhooks, Wiederherstellen, Refund-/Ablauf-/Grace-Period-Behandlung, Sandbox-Tests und eine verständliche Paywall. Für digitale Funktionen in der App die geltenden Apple-IAP-Vorgaben berücksichtigen. [Apple Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [Abonnements](https://developer.apple.com/app-store/subscriptions/).

Händlerstatus ist eine separate Compliance-Angabe, kein „Paid-only“-Modell. Ihn anhand des tatsächlichen Unternehmensstatus beantworten, unabhängig davon, ob der Download gratis ist. [Apple: EU-Händlerstatus](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-eu-digital-services-act-compliance-information).
