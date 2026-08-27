# 011 — Consolidate the native motion system

- **Status**: IMPLEMENTED — DEVICE CHECK PENDING
- **Commit**: d230bcb
- **Severity**: LOW
- **Category**: Cohesion & tokens
- **Estimated scope**: 6 files, net code reduction

## Problem

Two live native motion vocabularies define different press behavior and APIs:

```ts
// apps/mobile/src/lib/motion.ts:15 — current
export const motion = { duration: ..., spring: ... };

// apps/mobile/src/components/motion.tsx:37,66-69 — current
scaleTo = 0.965
scale.value = withSpring(scaleTo, motion.spring.snappy);
scale.value = withSpring(1, motion.spring.snappy);

// apps/mobile/src/theme/motion.ts:32-33 — current working tree
export const pressScale = 0.97;
export const pressDuration = 120;
```

The old components use `.value` and spring both press directions; the current system uses Reanimated CSS transitions, `.get()`/`.set()` where shared values are needed, and a 120ms/0.97 frequent-interaction contract.

## Target

One native vocabulary:

- tokens/builders: `apps/mobile/src/theme/motion.ts`;
- shared controls: `apps/mobile/src/components/ui.tsx`;
- press feedback: 0.97 scale, 120ms, `cubic-bezier(0.23, 1, 0.32, 1)`;
- shared values use `.get()`/`.set()`;
- `ReduceMotion.System` exported from the theme for builders that need it.

Delete `src/components/motion.tsx` and `src/lib/motion.ts` after all imports migrate.

## Repo conventions to follow

- `SpringPressable` in the current `src/components/ui.tsx` is the target press implementation despite its historical name.
- `src/theme/motion.ts` owns canonical duration/easing builders.
- Plan 010 removes the only `FadeInView` call sites before deletion.

## Steps

1. Execute plan 010 first.
2. Replace remaining `PressableScale` uses in `app/einstellungen.tsx` with `SpringPressable`, preserving outer/content styles and accessibility roles.
3. Export `REDUCE_MOTION = ReduceMotion.System` from `src/theme/motion.ts`.
4. Change `src/lib/app-lock.tsx` to import `REDUCE_MOTION` from the theme.
5. Delete `src/components/motion.tsx` and `src/lib/motion.ts`.
6. Remove or rewrite `notifications-motion.test.ts` assertions that test deleted tokens; preserve notification permission tests unrelated to motion.
7. Convert remaining `.value` access in current motion code to `.get()`/`.set()` where Reanimated 4 supports it, without touching unrelated state code.
8. Search for old imports and require zero matches.

## Boundaries

- Do NOT change gesture physics in document preview or chat waveform.
- Do NOT rename public UI components outside the mobile app.
- Do NOT introduce a third token module.
- Do NOT re-add settings entrance animations.

## Verification

- **Mechanical**:
  - `rg -n "@/src/(lib|components)/motion|\\.value" apps/mobile --glob '*.{ts,tsx}'` has no obsolete motion imports; inspect any remaining `.value` before changing it.
  - Run mobile lint, typecheck and all 255+ tests.
- **Feel check**:
  - On a physical iPhone, compare settings links, primary buttons and document rows; press depth and timing must match.
  - Press, drag off, return and release; feedback must retarget without a snap.
  - Enable Reduce Motion; press scale disappears but haptic and color feedback remain.
- **Done when**: one token module and one shared press primitive define native tactile motion.
