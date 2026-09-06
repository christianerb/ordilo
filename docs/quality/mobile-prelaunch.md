# Native prelaunch acceptance

Status: automated checks and native build completed; flows authored against the
current labels. **No completed Maestro run or real-device acceptance is claimed.**
Java is installed, but the normal shell does not select it automatically. YAML
parsing is only a syntax check, not a device result.

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
writes and real analysis calls. No seed or production mutation was performed for
this implementation.

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
| Large text | At maximum accessibility text size, finish demo, scan chooser, document correction and source reading. No clipped essential values or unreachable actions. | Pending |
| Screen reader | With VoiceOver/TalkBack: navigate and activate source, edit fields, hear errors and save result; focus order follows reading order. | Pending |
| Permission denial | Deny camera/photos/notifications, then retry through the indicated settings path. No dead end or misleading success. | Pending |
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

### Migrations and validation boundaries

Apply `0077_document_corrections.sql` and `0078_family_access_management.sql`
before deploying the dependent app/API. Both are idempotent. No linked Supabase
schema was modified by this work. The linked-project dry run lacked a CLI access
token; a dry run against the disposable local PostgreSQL instance succeeded.
It lists migrations and does not replace executing them.

`supabase/tests/document_corrections.sql` and `family_access.sql` execute in an
isolated PostgreSQL transaction and roll back. They cover authorization, RLS,
idempotency, conflicts, rollback, task-state preservation, date synchronization,
current correction evidence and revoked invitation handling. The existing
pgvector/graph update RPC is stubbed in this focused database fixture; these
checks do not certify the complete deployed database. CI runs these contracts in
a disposable PostgreSQL service.

Web and mobile lint/type checks and unit tests pass; the production web build and
fresh iOS simulator build pass. The simulator build was installed after the old
binary was found to lack ExpoCrypto. This does not constitute a completed
interactive device acceptance or native encryption round trip. The device matrix
above intentionally remains pending.
