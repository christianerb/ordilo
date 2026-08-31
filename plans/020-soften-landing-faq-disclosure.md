# 020 — Soften the landing FAQ disclosure

- **Status**: DONE
- **Commit**: 40de274
- **Severity**: LOW
- **Category**: Missed opportunity — state indication
- **Estimated scope**: 2 files and one focused test, about 40 lines

## Problem

The FAQ indicator rotates, but its answer appears without a matching content
transition:

```tsx
// src/app/landing-page.tsx:517-528 — current
<details className="group">
  <summary ...>
    {question}
    <ChevronDown
      className="... transition-transform group-open:rotate-180"
    />
  </summary>
  <p className="...">{answer}</p>
</details>
```

This splits one state change into a moving indicator and teleporting content.

## Target

Keep native `<details>` semantics and animate only the opening content:

```css
@keyframes landing-faq-answer-in {
  from {
    opacity: 0;
    transform: translateY(-8%);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.landing-faq-answer {
  animation: landing-faq-answer-in 200ms var(--ease-out);
}

.landing-faq-chevron {
  transition: transform 180ms var(--ease-in-out);
}

@media (prefers-reduced-motion: reduce) {
  .landing-faq-answer {
    animation: reduced-fade 200ms ease;
  }
}
```

The animation occurs only when the answer becomes rendered by the native open
state. Closing remains immediate because native `<details>` removes the content
before a CSS exit can complete. Do not fake an exit or delay disclosure state.

## Repo conventions to follow

- Reuse `--ease-out`, `--ease-in-out`, and the opacity-only `reduced-fade`
  already defined in `src/app/globals.css`.
- Native `<details>` is deliberately used for semantics and zero-JavaScript
  disclosure; retain it.
- The 180–200ms timings are within the small-control budget.

## Steps

1. Add `@keyframes landing-faq-answer-in` beside the other landing keyframes
   in `src/app/globals.css`.
2. Add `landing-faq-answer` to the answer paragraph in
   `src/app/landing-page.tsx`.
3. Replace `transition-transform` with `landing-faq-chevron` on the chevron.
4. Add the exact normal and Reduced Motion CSS shown above.
5. Extend `src/app/__tests__/landing-page.test.tsx` to assert the two classes
   are present.
6. Extend `src/app/__tests__/reduced-motion-contract.test.ts` to verify the FAQ
   reduced animation references `reduced-fade` and contains no transform.

## Boundaries

- Do NOT replace native `<details>` with a custom disclosure component.
- Do NOT animate `height`, `max-height`, grid rows, padding, or margin.
- Do NOT delay opening or closing.
- Do NOT add JavaScript or a motion dependency.
- Do NOT animate every FAQ on initial page load.
- If the current markup no longer matches the excerpts, STOP and report drift.

## Verification

- **Mechanical**:
  `npm run lint && npm run typecheck && npm run test -- src/app/__tests__/landing-page.test.tsx src/app/__tests__/reduced-motion-contract.test.ts && npm run build`
- **Feel check**:
  - Open each FAQ repeatedly. The text should settle from just above while the
    chevron rotates, with no visible double exposure.
  - In DevTools Animations at 20% speed, confirm only opacity and transform are
    animated.
  - Enable Reduced Motion. The answer should use only a 200ms fade and the
    chevron should not rotate.
- **Done when**: opening an answer reads as one coherent state change while
  native semantics and immediate interaction remain intact.
