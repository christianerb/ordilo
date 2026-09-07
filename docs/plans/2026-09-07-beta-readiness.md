# Beta readiness: durable intake and usage visibility

## Requested outcome

- Import multiple documents without waiting on the scan screen. Persist local files and retry interrupted transfers; processing after upload belongs to the server.
- Exercise an actual iOS share-sheet PDF import locally and record the environment and any remaining device/backend limits.
- Extend the existing protected admin dashboard (open PR #101 overlaps main) with onboarding progression, document volume, daily product activity and failure stages.
- Measure variable API consumption only: token/OCR usage, cumulative and monthly per account, per document and per search/chat request. No hosting or other fixed costs requested. Unknown provider usage/prices must remain unknown, not zero.

## Findings

- Working branch updated to main at 9335ed5 before implementation.
- Scan UI currently chooses only the first queued item and waits for analysis; its lifecycle aborts processing on unmount.
- Upload endpoint already supports a stable upload key and server job handoff. Preserve those guarantees.
- iOS inbox path resolution was repaired on main. A real share-sheet run still needs verification.
- Two QA simulators are booted. Simulator access requires sandbox escalation.
- Product events and the admin dashboard already exist. Current activity includes login; meaningful daily product activity should be distinguished.

## Verification

- Queue: parallelism bound, crash/response-loss replay, checkpoint failure, transient retry, account change and server handoff.
- Native: synthetic PDF through share sheet, leave intake, verify durable queue and resulting server document; clearly distinguish simulator and physical-device evidence.
- Analytics: cohort denominators, UTC day/month boundaries, unique active users, duplicate usage recording, nullable costs and per-operation attribution.
- Required repository checks before PR: web/mobile lint, typecheck and unit tests, production build.
