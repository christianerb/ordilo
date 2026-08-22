# Maestro E2E-Smoke-Tests (iOS)

Grundgerüst für die E2E-Spalte der Paritäts-Matrix (`docs/MOBILE_PARITY.md`).
Die Flows hier brauchen **kein** Testkonto: sie prüfen den App-Gate und den
Login-Flow bis zur Code-Eingabe. Authentifizierte Flows (Scan, Review,
Ablage, …) folgen, sobald ein Testkonto-/Seed-Vertrag mit Agent D abgestimmt
ist — echte Supabase-Sessions lassen sich in Maestro nicht ohne Backend-
Vorbereitung herstellen.

## Voraussetzungen

```bash
brew install maestro
cd apps/mobile
npx expo run:ios          # Dev-Build auf Simulator oder Gerät
```

Die Flows erwarten die Bundle-ID `com.ordilo.app` und eine frisch
installierte App (kein bestehender Login im Keychain).

## Ausführen

```bash
maestro test maestro/
```

## Flows

| Flow | Nachweis für Matrix-Zeile |
| --- | --- |
| `01-app-gate.yaml` | Fundament: ohne Session landet man auf dem Login |
| `02-login-validation.yaml` | Fundament: E-Mail-Validierung mit deutscher Fehlermeldung |

## Hinweise

- Auf echten Geräten läuft der Flow identisch (`maestro test --device <id>`).
- Der Code-Eingabe-Schritt (OTP) ist absichtlich nicht automatisiert: er
  braucht ein abgreifbares Test-Postfach. Bis dahin bleibt die
  Real-iPhone-Spalte manuell.
