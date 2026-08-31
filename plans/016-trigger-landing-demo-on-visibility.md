# 016 — Trigger the landing demo on visibility

- **Status**: TODO
- **Commit**: 40de274
- **Severity**: HIGH
- **Category**: Purpose, frequency, and timing
- **Estimated scope**: 3 files, about 170 lines including tests

## Problem

The mobile product demonstration starts its CSS keyframes as soon as the page
mounts:

```tsx
// src/app/landing-page.tsx:398 — current
<div className="landing-phone-enter relative z-10 w-full max-w-[360px] ...">
```

```css
/* src/app/globals.css:1058-1083 — current */
.landing-phone-enter {
  animation: landing-phone-enter 680ms var(--ease-out) backwards;
}

.landing-app-reveal {
  animation: landing-app-reveal 420ms var(--ease-out) backwards;
}

.landing-app-reveal--notice { animation-delay: 260ms; }
.landing-app-reveal--document { animation-delay: 340ms; }
.landing-app-reveal--question { animation-delay: 460ms; }
.landing-app-reveal--answer { animation-delay: 570ms; }
.landing-app-reveal--nav { animation-delay: 650ms; }
```

On a 390×844 viewport, the phone starts below the headline, copy, CTA, and
trust row. The explanatory sequence therefore finishes before most mobile
visitors see it. The phone also moves for 680ms while its first evidence starts
after only 260ms, contradicting the intended device-then-content sequence.

## Target

Extract `MobileAppPreview` into a small client component and use one
`IntersectionObserver` to start a WAAPI sequence when at least 20% of the
phone is visible.

- Observe with `{ threshold: 0.2 }`.
- Play once per component mount, then disconnect the observer.
- Phone entrance: 680ms, `cubic-bezier(0.23, 1, 0.32, 1)`, from
  `opacity: 0; transform: translateY(8%) scale(0.97)` to the natural state.
- Evidence entrance: 420ms each, same curve, from
  `opacity: 0; transform: translateY(18%) scale(0.97)` to the natural state.
- Start evidence only after the phone settles. Delays relative to the trigger:
  notice 680ms, document 760ms, question 840ms, answer 920ms, navigation
  1000ms. The stagger is exactly 80ms.
- Every WAAPI animation uses `fill: "backwards"` so delayed elements are
  hidden only after the observer fires. Before JavaScript runs, all content
  remains visible and usable.
- Reduced Motion: phone and evidence use opacity only for 200ms with zero
  delay.

## Repo conventions to follow

- Strong easing already lives in `src/app/globals.css:516-520`:
  `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`.
- The landing page itself stays a server component. Only the product-preview
  island becomes a client component.
- Existing animation values come from `landing-phone-enter` and
  `landing-app-reveal`; do not introduce a second visual direction.

## Steps

1. Create `src/components/ordilo/landing-mobile-preview.tsx` with
   `"use client"`.
2. Move the complete current `MobileAppPreview` markup and required Lucide and
   `OrdiloMark` imports from `src/app/landing-page.tsx` into that file without
   changing copy or visual classes.
3. Add a root `ref` plus refs or `data-motion-part` selectors for `notice`,
   `document`, `question`, `answer`, and `nav`.
4. In `useEffect`, create `IntersectionObserver(callback, { threshold: 0.2 })`.
   On the first intersecting entry, branch on
   `window.matchMedia("(prefers-reduced-motion: reduce)").matches`, create all
   WAAPI animations with the exact values above, disconnect, and mark the
   sequence played so React Strict Mode cannot replay it.
5. Cleanup must disconnect the observer and call `cancel()` on every created
   animation.
6. Remove `landing-phone-enter`, `landing-app-reveal`, and modifier classes from
   the markup. Remove their CSS keyframes and selector rules from
   `src/app/globals.css`.
7. Import the new component into `src/app/landing-page.tsx`.
8. Extend `src/app/__tests__/landing-page.test.tsx` with a mocked
   `IntersectionObserver`, `matchMedia`, and `Element.prototype.animate`.
   Assert no animation before intersection, one sequence after intersection,
   the exact delays, observer disconnection, cleanup cancellation, and the
   opacity-only Reduced Motion branch.

## Boundaries

- Do NOT add a motion library.
- Do NOT convert the full landing page into a client component.
- Do NOT hide the product preview before JavaScript or intersection support.
- Do NOT animate layout, scroll position, `width`, `height`, margins, or
  padding.
- Do NOT replay the sequence when scrolling away and back.
- Do NOT delay links or block interaction while the sequence plays.
- If the current markup no longer matches the excerpts, STOP and report drift.

## Verification

- **Mechanical**:
  `npm run lint && npm run typecheck && npm run test -- src/app/__tests__/landing-page.test.tsx src/app/__tests__/reduced-motion-contract.test.ts && npm run build`
- **Feel check**:
  - At 390×844, reload at the top. Confirm no unseen animation consumes the
    sequence.
  - Scroll until the phone is roughly one-fifth visible. The phone should
    settle first, followed by the five evidence items at even 80ms intervals.
  - In DevTools Animations, play at 10% speed and confirm evidence does not
    begin before the phone reaches its resting position.
  - Scroll away and back. Nothing should replay.
  - Enable Reduced Motion. Confirm a single 200ms opacity fade with no
    translation, scaling, or stagger.
- **Done when**: the mobile explanation plays exactly once when it can be seen,
  desktop still receives the sequence immediately because the phone begins in
  view, and no content depends on JavaScript to remain visible.
