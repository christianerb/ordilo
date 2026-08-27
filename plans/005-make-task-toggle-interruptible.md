# 005 — Make task completion interruptible

- **Status**: IMPLEMENTED — MANUAL FEEL CHECK PENDING
- **Commit**: d230bcb
- **Severity**: MEDIUM
- **Category**: Interruptibility & performance
- **Estimated scope**: 2 files and task-card tests, about 80 lines

## Problem

A reversible, high-frequency task toggle starts three keyframe animations:

```tsx
// src/components/ordilo/task-card.tsx:129,159,355 — current
isDone && "animate-task-done"
className="size-3.5 animate-check-pop ..."
isDone && "animate-strike text-muted-foreground line-through"
```

```css
/* src/app/globals.css:221-255 — current */
@keyframes check-pop { /* opacity + scale */ }
@keyframes task-done-pulse { /* scale + background-color */ }
@keyframes strike-through { /* clip-path */ }
```

Rapidly reopening a task restarts keyframes instead of retargeting from the current state. The card pulse paints background color, and the strikethrough animates clip-path.

## Target

Use interruptible transitions:

- checkbox check: `opacity` and `transform: scale(0.95 → 1)` over 160ms with `cubic-bezier(0.23, 1, 0.32, 1)`;
- checkbox surface: color/border transition over 150ms;
- task title strike: an absolutely positioned line using `transform: scaleX(0 → 1)`, `transform-origin: left`, 160ms strong ease-out;
- card: no completion scale pulse; an optional 150ms background-color transition only.

The check element and strike line remain mounted so state reversals retarget rather than restart.

## Repo conventions to follow

- `.press-scale` already handles the button press itself.
- Harbor Blue remains the only completion color.
- The audit standard permits 100–160ms press/state feedback and requires transform/opacity for motion.

## Steps

1. In `TaskCard`, remove `animate-task-done`, `animate-check-pop`, and `animate-strike`.
2. Keep `<Check>` mounted and toggle classes between `opacity-0 scale-[0.95]` and `opacity-100 scale-100`.
3. Add explicit `transition-[opacity,transform] duration-150` and the strong ease-out timing through a reusable class or arbitrary Tailwind timing function.
4. Replace `line-through` animation markup with a relatively positioned title wrapper and an `aria-hidden` line whose `scaleX` follows `isDone`.
5. Keep semantic text decoration (`line-through`) applied immediately for accessibility/fallback; the visual overlay supplies the animated draw.
6. Remove obsolete keyframes/utilities from `globals.css` and their Reduced Motion selectors.
7. Under Reduced Motion, keep the immediate semantic state and a short color/opacity change; suppress scale/line movement.
8. Add tests proving the check remains mounted across state changes and no removed animation classes remain.

## Boundaries

- Do NOT delay the data mutation or optimistic task state.
- Do NOT change haptic behavior, row layout, labels or due-date styling.
- Do NOT animate width, clip-path or background with keyframes.
- Do NOT add celebration motion elsewhere.

## Verification

- **Mechanical**: run task-card and Aufgaben tests, then `npm run lint && npm run typecheck && npm run test && npm run build`.
- **Feel check**:
  - Toggle a task done/open rapidly five times; check and strike must reverse smoothly.
  - At 10% DevTools playback, confirm no keyframe restarts and no card-scale pulse.
  - Record Performance; completion should not trigger layout and should avoid clip-path paint animation.
  - Enable Reduced Motion; completion remains obvious without movement.
- **Done when**: task completion is crisp, reversible, and entirely retargetable.
