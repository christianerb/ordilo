# Native prelaunch acceptance

Status (2026-09-10): automated checks, a locally signed Release simulator build,
and the signed-out/authenticated simulator matrix are complete. Maximum Dynamic
Type passed on an iPhone 16 and iPhone SE simulator. **Physical-device,
VoiceOver, hardware capture, reliable permission-denial, network interruption
and TestFlight acceptance remain open.**

## Disposable fixture contract

Reuse `scripts/chat-acceptance-fixture.ts`; do not introduce another login method,
a hard-coded token, or real-family sample documents. The existing runner:

- creates an isolated `ordilo-chat-qa-…@example.com` account and the family
  `Chat-Abnahme · synthetisch`;
- records credentials and created IDs in a private temporary state file (mode
  `0600`, default `/tmp/ordilo-chat-acceptance-state.json`);
- verifies synthetic email, family name and creator before reusing state;
- analyzes and confirms the entries in `docs/quality/chat-documents.json` through
  the real pipeline; the expected record is `Elternabend Hannah`, whose source
  says 15 September 2027, 19:30, room B12;
- can attach a synthetic PDF with the `original` command.

Use a dedicated QA Supabase project. The runner's localhost API restriction does
**not** prove that its configured Supabase project is local. Check the deployment
configuration without printing keys, and ensure the native build uses the same
project and reachable API. On a phone, `localhost` refers to the phone; use the
configured development host for the native API.

With the local API running and `.env.local` pointing at that QA project:

```bash
NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local scripts/chat-acceptance-fixture.ts seed
NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local scripts/chat-acceptance-fixture.ts original
```

Seed only after verifying this dedicated environment. These commands make backend
writes and real analysis calls. For the 2026-09-10 acceptance run, the verified
disposable family was seeded with 15 analyzed, confirmed and indexed synthetic
documents and a synthetic PDF. The local API handled fixture setup; the installed
Release app reached the configured deployed API for chat. No real family was used.

Sign in to the account through the app's existing “Mit Passwort anmelden” flow,
using the private state file locally. Never paste its contents into a chat, CI
logs, Maestro variables, screenshots, or an issue. Complete any legitimate system
permission/app-lock prompts before the automated run. The family already has
onboarding completed. Use a separately created disposable account to test the
initial onboarding route itself.

Keep the state file for fixture reuse; deleting it first creates another account
on the next seed. When done, remove the synthetic account, its family records and
storage through the QA project's normal test-data cleanup process, verifying the
record IDs against this private file, then remove the file. Do not bulk-delete by
family display name.

## Automated smoke entry points

See [`apps/mobile/maestro/README.md`](../../apps/mobile/maestro/README.md).
Run signed-out flows and authenticated flows as separate groups. Save the native
build commit, OS/device, date, sanitized report and outcome with each run.
Authenticated smoke validates library read/search, real sourced chat, the local
demo, intake controls and retained login after restart. It does not prove camera
capture, a complete upload, correction propagation, or offline storage.

### Completed simulator evidence (2026-09-10)

Environment: Xcode iOS 26.5 simulators, locally signed Release build (`Sign to
Run Locally`), Sentry upload disabled for the local build. The local signature is
required because an unsigned simulator build cannot use the app's Keychain
entitlement and therefore cannot validate SecureStore session persistence.

| Check | Device and result | Sanitized report |
| --- | --- | --- |
| Signed-out intro and login handoff at maximum Dynamic Type | iPhone 16 — Pass | `/tmp/ordilo-maestro-large-text-intro-max-fixed.xml` |
| Demo, source, intake chooser and retained login after restart at maximum Dynamic Type | iPhone 16 — Pass (1m 12s); iPhone SE — Pass (1m 15s) | `/tmp/ordilo-maestro-iphone16-large-text-demo-pass-final.xml`; `/tmp/ordilo-maestro-iphonese-large-text-demo-pass.xml` |
| Library search, sourced chat, reading sheet and return to document at maximum Dynamic Type | iPhone 16 — Pass (1m 13s); iPhone SE — Pass (1m 7s) | `/tmp/ordilo-maestro-iphone16-large-text-evidence-pass-final.xml`; `/tmp/ordilo-maestro-iphonese-large-text-evidence-pass-final.xml` |
| Confirmed-document correction fields reachable; cancel without saving | iPhone 16 — Pass (21s); iPhone SE — Pass (24s) | `/tmp/ordilo-maestro-iphone16-large-text-correction.xml`; `/tmp/ordilo-maestro-iphonese-large-text-correction.xml` |

The exact standard-text evidence flow also passed earlier on both simulators:
`/tmp/ordilo-maestro-iphone16-evidence-fixed.xml` and
`/tmp/ordilo-maestro-iphonese-evidence-fixed.xml`. Simulator content size was
restored to `large` after the accessibility run.

## Required device acceptance before launch

Use at least an iPhone with a small viewport, a current iPhone, and an Android
phone if Android is part of launch. Record actual device model, OS and build.
All rows below start **pending** until supported by a run recording/report.

| Scenario | Procedure and required outcome | Status |
| --- | --- | --- |
| First-use value | Fresh account → family setup → example → question → quoted source → own scan. Demo creates no family documents/tasks. Back and resume remain usable. | Pending |
| Capture to confirmed document | Capture a legible synthetic letter with date/amount, check original, correct an extraction, confirm, find the document in library, verify task/event values. | Pending |
| Confirmed correction | Edit a confirmed amount/date/person; reopen document, task/event and ask Ordilo. Verify current values and preserved original source; no duplicate tasks/events. | Pending |
| Connection lost during upload | Start upload, disconnect, terminate app, reconnect/reopen. Retry completes once with no duplicate document; failures stay actionable. | Pending |
| Offline access | Save an original offline, disconnect, reopen it after restart. Verify saved timestamp, unsupported-file feedback, removal, sign-out/account-switch isolation. | Pending |
| Family access | Invite a disposable second account; verify visible scope, current account list and removal. After removal, old session cannot fetch protected family records. | Pending |
| Large text | At maximum accessibility text size, finish demo, scan chooser, document correction and source reading. No clipped essential values or unreachable actions. | **Pass — iPhone 16 and iPhone SE simulators, iOS 26.5, locally signed Release build (2026-09-10). Physical device still required.** |
| Screen reader | With VoiceOver/TalkBack: navigate and activate source, edit fields, hear errors and save result; focus order follows reading order. | Pending |
| Permission denial | Deny camera/photos/notifications, then retry through the indicated settings path. No dead end or misleading success. | Pending — simulator microphone revoke/reset continued to report access granted; denial UI branch and focused regressions pass, but hardware/system denial requires a physical device. |
| Live chat errors | Disconnect during answer and retry; quota failure and stop controls remain understandable. Never show an unrelated source as supporting evidence. | Pending |

For each failure, record steps, expected/actual behavior and a synthetic-only
screenshot. A checked source selector or passing unit suite does not substitute
for these device observations.

## Implemented in this branch

- Confirmed documents can edit extracted metadata, tasks and identifiers. A
  revision brackets the load; the save transaction rejects concurrent changes.
  Existing task status, completion and assignee survive. Still-matching simple
  calendar events follow date corrections. Removing extracted dates does not
  delete separately managed calendar events. OCR snippets are comparison aids;
  the original file remains available separately.
- Chat evidence reads current saved corrections dynamically and labels them as
  family corrections, distinct from original pages. No generated quote is
  inserted into the original OCR.
- Native family settings list actual account access and active invitations.
  Owner-only revocation invalidates existing invitation links atomically.
- Explicit offline originals and metadata are encrypted with AES-GCM; the key is
  device-only SecureStore. Files are scoped to account/family, deleted on logout
  and reconciled after successful membership refresh. Offline copies do not
  update automatically. PDFs use the explicit system open/share sheet.
- The `/beispiel` shortcut reuses the shared first-value example already on main;
  no second example or duplicate onboarding path is introduced.
- Account deletion now reports an auth-user deletion failure instead of showing
  success. Invited users keep their family membership until auth deletion
  succeeds; an owner whose family data was already removed can retry the final
  auth deletion.
- Mobile settings can request the authenticated `/api/me/export` endpoint and
  share a temporary JSON file. The API uses caller-scoped RLS reads and omits
  storage paths, signed URLs, tokens, encrypted secrets and internal processing
  data. Original files stay available as individual document downloads and are
  not bundled into the JSON export. The temporary mobile file is deleted after
  the share sheet closes or fails.
- Public German Nutzungsbedingungen are linked from login, landing and mobile
  settings. The privacy page now covers email code and password login and
  explicitly leaves processor contracts and third-country transfer grounds for
  legal verification instead of promising future completion.
- Native Sentry crash reporting is wired through the Expo plugin and Sentry
  Metro config. It is fully disabled without `EXPO_PUBLIC_SENTRY_DSN`, does not
  send default PII, and uses a 5% production trace sample. A fresh EAS build
  with source-map secrets and a synthetic TestFlight event still needs proof.
- The app and package versions are aligned at 1.0.0. CI now exports a
  production iOS JavaScript bundle in addition to lint, type and unit checks.
- Migration `0081_family_entitlements.sql` adds provider-neutral family plans,
  trial/subscription states, server-only billing events and atomic monthly
  quotas. Enforcement is deliberately off until the migration is verified,
  existing families are assigned consciously and the server-only flag
  `BILLING_ENTITLEMENTS_ENABLED=1` is set.

### Migrations and validation boundaries

Apply `0077_document_corrections.sql`, `0078_family_access_management.sql` and
`0081_family_entitlements.sql` before deploying their dependent app/API code.
All three are idempotent. No linked Supabase schema was modified by this work.
The linked-project dry run still requires valid CLI access. Local disposable
PostgreSQL contracts do not replace a linked-project dry run and controlled
deployment.

`supabase/tests/document_corrections.sql`, `family_access.sql`,
`family_entitlements.sql` and `family_entitlements_concurrency.sql` cover
authorization, RLS, idempotency, conflicts, rollback, task-state preservation,
date synchronization, revoked invitations, plan resolution, month boundaries,
release/retry behavior and real two-connection quota races. The focused fixtures
do not certify the complete deployed database. CI runs them in a disposable
PostgreSQL service.

Web and mobile lint/type checks and unit tests pass; the production web build and
fresh iOS simulator build pass. Interactive simulator acceptance is complete for
the rows explicitly marked Pass above. Focused offline, voice, notification and
large-text regressions passed (39 tests), but `simctl` offers no isolated,
reliable network cut for this setup, so connection-loss and offline restart rows
remain pending. Native encryption round trips, hardware permissions, VoiceOver
and the remaining device rows are not certified by simulator results.
