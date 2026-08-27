# 006 — Move sidebar motion to the compositor

- **Status**: IMPLEMENTED — MANUAL FEEL CHECK PENDING
- **Commit**: d230bcb
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: 3 files and shell tests, about 120 lines

## Problem

One persistent-shell toggle concurrently animates layout across multiple trees:

```tsx
// src/components/ordilo/app-shell-sidebar.tsx:280,325,362 — current
"... transition-[width] duration-200 ..."
"... transition-[max-height,opacity,padding-bottom] duration-200 ease-out"
"... transition-[max-width,opacity,margin-left] duration-200 ease-out"

// src/components/ordilo/app-shell.tsx:202 — current
showNav && "transition-[padding] duration-200"

// src/components/ordilo/app-shell-navigation.tsx:407-409 — current
"... transition-[left] duration-200 ..."
left: collapsed ? 92 : 196
```

Width, padding, left, max-size and margin animations repeatedly run layout on the persistent desktop shell and content.

## Target

Keep a stable 224px sidebar and stable content geometry. Collapse visually through compositor properties:

```css
transition: transform 220ms cubic-bezier(0.77, 0, 0.175, 1),
            opacity 150ms cubic-bezier(0.23, 1, 0.32, 1);
```

Use a clipped fixed rail/container and translate inner content. Avoid animating `width`, `padding`, `left`, `max-width`, `max-height`, or margins. Reduced Motion switches geometry immediately and keeps only opacity/color feedback.

## Repo conventions to follow

- Desktop breakpoint and collapsed widths are already 224px and 76px.
- Existing collapsed semantics, localStorage state and tests in `src/components/ordilo/__tests__/app-shell.test.tsx` must remain.
- Use `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)` and `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`; add these canonical tokens to `src/app/globals.css` in this plan if they are not present yet.

## Steps

1. Preserve an outer sidebar footprint of 224px and add an inner rail/content layer that can be translated or clipped to a 76px visible rail.
2. Replace label max-width/margin animations with opacity plus `translateX`; keep labels mounted so interruption retargets.
3. Replace greeting max-height/padding animation with an absolutely or grid-positioned opacity/translate layer that does not alter surrounding layout during motion.
4. Replace app content `padding-left` animation with stable desktop padding and a transform-based inner content adjustment, or switch padding instantly while masking with a translated visual layer.
5. Replace bottom-dock `left` animation with a stable anchor plus `translateX`.
6. Use 220ms strong ease-in-out for on-screen movement and 150ms strong ease-out for opacity.
7. Under Reduced Motion, remove translation and switch collapsed geometry immediately.
8. Update shell tests to assert expanded/collapsed accessibility and stable outer geometry rather than old utility classes.

## Boundaries

- Do NOT change the 76px/224px visual widths, navigation content, breakpoints, z-index, scroll behavior or collapse persistence.
- Do NOT animate `clip-path` on the full app shell.
- Do NOT change mobile navigation.
- If stable outer geometry cannot preserve the current content width without a structural wrapper, document the minimal wrapper and keep it limited to these three files.

## Verification

- **Mechanical**: search edited files for `transition-[width]`, `transition-[padding]`, `transition-[left]`, `max-width`, and animated margin classes; run app-shell tests and the full local check suite.
- **Feel check**:
  - Build production mode and toggle the sidebar repeatedly on the slowest supported laptop.
  - Interrupt expansion halfway with another click; motion must retarget without jumping.
  - Record DevTools Performance and confirm no per-frame Layout events across the content tree.
  - Verify focus rings and tooltips in collapsed mode.
  - Enable Reduced Motion; geometry should switch immediately without travel.
- **Done when**: the sidebar remains spatially clear while its animation is compositor-led and interruptible.
