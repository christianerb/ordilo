# 002 — Fix the navigation dot entry

- **Status**: IMPLEMENTED — MANUAL FEEL CHECK PENDING
- **Commit**: d230bcb
- **Severity**: HIGH
- **Category**: Physicality & frequency
- **Estimated scope**: 2 files, under 20 lines

## Problem

The active navigation indicator appears from nothing on every route change:

```css
/* src/app/globals.css:289-295 — current */
@keyframes nav-dot-in {
  from {
    opacity: 0;
    transform: scale(0);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

It is mounted from high-frequency navigation surfaces:

```tsx
// src/components/ordilo/app-shell-navigation.tsx:144 — current
<span className="size-1.5 rounded-full bg-[var(--apricot)] animate-nav-dot" />
```

`scale(0)` is physically incorrect, and replaying a pop on routine navigation adds noise.

## Target

Delete the animation from routine active navigation. The active dot should render immediately:

```tsx
<span className="size-1.5 rounded-full bg-[var(--apricot)]" aria-hidden="true" />
```

Remove `@keyframes nav-dot-in`, `.animate-nav-dot`, and its Reduced Motion selector because no call site should remain.

## Repo conventions to follow

- DESIGN.md’s Apricot Scarcity Rule already makes the dot visible without motion.
- The current branch removed repeated native tab-icon scaling; web navigation should follow the same frequency decision.

## Steps

1. Remove `animate-nav-dot` from `src/components/ordilo/app-shell-navigation.tsx:144`.
2. Remove it from desktop collection/navigation dots in `src/components/ordilo/app-shell-sidebar.tsx:372` and every remaining match.
3. Delete `@keyframes nav-dot-in` and `.animate-nav-dot` from `src/app/globals.css`.
4. Delete `.animate-nav-dot` from the Reduced Motion selector list.
5. Update tests that assert the class name so they assert only the apricot dot and active semantics.

## Boundaries

- Do NOT change active-route logic, dot size, dot color or navigation markup.
- Do NOT replace the animation with another animation.
- Do NOT change mobile navigation.

## Verification

- **Mechanical**: `rg -n "animate-nav-dot|nav-dot-in" src` returns no matches; run `npm run lint && npm run typecheck && npm run test`.
- **Feel check**:
  - Switch quickly through all primary routes; the active location must update immediately without a pop.
  - Check expanded and collapsed desktop sidebar plus mobile navigation.
  - At 10% DevTools playback, verify no navigation-dot animation is registered.
- **Done when**: active dots are instant, stable, and still uniquely apricot.
