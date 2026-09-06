# Mobile smoke tests

These flows target a native development build (`com.ordilo.app`), not Expo Go.
Use an isolated simulator or a dedicated QA device. See
[`mobile-prelaunch.md`](../../../docs/quality/mobile-prelaunch.md) for the fixture
contract and remaining device acceptance.

## Signed-out checks

Sign out through the app before each command. A cleared app container on iOS does
not guarantee a cleared Keychain session. These flows deliberately never clear the
entire device Keychain.

```bash
cd apps/mobile
maestro test maestro/01-app-gate.yaml
# Sign out / return to the signed-out entry before the next command.
maestro test maestro/02-login-validation.yaml
```

The entry smoke follows the current introduction's “Loslegen” button to the email
screen. The validation smoke checks the actual accessibility label and German
validation error without sending an email.

## Authenticated checks

Prepare the synthetic fixture and sign in normally as described in the acceptance
document. Keep that session; do not run signed-out checks in the same batch.

```bash
cd apps/mobile
maestro test maestro/authenticated/03-demo-and-intake.yaml
maestro test maestro/authenticated/04-library-and-evidence.yaml
```

| Flow | Coverage |
| --- | --- |
| `01-app-gate.yaml` | Signed-out introduction → real login screen |
| `02-login-validation.yaml` | Invalid email, German feedback, no email sent |
| `authenticated/03-demo-and-intake.yaml` | Fictional demo, answer/source interaction, intake chooser, session after restart |
| `authenticated/04-library-and-evidence.yaml` | Seeded library search, document detail, real chat answer → source → document |

Do **not** run `maestro test maestro/` as a batch: the groups require different
session states. The authenticated flows do not receive passwords or OTPs as
arguments and do not install sessions through a test-only app path.

Prerequisites: Maestro with a working Java runtime, native build on an available
iOS simulator/device, reachable API and Supabase project matching the build.
The chat smoke needs a working AI backend and may consume quota. A timeout,
missing source, or wrong source is a failure; there is no optional-pass fallback.

Command references: [launchApp](https://docs.maestro.dev/reference/commands-available/launchapp),
[scrollUntilVisible](https://docs.maestro.dev/reference/commands-available/scrolluntilvisible).
