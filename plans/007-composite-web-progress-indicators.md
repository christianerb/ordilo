# 007 — Composite web progress indicators

- **Status**: IMPLEMENTED — MANUAL FEEL CHECK PENDING
- **Commit**: d230bcb
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: 3 files and focused tests, about 60 lines

## Problem

Progress and step indicators animate width:

```tsx
// src/components/ordilo/scan-wizard/upload-progress.tsx:134-136 — current
className="h-full rounded-full transition-all duration-200"
style={{ width: `${upload.progress}%` }}

// src/app/(app)/onboarding/onboarding-flow.tsx:543-544 — current
className="... transition-[width] duration-200 ..."
style={{ width: `${percent}%` }}

// src/app/willkommen/welcome-intro.tsx:257-260 — current
className={`... transition-all duration-200 ${active ? "w-6" : "w-1.5"}`}
```

These state changes trigger layout rather than compositor-only work.

## Target

Progress fills use a full-width child with left transform origin:

```tsx
style={{ transform: `scaleX(${progress / 100})`, transformOrigin: "left" }}
className="h-full w-full transition-transform duration-200"
```

Use `cubic-bezier(0.77, 0, 0.175, 1)` for progress moving on screen. Welcome dots use a fixed 24px track and animate an inner fill with `transform: scaleX(0.25 → 1)`; no width changes.

Reduced Motion sets the final transform immediately.

## Repo conventions to follow

- Progress containers already clip overflow and preserve rounded corners.
- `motion-reduce:transition-none` is already used by onboarding.
- State and ARIA progress semantics remain on the existing outer elements.

## Steps

1. In upload progress, make the fill `w-full`, set `transformOrigin: "left"`, and derive `scaleX` from `upload.progress / 100`.
2. Replace `transition-all` with `transition-transform duration-200` and the canonical strong ease-in-out curve.
3. Apply the same pattern to onboarding’s 50/100 percent bar.
4. In welcome dots, retain the 36px button target but make every visual track 24px wide. Animate only a nested fill’s scale and color/opacity.
5. Add `motion-reduce:transition-none` to all three.
6. Update tests that assert width classes or inline width to assert transform scale instead.

## Boundaries

- Do NOT change progress values, labels, colors, rounded corners or tap targets.
- Do NOT animate scale on text or icons.
- Do NOT add JavaScript animation loops.

## Verification

- **Mechanical**: targeted tests plus `npm run lint && npm run typecheck && npm run test && npm run build`.
- **Feel check**:
  - Throttle CPU 6× and watch upload progress; it should remain smooth.
  - Click welcome dots rapidly; the indicator must retarget without changing layout.
  - In Performance, confirm progress updates do not trigger layout.
  - Enable Reduced Motion; indicators jump to the correct value while retaining color state.
- **Done when**: all three indicators move via transform, preserve semantics, and do not reflow siblings.
