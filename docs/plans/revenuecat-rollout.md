# RevenueCat-Rollout für Ordilo Plus

Stand: 2026-09-16
Status: Integration auf `main`, Sandbox-Abnahme und Aktivierung offen

## Produktentscheidung

- Free bleibt der kostenlose Einstieg und ersetzt eine zusätzliche Testphase.
- Ordilo Plus kostet 7,99 € pro Monat oder 79,99 € pro Jahr.
- Es gibt zum Start keinen Store-Trial und kein Founding-Angebot.
- Ein Kauf gilt für den gemeinsamen Ordilo-Familienbereich.
- GPT Live (Live-Sprachgespräch) ist der erste kontextuelle Plus-Moment
  und bereits serverseitig über `hasLiveConversationAccess` abgesichert.

## Verbindliche Produktkennungen

### App Store Connect

Subscription Group: `Ordilo Plus`
Subscription Group ID: `22383365`

| Paket | Product ID | Apple-ID | Preis Deutschland |
| --- | --- | --- | ---: |
| Monatlich | `com.ordilo.app.plus.monthly` | `6811798964` | 7,99 € |
| Jährlich | `com.ordilo.app.plus.yearly` | `6811797136` | 79,99 € |

Beide Produkte sind automatisch verlängerbare Abos. Keine Introductory Offer
und keine Free Trial anlegen. Die übrigen Länder erhalten Apples
preisäquivalente Stufen; diese vor der Einreichung auf ungewöhnliche
Abweichungen prüfen.

App Store Connect ist vorbereitet:

- Beide Produkte sind in allen 175 Ländern und Regionen verfügbar; künftige
  Regionen werden automatisch eingeschlossen.
- Die Abo-Gruppe ist auf Deutsch als `Ordilo Plus` lokalisiert.
- Die Produktnamen sind `Ordilo Plus monatlich` und `Ordilo Plus jährlich`.
- Beide Produkte verwenden die Beschreibung
  `Fragen per Sprache, klare Antworten mit Quellen.`
- Familienfreigabe, Intro-Angebote und Trials sind nicht aktiviert.
- Der Status bleibt `In Vorbereitung zur Übermittlung`; noch nichts zur
  Prüfung hinzufügen.

### Google Play

Subscription: `ordilo_plus`

| Base Plan | Abrechnung |
| --- | --- |
| `monthly` | monatlich, automatisch verlängerbar |
| `yearly` | jährlich, automatisch verlängerbar |

Auch hier keine Offer- oder Trial-Phase anlegen.

## RevenueCat-Projekt

Projekt: `Ordilo` (`b197e691`)

Erledigt am 2026-09-14:

- App `Ordilo (App Store)` angelegt: App-ID `app2f1db16c74`, Bundle ID
  `com.ordilo.app`.
- In-App-Purchase-Key hinterlegt (`SubscriptionKey_L987RS78A8.p8`, Key-ID
  `L987RS78A8`, Issuer-ID `5a5fb28e-0b24-4345-9bd0-3019375df011`).
  RevenueCat meldet `Valid credentials`. Apple lässt keinen erneuten
  Download der `.p8`; das Original liegt in `~/Downloads` und gehört in eine
  sichere Ablage.
- Öffentlicher iOS SDK-Key: `appl_iSBuhdmQudhJwZQNXeznSMNpLlb` (für EAS,
  `EXPO_PUBLIC_` geeignet).
- Produkte manuell angelegt (Import braucht zusätzlich einen App Store
  Connect API Key, `AuthKey_*.p8` — optional nachrüstbar):
  - `com.ordilo.app.plus.monthly` → `proda28c480279` (`Ordilo Plus monatlich`)
  - `com.ordilo.app.plus.yearly` → `prod8fea83e1bb` (`Ordilo Plus jährlich`)
- Entitlement `plus` (`entlade53fe93f`, Anzeigename `Ordilo Plus`) mit
  beiden App-Store-Produkten verknüpft. Das ältere Test-Store-Entitlement
  `ordilo_pro` bleibt unangetastet und gilt nur für Test-Store-Produkte.
- Offering `default` (`ofrng8114b63d05`) ist das Current Offering:
  - `$rc_monthly` → `com.ordilo.app.plus.monthly` (App Store) + Test Store
  - `$rc_annual` → `com.ordilo.app.plus.yearly` (App Store) + Test Store
  - Das vorbefüllte `$rc_lifetime`-Paket wurde entfernt; es gibt kein
    Lifetime-Produkt.
- Die App zeigt das jährliche Package zuerst (steuert sie selbst über
  `offering.annual` vor `offering.monthly`).

Noch offen:

1. Android-App mit Package `com.ordilo.app` verbinden.
2. Store-Produkte importieren (sobald ein App Store Connect API Key
   hinterlegt ist; bis dahin reicht die manuelle Pflege).
3. Die Play-Base-Pläne mit `plus` verbinden, sobald Android angebunden ist.

## Umgebungsvariablen

### Mobile / EAS

In den EAS-Umgebungen `preview` und `production`:

```text
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_iSBuhdmQudhJwZQNXeznSMNpLlb  (gesetzt am 2026-09-14)
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=<öffentlicher Android SDK-Key>
EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=plus
EXPO_PUBLIC_BILLING_ENTITLEMENTS_ENABLED=
```

Die beiden SDK-Keys sind öffentliche App-Schlüssel. Sie dürfen mit
`EXPO_PUBLIC_` ausgeliefert werden. Den Rollout-Schalter erst nach dem
Ende-zu-Ende-Test auf `1` setzen.

### Server / Vercel

In Preview und Production:

```text
REVENUECAT_SECRET_API_KEY=<neuer RevenueCat Secret API Key>
REVENUECAT_WEBHOOK_SIGNING_SECRET=<Signing Secret der Webhook-Integration>
REVENUECAT_ENTITLEMENT_ID=plus
BILLING_ENTITLEMENTS_ENABLED=
```

Der Secret API Key und das Webhook Signing Secret sind Server-Secrets. Sie
dürfen nie in `apps/mobile`, in eine `EXPO_PUBLIC_`-Variable oder in Git.
Der Secret API Key, das am 15.09.2026 neu rotierte Webhook Signing Secret und
`REVENUECAT_ENTITLEMENT_ID=plus` sind in Preview und Production hinterlegt.
Ein in Chat, Ticket oder Log geteiltes Secret vor Verwendung erneut rotieren.

## Webhook

Angelegt am 2026-09-14 als Integration `Ordilo Backend`
(`whintgr7601fa8b70`):

- URL: `https://app.ordilo.de/api/billing/revenuecat`
- Umgebungen: Sandbox und Production
- Apps/Event-Typen: alle
- HMAC Webhook Signing: aktiviert; das Signing Secret wurde einmalig
  angezeigt und gehört als `REVENUECAT_WEBHOOK_SIGNING_SECRET` in Vercel
  (Rotation jederzeit über `Rotate secret` möglich).

Der Endpoint prüft die HMAC-Signatur mit fünf Minuten Toleranz, protokolliert
die Event-ID idempotent und lädt danach den kanonischen Customer-Status aus
RevenueCat. Transfer-Events synchronisieren Quell- und Zielfamilie.

Offen (optional, empfohlen): Die Apple-Server-Notification-URL
`https://api.revenuecat.com/v1/incoming-webhooks/apple-server-to-server-notification/hUZODGhjbAlMUthRSxzlTEtpPFyafJNS`
in App Store Connect unter App-Informationen → App Store-Server-
Benachrichtigungen für Produktion und Sandbox eintragen. Der Eintrag
schlug am 2026-09-14 mehrfach mit einem generischen Apple-Fehler fehl
(„Es ist ein Fehler aufgetreten. Versuche es später erneut.") — später
erneut versuchen. Nicht blockierend: Unser Webhook und der Client-Sync
decken den Entitlement-Status bereits ab.

## Sichere Aktivierungsreihenfolge

1. Migrationen `0081` bis `0085` in Supabase angewendet und verifiziert
   (das provider-neutrale Billing-Fundament kam mit PRs #187/#188 auf main).
2. Store-Produkte und Store-Verträge vollständig einrichten. (iOS erledigt)
3. RevenueCat-Apps, Entitlement, Offering und Packages konfigurieren.
   (iOS erledigt am 2026-09-14, Android offen)
4. Neue Secrets in Vercel und öffentliche SDK-Keys in EAS hinterlegen.
   Der zuvor im Chat geteilte Secret API Key muss vorher in RevenueCat
   rotiert werden.
5. Preview-Build erstellen.
6. Sandbox-Monatsabo kaufen.
7. Prüfen:
   - Paywall schließt nach dem Kauf.
   - Das Live-Gespräch startet direkt (ohne Umweg über Fehlermeldung).
   - `family_entitlements` enthält `plan_code=plus`.
   - Webhook-Retry verändert das Ergebnis nicht.
   - Restore stellt Plus auf einem zweiten Testgerät wieder her.
8. Kündigung und Ablauf in beschleunigter Sandbox-Zeit prüfen.
9. Erst danach beide Rollout-Schalter auf `1` setzen und neu deployen/bauen.

## Noch vor App-Review

- Die `.p8`-Schlüsseldatei `SubscriptionKey_L987RS78A8.p8` aus `~/Downloads`
  in eine sichere Ablage (z. B. Passwortmanager) übertragen. Apple erlaubt
  keinen zweiten Download.
- Apple-Server-Notification-URL eintragen (siehe Webhook-Abschnitt; Apple
  meldete zuletzt einen temporären Fehler).
- Nutzungsbedingungen und Datenschutzerklärung enthalten jetzt Ordilo Plus,
  Preise, Laufzeit, automatische Verlängerung, Kündigung, Wiederherstellen,
  getrennte Kontolöschung sowie RevenueCat/Apple. Rechtliche Prüfung bleibt
  vor Veröffentlichung erforderlich.
- Store-Metadaten, Datenschutzangaben und Review Notes ergänzen. Die
  Review Notes nennen dabei auch den einmaligen KI-Einwilligungsdialog
  (Richtlinie 5.1.2(i)), der vor dem ersten Scan, der ersten Frage und
  der ersten Spracheingabe erscheint und in den Einstellungen widerrufbar
  ist.
- Einen echten Kauf, Restore, Kündigung, Ablauf und Familienwechsel auf iOS
  testen.
- Android erst aktivieren, wenn das Play-Produkt ebenfalls vollständig
  geprüft ist.
