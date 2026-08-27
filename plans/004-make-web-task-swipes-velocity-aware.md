# 004 — Make web task swipes velocity-aware

- **Status**: IMPLEMENTED — MANUAL FEEL CHECK PENDING
- **Commit**: d230bcb
- **Severity**: MEDIUM
- **Category**: Interruptibility
- **Estimated scope**: 1 component and its tests, about 100 lines

## Problem

Task swipes commit only after a fixed distance and settle with a fixed-duration tween:

```tsx
// src/components/ordilo/swipeable-task-card.tsx:53 — current
const SWIPE_THRESHOLD = 72;

// src/components/ordilo/swipeable-task-card.tsx:234 — current
Math.abs(dx) > SWIPE_THRESHOLD && canSwipe(direction) ? direction : 0;

// src/components/ordilo/swipeable-task-card.tsx:309-314 — current
const transition =
  reducedMotion.current || phase === "live"
    ? "none"
    : `transform ${phase === "slide-off" ? SLIDE_OFF_DURATION : 300}ms var(--ease-out-quart)`;
```

A short fast flick is rejected, while a slow drag barely crossing 72px commits. Release velocity is discarded.

## Target

Track touch time and the latest horizontal delta. A swipe commits when either:

```ts
Math.abs(distance) > 72 || Math.abs(distance) / elapsedMs > 0.11
```

During the gesture, update the moving element’s `transform` directly through a ref instead of triggering a React render for every touch event. On release, retarget from the current transform using a CSS transition:

```css
transform 200ms cubic-bezier(0.23, 1, 0.32, 1)
```

Reduced Motion commits immediately and keeps only panel opacity/color feedback. Existing axis lock, rising resistance, click suppression, haptic threshold tick, reversible actions and Honest Panel behavior must remain.

## Repo conventions to follow

- Existing constants and gesture rules are documented in `swipeable-task-card.tsx:35-78`.
- The strong target curve is `cubic-bezier(0.23, 1, 0.32, 1)`.
- No Framer Motion or spring library is installed; use Pointer/Touch events, refs and CSS transitions already available.

## Steps

1. Add refs for gesture start time, latest raw `dx`, and the moving row element.
2. Preserve the one-time 8px axis lock and current `resist(dx)` function.
3. In move handling, set `rowRef.current.style.transform = translate3d(...)` and update panel opacity directly; avoid `setOffset` on every frame.
4. Preserve React state only for semantic phases that affect markup, accessibility or panel labels.
5. On release, calculate `elapsedMs = Math.max(performance.now() - startTime, 1)` and speed `Math.abs(rawDx) / elapsedMs`.
6. Commit if distance exceeds 72px or speed exceeds `0.11` px/ms in a valid direction.
7. Set the final transform from the current visual position and use a 200ms strong ease-out transition for slide-off or snap-back.
8. Keep completion callback timing aligned with the 200ms slide-off; cancel prior timers/animations before retargeting.
9. Extend `src/components/ordilo/__tests__/swipeable-task-card.test.tsx` with:
   - fast short flick commits;
   - slow short drag snaps back;
   - invalid direction never moves/commits;
   - Reduced Motion commits without positional settle.

## Boundaries

- Do NOT add dependencies.
- Do NOT change swipe labels, colors, directions or action semantics.
- Do NOT add destructive swipe actions.
- Do NOT weaken vertical-scroll axis locking.
- If direct style updates conflict with current test harness behavior, STOP and report rather than falling back to per-frame React state.

## Verification

- **Mechanical**: run the swipeable-task-card test file, then `npm run lint && npm run typecheck && npm run test && npm run build`.
- **Feel check**:
  - On iPhone Safari, perform a 20–40px quick flick; it should commit naturally.
  - Drag slowly to 40px; it should snap back.
  - Reverse direction before release; the row must follow without restarting from zero.
  - Scroll vertically with a slight diagonal drift; the row must not smear sideways.
  - Enable Reduced Motion; movement should disappear but action state remains clear.
- **Done when**: distance and velocity both produce predictable, interruptible task swipes without scroll conflicts.
