# Beta usage and intake acceptance

## Definitions

- Onboarding cohort: distinct accounts with a recorded onboarding start in the selected UTC date range. Completion must be recorded after that account's entry. Invitees without onboarding are not cohort entrants.
- Daily active: distinct accounts producing a document, search, chat, task or calendar action. Login alone is excluded. The older platform overview retains its broader login-or-action metric.
- Last onboarding step is an observation, not proof of abandonment. Optional member steps are not mandatory funnel requirements.
- Document status counts describe still-existing documents created during the selected range; deleted documents are not silently represented as retained ones.
- Usage is captured going forward. It cannot reconstruct historical costs.

## Provider consumption

Migration `0079_api_usage.sql` creates a server-only usage ledger. Client roles cannot read or insert it. Each chat/search request has an operation ID; document analysis/embedding stages carry the document ID and resolve the uploader for account attribution. Multiple model/tool rounds and embedding requests remain separate provider calls, aggregated into their parent operation. Attempts with no provider usage response remain unpriced.

OpenAI metering observes the JSON/SSE transport without storing prompts or responses. The ledger stores only identifiers, model and token counts. Recorded output tokens already contain reasoning tokens; cached reads and writes are subsets of input, not extra tokens. Unknown models, service tiers or incomplete usage remain unpriced. Standard direct-API estimates use the rates verified on 2026-09-07:

| Model | Input / 1M | Cached read / 1M | Output / 1M |
| --- | --- | --- | --- |
| gpt-5.6-terra | $2 | $0.20 | $12 |
| gpt-5.6-luna | $0.20 | $0.02 | $1.20 |
| text-embedding-3-large | $0.13 | — | — |

Cache writes cost 1.25 times uncached input. GPT-5.6 prompts over 272,000 tokens use twice input and 1.5 times output rates. Built-in web-search calls add $0.01 each. Prices are configurable with server-only `OPENAI_USAGE_RATES_USD` JSON keyed by exact provider model (`input`, `cached`, `output`, each USD/million). Unknown snapshot names are not guessed. These are direct standard API estimates, not billing reconciliation, regional surcharges or negotiated rates.

Sources: [OpenAI API pricing](https://developers.openai.com/api/docs/pricing), [Terra pricing and context rules](https://developers.openai.com/api/docs/models/gpt-5.6-terra), [embedding pricing](https://developers.openai.com/api/docs/models/text-embedding-3-large), [Responses cache-write usage](https://developers.openai.com/api/reference/cli/resources/responses/methods/retrieve).

Datalab page consumption and `cost_breakdown.final_cost_cents` are recorded per conversion. A live synthetic one-page probe on 2026-09-07 returned `{"final_cost_cents":1}`: $0.01. [Datalab documents the breakdown in cents](https://documentation.datalab.to/docs/welcome/api). Missing or unfamiliar breakdowns remain unpriced. Native voice-transcription and standalone inbound-email inference have usage scopes; browser WebRTC realtime consumption still requires provider billing reconciliation. The dashboard must not be treated as complete all-service billing.

## Intake behavior

Two uploads run concurrently outside the scan/import screen. Files and server IDs are checkpointed before handoff. Transfers use Expo FileSystem's native background multipart session, allowing already-started iOS uploads to continue after app switches. The native promise may settle only when the app resumes. Transient errors returned to JavaScript retry on a 15-second foreground heartbeat or on foreground return. Permanent errors stay visible for explicit retry. A server-pipeline handoff does not wait for OCR/analysis. Not-yet-started files wait if iOS suspends JavaScript; continuous execution after force-quit is not claimed.

iOS Expo legacy `writeAsStringAsync` uses `Data.write(..., .atomic)` for these non-append checkpoints (verified against the installed native source). Queue mutations serialize read/modify/write and the worker lock waits for both parallel workers, including failures.

## Device evidence and limits

Test device: booted iPhone 16 QA simulator, iOS 26.5. Installed app includes `expo-sharing-extension.appex`; app configuration points at `https://ordilo.de`. Synthetic test PDF: `/private/tmp/ordilo-relief-brief.pdf` (school notice explicitly marked synthetic), served on loopback port 3199. Safari successfully displayed it and opened the native share sheet.

The share sheet currently exposes only a dismissal accessibility element to the computer-use bridge. Coordinate input failed with `windowNotFoundAtPosition`; selecting “Mehr” and Ordilo has not yet been verified. No successful end-to-end share upload is claimed. Physical-device and offline/force-quit acceptance remain pending.

## Local checks

- Web and mobile lint/type checks passed; full web unit suite passed with two workers. An earlier full-concurrency run timed out once in the existing note-sheet test; isolated rerun and the subsequent full run passed.
- All 48 mobile suites (424 tests) passed. Queue tests cover bounded concurrency, offline retry, checkpointed handoff, account/route cancellation and permanent errors. Native transport tests cover background multipart authentication and retryable/unconfirmed responses.
- Production web build passed.
- Migration applied twice inside an isolated PostgreSQL transaction; server-only privileges, null costs and duplicate provider IDs checked; transaction rolled back. This test is included in CI.
- Supabase CLI migration dry run passed against that isolated instance with `PGSSLMODE=disable`; no application migrations were deployed remotely.
- No production migration or application deployment performed. New native behavior is not certified by the old installed binary's share-sheet screenshot.
