# Product-event platform attribution

Every product event carries a coarse `properties.platform`: `web`, `ios`, `android`, or `unknown`. Existing metadata such as scan source, onboarding step, and selected destination is preserved. No device identifier, user-agent string, or user content is collected.

- Browser-side events default to `web`; web onboarding server actions and the web auth callback specify `web` explicitly.
- Native events derive the value from React Native `Platform.OS`.
- Native API, chat streaming, voice, live conversation, and background scan requests send `x-ordilo-platform`. Search, chat, upload, document confirmation, and live-session completion routes retain it in their product event.
- API requests without the header are `web` only when browser fetch metadata is present and there is no bearer authentication. Unmarked bearer clients, invalid values, and unmarked API clients remain `unknown`.

The header is self-reported analytics metadata, never an authentication or authorization signal. A user may use multiple platforms; attribute individual events rather than permanently labelling the account. A signup's onboarding platform is an entry-channel signal, not proof of how the account was originally created.

Historical events must remain unknown. Existing mobile versions will remain unknown until updated. Web deployment and a mobile update are required before this change appears in production. `ios` alone does not distinguish App Store, TestFlight, or development installs.

The daily report reads only `platform:properties->>platform` in addition to existing content-free fields and groups recorded actions by platform. Accounts that only complete onboarding remain separate from users with subsequent product actions. The report must keep document counts separate from upload-event counts so tracking gaps remain visible.

No schema migration is required: platform uses the existing JSON event properties.
