# 015 — Animate the native login state change

- **Status**: IMPLEMENTED — DEVICE CHECK PENDING
- **Commit**: d230bcb
- **Severity**: LOW
- **Category**: Missed opportunity — state indication
- **Estimated scope**: 2 files and login tests, about 70 lines

## Problem

The email form is immediately replaced by OTP entry:

```tsx
// apps/mobile/app/(auth)/login.tsx:234-389 — current
{codeSent ? (
  <View style={styles.form}>...</View>
) : (
  <View style={styles.form}>...</View>
)}
```

Sending the code is a consequential state change, but the surface teleports without continuity.

## Target

Reuse `stepEntering`/`stepExiting` from plan 014:

- email → code: enter from +12px over 220ms strong ease-out;
- “Adresse ändern”: email enters from -12px over 220ms;
- exit: 150ms opacity;
- Reduced Motion: 150ms opacity only.

Keep the wordmark, ScrollView and KeyboardAvoidingView stationary. Animate only the form region.

## Repo conventions to follow

- Canonical builders live in `apps/mobile/src/theme/motion.ts`.
- The current document detail uses keyed Animated content for in-place state changes at `apps/mobile/app/document/[id].tsx:268-270`.
- Form submission and pending-login persistence must remain untouched.

## Steps

1. Execute plan 014’s shared builder addition first.
2. Track transition direction when a code is sent or the user chooses “Adresse ändern”.
3. Replace the two plain form roots with a single keyed `Animated.View` around the selected form.
4. Apply the shared 220ms directional entry and 150ms opacity exit.
5. Keep `autoFocus` behavior; verify it does not remount the outer KeyboardAvoidingView.
6. Reduced Motion uses only opacity.
7. Add login tests for forward/back direction, keyed state, pending login restoration and Reduced Motion selection.

## Boundaries

- Do NOT animate keyboard position or the whole screen.
- Do NOT delay OTP send/verify, state updates, focus or auth callbacks.
- Do NOT change validation, cooldown, secure storage or copy.
- Do NOT add haptic feedback to login.

## Verification

- **Mechanical**: login tests and all mobile lint/typecheck/tests.
- **Feel check**:
  - In an iOS release build, send a code with the keyboard visible; only the form region should transition.
  - Tap “Adresse ändern” while entry is still settling; motion must retarget without stale content.
  - Background the app, restore a pending login, and confirm it opens directly in code state without an incorrect forward animation.
  - Enable Reduce Motion; verify a short fade only.
- **Done when**: auth state changes are clear, fast and keyboard-stable on iOS and Android.
