# First value, alongside Mobile Relief Intake

Branch: `feature/onboarding-first-value`, starting at `bbc2139` on `origin/main`.
Worktree: `.worktrees/feature/onboarding-first-value`.

## This change

- A prepared example before login on native and web, also available from web
  onboarding and native empty Home. One explicit question reveals a short answer
  and its exact source passage. No account, AI request, permission, document,
  task, calendar event or analytics event is created by the example.
- After a real confirmation, one primary action leads to the calendar, tasks or
  a question about the saved document. Batch scanning and finishing stay optional.
  The native calendar destination selects the calendar tab and clears an old
  person filter. Question behavior follows each platform's existing contract:
  native prefills a question to send, web submits the explicit question action.
- Web success waits for the confirmation response. An unsuccessful save leaves
  the review and retry in place, not a false success or navigation opportunity.
- The edited web review passes retained task count, created appointment count
  and corrected title to its parent. A due date is described as a due date,
  never as a promise that a push reminder is scheduled.
- Privacy-safe result-view and next-action events, plus an entry-choice event
  replacing the misleading new writes of `onboarding_scan_started`.

## Deliberately owned by Mobile Relief Intake

Do not duplicate its pending work: native scan-before-member-setup, durable
upload/share intake, push registration/delivery, real saved outcome counts,
home briefing recovery and task handoff. This branch does not claim those
features are already integrated. It also does not remove the web family setup
form yet; default-family creation and unified import entry should be integrated
against the merged lifecycle, not implemented as a competing flow.

## Merge order

1. Finish and merge Mobile Relief Intake into `main`.
2. Fetch `origin/main`, then integrate it into this branch. If this branch has
   been published, prefer merging `origin/main` rather than rewriting history.
3. Resolve the small integration points deliberately:
   - native Home: retain Relief's first-visit/recovery logic; keep the example;
   - native onboarding: retain Relief's entry-first ordering; preserve the
     example-independent copy and the honest entry-choice measurement;
   - native document confirmation: feed `DocumentNextStep` the actual saved
     outcome from Relief, retaining its save errors and undo behavior;
   - native Plan: retain Relief's agenda and accept the explicit `tab` parameter;
   - migration `0074` belongs to Relief. Reconcile any event allow-list additions
     before applying this branch's `0075`.
4. Finish the shared first-run lifecycle: minimal family creation, scan/import
   entry and resumed work. Check web and native together.
5. Re-run all checks and real-device intake/push tests. Only then mark the PR
   ready to merge. Never reset the other worktree or repair its local database.

## Measurement contract

`onboarding_completed` means setup only. Do not label it activation.

| Event | Meaning |
| --- | --- |
| `onboarding_started` | Existing first-time post-login funnel entry |
| `onboarding_entry_selected` | Choice of scan or browsing, not a capture |
| `document_upload_succeeded` | Existing real upload success |
| `document_result_viewed` | A readable result rendered, not merely fetched |
| `document_confirmed` | Server accepted the real document confirmation |
| `document_next_step_selected` | A requested destination, not proof it was used |

Use the first real `document_confirmed` per user/family as an activation
hypothesis, not a proven predictor of retention. Measure median and p90 time
from onboarding start to result and confirmation. Deduplicate result views by
user/document for funnel conversion; later views remain useful for return
analysis. Confirmation now includes `document_id` for correlation. Historical
events without it must not be silently compared as an identical cohort.

Measure meaningful return separately: a later confirmed document, completed
task or successful retrieval on another day (7/28-day cohorts), not just opening
the app or tapping a next-action button. Control for corrections, failures and
notification opt-outs. No fabricated uplift targets or automatic re-engagement
messages. Examples never count as real activation.

New client payloads allow only the document ID and a fixed choice/destination.
No titles, filenames, questions, document contents or contact details. Anonymous
example usage is intentionally untracked. Deploy the additive event migration
before clients; analytics failure must never block a user action.

## Validation

Automated tests cover example interaction and reset, zero demo writes, outcome
routing on both platforms, allowed telemetry properties, inaccessible documents,
analytics failures, pending/failed confirmation and legacy event compatibility.

Final local checks passed: web lint, TypeScript, 2,939 tests and production
build; native lint, TypeScript and 350 tests. The Expo fixture web export also
succeeded. Browser interaction and screenshots covered the login example at
375×667 and 1280×900; the desktop document width matched the viewport. Existing
Next.js workspace-root/Edge-runtime and test-environment warnings remain.

The local migration dry run is blocked: the Supabase instance reached with
`--local` has unrelated timestamp-based migration history, not this repository's
numbered history. No migration history repair or schema change was attempted.
The SQL allow-list has a static regression test; a dry run against the correct
Ordilo development database remains required before merge.

Physical-device camera, push, keyboard and accessibility behavior require the
post-merge device pass. Browser/native-web previews are not device certification.
