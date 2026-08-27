# 010 — Remove settings section entrances

- **Status**: IMPLEMENTED — DEVICE CHECK PENDING
- **Commit**: d230bcb
- **Severity**: MEDIUM
- **Category**: Purpose & frequency
- **Estimated scope**: 1 screen and focused tests, about 35 lines removed

## Problem

Every visit to native settings replays five staggered spring entrances:

```tsx
// apps/mobile/app/einstellungen.tsx:153-245 — current
<FadeInView index={0}>...</FadeInView>
...
<FadeInView index={4}>...</FadeInView>
```

```ts
// apps/mobile/src/lib/motion.ts:53-54 — current
export function staggerDelay(index: number, step = 70, max = 420) {
  return Math.min(index * step, max);
}
```

The fifth section starts 280ms late on a screen users may visit frequently. The motion explains no state change.

## Target

Render every settings section immediately as a normal `View` or fragment. Keep subtle press feedback on actual controls, but remove all screen-mount section motion.

## Repo conventions to follow

- The current branch already removed repeated entrances from native document and collection lists.
- Frequent settings content belongs in the “no animation” frequency tier.
- Existing `SpringPressable` remains available for interactive controls.

## Steps

1. Remove `FadeInView` from imports in `apps/mobile/app/einstellungen.tsx`.
2. Remove all five `FadeInView` wrappers without changing their child order or layout.
3. Keep or migrate `PressableScale` separately according to plan 011; do not mix that migration into this plan unless plan 011 is executed first.
4. Update screen tests/snapshots that expect animated wrappers.
5. Verify settings content appears as soon as the screen mounts.

## Boundaries

- Do NOT add a replacement page fade.
- Do NOT change toggle, legal-link, account or delete behavior.
- Do NOT change settings copy or styling.

## Verification

- **Mechanical**: `rg -n "FadeInView" apps/mobile/app/einstellungen.tsx` returns no matches; run mobile lint/typecheck/tests.
- **Feel check**:
  - Navigate into settings repeatedly from an iPhone.
  - The first and last sections should be available immediately with no staged reveal.
  - Confirm scrolling and VoiceOver order are unchanged.
- **Done when**: settings has zero mount entrance motion and all interactive feedback still works.
