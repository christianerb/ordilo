# 012 — Animate the first-success guide

- **Status**: IMPLEMENTED — MANUAL FEEL CHECK PENDING
- **Commit**: d230bcb
- **Severity**: LOW
- **Category**: Missed opportunity — delight
- **Estimated scope**: 2 files and focused tests, about 70 lines

## Problem

The one-time post-confirmation guide is a rare emotional moment but mounts and unmounts abruptly:

```tsx
// src/components/ordilo/first-success-guide.tsx:38-48 — current
useMountEffect(() => {
  setVisible(!wasDismissed(familyId));
});
...
if (!visible) return null;
```

It appears only when `confirmedDocumentCount === 1` in `home-client.tsx:327-329`, so it can use a small delight budget without becoming repetitive.

## Target

Use an interruptible CSS transition controlled by a phase:

```css
opacity 220ms cubic-bezier(0.23, 1, 0.32, 1),
transform 220ms cubic-bezier(0.23, 1, 0.32, 1)
```

Entry:

```css
opacity: 0;
transform: translateY(8px) scale(0.98);
```

Visible:

```css
opacity: 1;
transform: translateY(0) scale(1);
```

Exit lasts 150ms, fades to opacity 0 and translates up 4px, then persists dismissal and unmounts. Reduced Motion uses opacity only for 150ms.

## Repo conventions to follow

- Use `useMountEffect` rather than raw mount `useEffect`.
- Use existing warm surface, Sparkles icon and localStorage key unchanged.
- Use canonical strong ease-out `cubic-bezier(0.23, 1, 0.32, 1)`.

## Steps

1. Replace the boolean-only lifecycle with `mounted` and `phase: "entering" | "visible" | "leaving"`.
2. After storage confirms the guide should appear, mount in `entering`; schedule one `requestAnimationFrame` to switch to `visible` so the CSS transition has a start state.
3. On dismiss, guard against repeated clicks, switch to `leaving`, and after 150ms write dismissal storage and unmount.
4. Cancel rAF/timers on unmount.
5. Add data-state classes or a dedicated CSS utility for the three states.
6. Under Reduced Motion, remove transform and retain a 150ms opacity transition.
7. Update tests to use fake timers and verify delayed unmount, storage write, and double-click safety.

## Boundaries

- Do NOT delay rendering the rest of Home.
- Do NOT add looping sparkle, confetti, sound or haptics on web.
- Do NOT change copy, actions or storage semantics.
- Do NOT use a keyframe for dismissal.

## Verification

- **Mechanical**: run first-success/home tests and full web checks.
- **Feel check**:
  - Trigger the first confirmed-document state with fresh localStorage.
  - The guide should settle once, remain still, and leave faster than it entered.
  - Click close during entry; the transition must retarget from its current state.
  - Enable Reduced Motion; only opacity changes.
- **Done when**: the first success feels acknowledged once without delaying or distracting from Home.
