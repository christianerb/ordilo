# 018 — Fix landing Reduced Motion feedback

- **Status**: DONE
- **Commit**: 40de274
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 2 files and CSS contract tests, about 45 lines

## Problem

Wordmark hover animation lives in a higher-specificity pointer media block:

```css
/* src/app/globals.css:1092-1114 — current */
@media (hover: hover) and (pointer: fine) {
  .ordilo-wordmark:hover::before {
    transform: translateY(-50%) scale(1.16);
  }
  .ordilo-wordmark:hover .ordilo-wordmark__mark {
    animation: ordilo-wordmark-greet 0.58s var(--ease-out-expo);
  }
  .ordilo-wordmark:hover .ordilo-wordmark__label {
    animation: ordilo-wordmark-name-delight 0.48s var(--ease-out-quart);
  }
  .ordilo-wordmark:hover .ordilo-wordmark__sparkle {
    animation: ordilo-wordmark-sparkle-in 0.46s var(--ease-out-expo) both;
  }
}
```

The later Reduced Motion block disables base wordmark animation, but does not
prevent these hover selectors from reintroducing scaling, rotation, and
translation. It also removes the only press response from both landing CTAs:

```css
/* src/app/globals.css:1217-1219 — current */
.press-scale:active {
  transform: none;
}
```

Reduced Motion should remove movement without making primary actions inert.

## Target

Gate every wordmark hover transform/keyframe behind:

```css
@media (hover: hover) and (pointer: fine)
  and (prefers-reduced-motion: no-preference) {
  /* wordmark transform and animation selectors */
}
```

Keep non-motion hover color changes in the existing pointer media block.

Extend press feedback to include opacity:

```css
.press-scale {
  transition:
    transform 100ms var(--ease-out-quart),
    opacity 100ms var(--ease-out);
}

@media (prefers-reduced-motion: reduce) {
  .press-scale:active {
    transform: none;
    opacity: 0.82;
  }
}
```

The 100ms duration is within the 100–160ms button-feedback budget. Normal
motion retains `scale(0.97)`; Reduced Motion gets opacity only.

## Repo conventions to follow

- Use existing `--ease-out-quart` and `--ease-out` tokens from
  `src/app/globals.css:516-520`.
- The global Reduced Motion selector already permits opacity transitions.
- Follow `src/app/__tests__/reduced-motion-contract.test.ts`, which parses CSS
  contracts directly.

## Steps

1. In `src/app/globals.css`, leave the wordmark's hover
   `background-color` change inside the existing fine-pointer block.
2. Move its `transform` plus mark, label, and sparkle animation selectors into
   the exact combined media query above.
3. Change `.press-scale` to the exact two-property transition shown above.
4. Keep normal `.press-scale:active { transform: scale(0.97); }`.
5. Add `opacity: 0.82` to the Reduced Motion override while retaining
   `transform: none`.
6. Extend `src/app/__tests__/reduced-motion-contract.test.ts` to verify:
   wordmark movement requires `no-preference`; Reduced Motion press feedback
   contains opacity; no transform transition is allowed by the universal
   Reduced Motion rule.

## Boundaries

- Do NOT restore positional movement under Reduced Motion.
- Do NOT disable all hover color feedback.
- Do NOT change CTA markup, destinations, copy, or layout.
- Do NOT use `transition: all`.
- Do NOT change non-landing app behavior beyond the shared press utility's
  opacity transition.
- If the current CSS no longer matches the excerpts, STOP and report drift.

## Verification

- **Mechanical**:
  `npm run lint && npm run typecheck && npm run test -- src/app/__tests__/reduced-motion-contract.test.ts src/app/__tests__/landing-page.test.tsx && npm run build`
- **Feel check**:
  - With normal motion and a fine pointer, verify the wordmark retains its
    intended hover response.
  - Enable Reduced Motion in DevTools. Hover the wordmark: color may change,
    but nothing may rotate, translate, scale, or sparkle.
  - Press both landing CTAs. They should give a crisp 100ms opacity response
    without spatial movement.
- **Done when**: Reduced Motion removes every landing movement while retaining
  obvious primary-action feedback.
