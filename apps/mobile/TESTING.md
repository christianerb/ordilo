# Native testing without TestFlight

Use a development build for daily iPhone checks. It includes the native
modules (microphone, camera, Keychain) but loads JavaScript from Metro, so
changes arrive through Fast Refresh instead of a TestFlight upload.

## First time on an iPhone

1. Copy `.env.example` to `.env` and fill in the Supabase values plus a
   reachable `EXPO_PUBLIC_API_URL`.
2. Create one internal development build:

   ```bash
   cd apps/mobile
   npx eas build --profile development --platform ios
   ```

3. Install the resulting internal-build link on the iPhone. Expo Go is not
   sufficient for microphone and camera checks.

## Daily device loop

The phone and Mac must be on the same network when the API runs locally.

```bash
# Terminal 1: make the Next.js API reachable on the LAN.
npm run dev -- -H 0.0.0.0

# apps/mobile/.env
# EXPO_PUBLIC_API_URL=http://<MAC-LAN-IP>:3000

# Terminal 2: start Metro for the installed development build.
npm run dev:mobile -- --dev-client --lan
```

Open the development build, scan the Metro QR code, then use Fast Refresh
while checking the change. Use a deployed preview URL in `EXPO_PUBLIC_API_URL`
when testing away from the local network.

## Chat and voice smoke checklist

- The closed composer is one compact row, with input text and buttons
  vertically centered.
- Tap the microphone once: recording starts and the panel says
  “Aufnahme läuft”.
- Tap **Fertig** or the square microphone: recording stops, the transcript
  appears in the editable input, and the app does not send it automatically.
- Tap **Verwerfen**: the recording disappears and no text is inserted.
- Ask **“Dokumente zu Emma”**: Ordilo shows the matching confirmed
  documents as tappable sources.
- Ask **“Was steht in Emmas Dokumenten?”**: Ordilo performs a normal content
  search, not a title-only listing.

## Visual preview without a device

`ORDILO_PREVIEW=1` renders the app on the web with fixture data (Familie
Müller, an unread Elternbrief, a confirmed Stromrechnung, appointments and
tasks) instead of Supabase. The modules that only exist on a phone
(scanner, keychain, push, biometrics, native date picker, recorder) are
swapped for quiet stubs by `metro.config.js`; nothing of this touches a
normal build. Useful for screenshots of every screen in an iPhone-sized
Chromium, for example with Playwright:

```bash
cd apps/mobile
ORDILO_PREVIEW=1 EXPO_OFFLINE=1 EXPO_PUBLIC_API_URL=http://localhost:9999 \
  EXPO_PUBLIC_SUPABASE_URL=http://preview.invalid \
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=preview \
  npx expo export --platform web --output-dir /tmp/ordilo-web
npx serve /tmp/ordilo-web   # any static server with an index.html fallback
```

Deep links do not survive the static export (the router resets to `/`);
navigate by tapping through the app instead. Fixtures live in
`preview/fixtures.ts`, the fake client in `preview/fake-supabase.ts`.

## iOS polish smoke checklist (September 2026 redesign)

These flows were verified on the web preview above (iPhone 15 and SE
viewports) and still need one pass on a real iPhone before release:

- Dock: Start · Dokumente · Ordilo fragen · Plan · Scannen. The mark opens
  the chat as a modal in one tap; Scannen opens the compact sheet with the
  scan stage, Fotos and PDF (no error banner); „Brief scannen“ from Start
  opens VisionKit directly.
- Start: briefing card (overdue → today → new document → calm), faces on
  task and event rows, „Demnächst" grouped by day, tapping the family
  faces opens Familie.
- Dokumente: kind icons per row, people faces, month groups, filter chips
  (Neu, Art, Sortierung), search clear button, empty and filtered states.
- Dokument: the page starts on the title (no kind tile — the row you came
  from carried that icon), „Neu gelesen" above it on a fresh document,
  „Was das bedeutet" rows, Kalender toggles on a freshly read document,
  „Passt so" from the overview, inline image thumbnail, the „…" menu
  (Original, Ändern, Löschen), success screen with counts.
- Ordilo fragen: suggestions carry family names, „Zuletzt gefragt" opens a
  past conversation with its sources and cards, history sheet, delete,
  `?q=` prefill from a document.
- Plan: assignee face on every row, „Wer macht das?" with undo, person
  filter chips, header counts.
- Familie: members with role/age, birthday edit, invite link, settings and
  sign-out entries.
- Dynamic Type at the largest accessibility size: headers, chips, rows.
- Reduce Motion: TaskCheck spring, briefing card cross-fade.

Verified on the iOS Simulator (iPhone 16, iOS 26.5) on 3 September 2026
against the live API: dock, Start, Dokumente incl. filters and search,
document detail, Ordilo fragen with answer and history, Plan incl. „Wer
macht das?“ and „Wann ist das dran?“, Familie. Two notes for driving the
app with Maestro: use `launchApp: { stopApp: false }` (a cold relaunch of
the development client drops the first taps) and select elements by their
accessibility labels („Dokument scannen“, „Niemand zugeteilt, jemanden
auswählen“), not by the visible text.

## Automated checks

Run before device testing:

```bash
npm run lint
npm run typecheck
npm run test
npm run lint:mobile
npm run typecheck:mobile
npm run test:mobile
```

Maestro covers the unauthed app gate and login validation:

```bash
cd apps/mobile
maestro test maestro/
```

Authenticated chat flows still need a seeded test account and a controlled
OTP inbox. Until that exists, keep the device smoke checklist above as the
release gate for chat, voice and document retrieval.
