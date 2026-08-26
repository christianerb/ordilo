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
