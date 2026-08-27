# 003 — Preserve feedback under Reduced Motion

- **Status**: IMPLEMENTED — MANUAL FEEL CHECK PENDING
- **Commit**: d230bcb
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1 CSS file plus focused tests

## Problem

The global Reduced Motion override removes every transition:

```css
/* src/app/globals.css:1119-1127 — current */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0ms !important;
  }
}
```

This correctly suppresses movement, but it also removes useful color and opacity feedback. Reduced Motion should be gentler, not visually inert.

## Target

Keep global scroll protection, but stop globally zeroing transitions:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
  }
}
```

Movement utilities must be neutralized explicitly:

```css
.card-lift:hover,
.card-lift:active,
.press-scale:active {
  transform: none;
}
```

State-preserving entry feedback may use an opacity-only fade:

```css
@keyframes reduced-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.animate-message-in,
.animate-status-settle,
.animate-upload-phase,
.animate-status-line {
  animation: reduced-fade 200ms ease;
}
```

Decorative loops, parallax, shakes, scale pulses and positional entrances remain `animation: none`.

## Repo conventions to follow

- The Reduced Motion block already enumerates all named motion utilities.
- `src/app/globals.css:1176-1188` already neutralizes `.card-lift` and `.press-scale` transforms.
- Opacity/color feedback is non-positional and allowed by the audit standard.

## Steps

1. Add `@keyframes reduced-fade` near the other keyframes in `src/app/globals.css`.
2. Remove `animation-duration`, `animation-iteration-count`, and `transition-duration` from the universal Reduced Motion selector; retain `scroll-behavior: auto`.
3. Split the current animation selector list into:
   - decorative/positional classes that become `animation: none`;
   - state-continuity classes that become `reduced-fade 200ms ease`.
4. Keep `.card-lift` and `.press-scale` transforms disabled under Reduced Motion, but allow their color, border and opacity transitions to remain.
5. Ensure progress, status and selected controls still communicate changes without translation or scale.
6. Add a focused CSS contract test similar to `src/app/__tests__/animation-clip-path.test.ts` that checks the universal rule no longer sets all transitions to 0ms and that `reduced-fade` is opacity-only.

## Boundaries

- Do NOT re-enable any transform, clip-path, shake, bounce or infinite loop under Reduced Motion.
- Do NOT change normal-motion timings.
- Do NOT use JavaScript media queries for behavior CSS can express.

## Verification

- **Mechanical**: run the focused CSS test, then `npm run lint && npm run typecheck && npm run test && npm run build`.
- **Feel check**:
  - Toggle `prefers-reduced-motion` in DevTools.
  - Confirm buttons still change color and selected state visibly.
  - Confirm route movement, card lift, mascot loops, shakes and scale pulses stop.
  - Confirm status/message changes use only a 200ms opacity fade.
- **Done when**: Reduced Motion removes movement without removing state feedback.
