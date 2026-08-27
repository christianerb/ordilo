# 008 — Fix web voice-meter motion

- **Status**: IMPLEMENTED — MANUAL FEEL CHECK PENDING
- **Commit**: d230bcb
- **Severity**: MEDIUM
- **Category**: Performance & accessibility
- **Estimated scope**: 2 runtime files and voice tests, about 100 lines

## Problem

The voice meter samples audio with `requestAnimationFrame`, publishes snapshots through React/external-store updates, and renders each bar by changing height:

```tsx
// src/components/ordilo/ai-search-bar.tsx:151-186 — current
frameRef.current = requestAnimationFrame(tick);
style={{ height: `${Math.max(5, 6 + level * 18)}px` }}

// src/lib/realtime/use-realtime-transcription.ts:217-227 — current
levelsRef.current = snapshot;
notifyLevelListeners();
levelFrameRef.current = requestAnimationFrame(tick);
```

The continuous meter has no Reduced Motion branch. Height changes cause layout/paint on every sample.

## Target

Bars have a fixed 24px height and animate only:

```tsx
style={{ transform: `scaleY(${Math.max(0.2, level)})` }}
className="h-6 origin-center transition-transform duration-75"
```

Sampling may remain rAF-driven because it reads live audio, but visual notifications must be capped to the existing tracker cadence and stop entirely when recording stops. Under Reduced Motion, render a static three-bar or single-dot recording indicator and do not publish decorative level snapshots to React.

## Repo conventions to follow

- Mobile `apps/mobile/src/components/chat.tsx:559-598` already uses fixed bars with `scaleY` and a 120ms UI-thread timing.
- The meter is `aria-hidden`; accessible recording status comes from surrounding controls.
- No canvas or visualization dependency should be added.

## Steps

1. Add a reusable `usePrefersReducedMotion` hook or use the repo’s existing media-query hook to read `(prefers-reduced-motion: reduce)`.
2. Change `VoiceLevelBars` to fixed-height bars with `transform: scaleY(...)`, center origin and 75ms transform transition.
3. Under Reduced Motion, render a static indicator and bypass dynamic `levels.map` transforms.
4. Pass the preference into both local and realtime level-meter start functions.
5. When Reduced Motion is active, skip analyser sampling/level notifications while preserving microphone capture and transcription.
6. Ensure every stop/cleanup path cancels the rAF and closes AudioContext exactly once.
7. Extend voice tests for normal transform output, Reduced Motion static output, and cancellation.

## Boundaries

- Do NOT change transcription, microphone permissions, audio capture or recording duration behavior.
- Do NOT route audio to speakers.
- Do NOT animate height, width or SVG path data.
- Do NOT add Web Audio worklets or dependencies.

## Verification

- **Mechanical**: run AI search and realtime transcription tests, then full lint/typecheck/test/build.
- **Feel check**:
  - Record on Safari iOS, Chrome Android and desktop Safari/Chrome.
  - Confirm bars react without moving surrounding controls.
  - Profile with CPU throttling and confirm bar updates do not produce layout.
  - Enable Reduced Motion before and during recording; the indicator should become static without interrupting transcription.
- **Done when**: live audio feedback is smooth, cleanup-safe and non-moving under Reduced Motion.
