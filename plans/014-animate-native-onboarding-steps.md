# 014 — Animate native onboarding steps

- **Status**: IMPLEMENTED — DEVICE CHECK PENDING
- **Commit**: d230bcb
- **Severity**: LOW
- **Category**: Missed opportunity — explanation
- **Estimated scope**: 2 files and onboarding tests, about 90 lines

## Problem

Three rare onboarding states replace one another as plain views:

```tsx
// apps/mobile/app/onboarding.tsx:248-470 — current
{step === "family-name" && <View style={styles.stepBody}>...</View>}
{step === "add-member" && <View style={styles.stepBody}>...</View>}
{step === "ready" && <View style={styles.stepBody}>...</View>}
```

The user completes a meaningful step, but the next page teleports in. A restrained directional transition can explain forward progress.

## Target

Add a shared native step-entry builder in `apps/mobile/src/theme/motion.ts`:

```ts
// normal motion
FadeInRight.duration(220)
  .withInitialValues({
    opacity: 0,
    transform: [{ translateX: 12 }],
  })
  .easing(Easing.bezier(0.23, 1, 0.32, 1))

// Reduced Motion
FadeIn.duration(150)
  .easing(Easing.bezier(0.23, 1, 0.32, 1))
```

Exit uses opacity only for 150ms. Do not slide the whole native route or keyboard. The ready screen may keep the existing contextual `OrdiloCharacter` motion.

## Repo conventions to follow

- `apps/mobile/src/theme/motion.ts:43-60` already defines opacity and 8px feedback builders.
- Use Reanimated layout entering/exiting builders on the step container, not core `Animated`.
- Use `useReducedMotion()` and pass the boolean into the builder.

## Steps

1. Add `stepEntering(direction, reduceMotion)` and `stepExiting()` builders to the canonical theme.
2. Wrap each mutually exclusive `stepBody` in `Animated.View` with a stable key matching the step.
3. Track navigation direction: forward uses +12px; any explicit back path uses -12px.
4. Use 220ms strong ease-out entry and 150ms opacity exit; avoid overlapping focus transitions longer than 220ms.
5. Keep ScrollView and KeyboardAvoidingView mounted so keyboard state is not rebuilt by animation.
6. Reduced Motion uses only 150ms opacity.
7. Add tests for builder selection, stable step keys and no animation on the outer screen/scroll view.

## Boundaries

- Do NOT delay API calls, validation or focus.
- Do NOT animate height, keyboard position, progress width or ScrollView offset.
- Do NOT add bounce to form steps.
- Do NOT change onboarding copy or routing.

## Verification

- **Mechanical**: onboarding tests plus all mobile lint/typecheck/tests.
- **Feel check**:
  - Use a release build on a physical iPhone.
  - Advance through all steps; content should arrive 12px from the right with no keyboard jump.
  - Tap rapidly during transition; the current state must remain valid and no stale step should flash.
  - Test 200% Dynamic Type and Reduce Motion.
  - On the slowest supported Android, confirm no dropped frames.
- **Done when**: onboarding progress feels directional and calm, with opacity-only Reduced Motion.
