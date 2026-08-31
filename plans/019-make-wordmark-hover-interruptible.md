# 019 — Make wordmark hover interruptible

- **Status**: DONE
- **Commit**: 40de274
- **Severity**: LOW
- **Category**: Interruptibility and cohesion
- **Estimated scope**: 1 CSS file and CSS contract tests, about 45 lines

## Problem

The landing header uses the shared wordmark:

```tsx
// src/app/landing-page.tsx:101-104 — current
<OrdiloWordmark
  mascotSize={32}
  labelClassName="... text-[var(--warm-white)]"
/>
```

Its hover response starts independent keyframes for the halo, elephant, label,
and sparkles:

```css
/* src/app/globals.css:1092-1114 — current */
.ordilo-wordmark:hover .ordilo-wordmark__mark {
  animation: ordilo-wordmark-greet 0.58s var(--ease-out-expo);
}
.ordilo-wordmark:hover .ordilo-wordmark__label {
  animation: ordilo-wordmark-name-delight 0.48s var(--ease-out-quart);
}
.ordilo-wordmark:hover .ordilo-wordmark__sparkle {
  animation: ordilo-wordmark-sparkle-in 0.46s var(--ease-out-expo) both;
}
```

Rapid pointer entry and exit restart keyframes instead of retargeting from the
current visual state. The header then competes with the product demo.

## Target

After plan 018's Reduced Motion gating, replace reversible mark and label hover
keyframes with exact transitions:

```css
.ordilo-wordmark::before,
.ordilo-wordmark__mark,
.ordilo-wordmark__label {
  transition:
    transform 180ms var(--ease-in-out),
    background-color 180ms ease;
}

@media (hover: hover) and (pointer: fine)
  and (prefers-reduced-motion: no-preference) {
  .ordilo-wordmark:hover::before {
    transform: translateY(-50%) scale(1.08);
  }
  .ordilo-wordmark:hover .ordilo-wordmark__mark {
    transform: rotate(-4deg) translateY(-1px);
  }
  .ordilo-wordmark:hover .ordilo-wordmark__label {
    transform: translateX(1px);
  }
}
```

Use transitions because hover is reversible and may be interrupted. Delete
hover-triggered sparkle animation entirely. Keep the existing one-time mount
sparkles unchanged.

## Repo conventions to follow

- Reuse `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)` from
  `src/app/globals.css:520`.
- The existing mark and halo already declare transform transitions; consolidate
  instead of stacking another declaration.
- Plan 018 establishes the required `no-preference` pointer media query.

## Steps

1. Execute plan 018 first.
2. Consolidate halo, mark, and label hover transitions to the exact 180ms
   values above, preserving non-hover mount animations.
3. Replace hover keyframe declarations with the exact transform end states
   above.
4. Delete all `.ordilo-wordmark:hover .ordilo-wordmark__sparkle*` rules.
5. Keep sparkle mount delays at 100ms, 170ms, and 230ms unchanged.
6. Extend the CSS contract test to reject hover `animation:` declarations for
   mark, label, and sparkles, and to require the `--ease-in-out` transform
   transition.

## Boundaries

- Do NOT remove the wordmark's initial brand introduction.
- Do NOT alter `OrdiloWordmark` markup or `OrdiloMark`.
- Do NOT add spring or JavaScript hover handling.
- Do NOT increase scale beyond 1.08 or rotation beyond 4 degrees.
- Do NOT restore hover movement under Reduced Motion.
- If the current CSS no longer matches the excerpts, STOP and report drift.

## Verification

- **Mechanical**:
  `npm run lint && npm run typecheck && npm run test -- src/app/__tests__/reduced-motion-contract.test.ts && npm run build`
- **Feel check**:
  - In DevTools Animations at 20% speed, move the pointer rapidly in and out of
    the wordmark. It must reverse smoothly from its current position with no
    restart snap.
  - Confirm the response remains secondary to the product-preview sequence.
  - Enable Reduced Motion and confirm only color changes.
- **Done when**: wordmark hover is fully reversible, restrained, and free of
  hover-triggered keyframes.
