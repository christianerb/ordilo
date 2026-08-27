# 001 — Bound every web transition

- **Status**: IMPLEMENTED — MANUAL FEEL CHECK PENDING
- **Commit**: d230bcb
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: 14 files, about 40 class-token edits

## Problem

The web app has 21 `transition-all` occurrences across 14 files. Central controls therefore opt every changing CSS property into animation, including layout and paint-heavy properties:

```tsx
// src/components/ui/button.tsx:8 — current
"... whitespace-nowrap transition-all press-scale outline-none ..."

// src/components/ui/tabs.tsx:67 — current
"... text-foreground/60 transition-all ..."

// src/app/(app)/suche/filter-chips.tsx:95 — current
"... text-xs font-medium transition-all focus-ring"
```

Buttons, tabs, filters, person chips, event chips, search actions and calendar rows are high-frequency UI. `transition-all` can animate unintended width, spacing, border, shadow and transform changes and is prohibited by the motion audit.

## Target

No `transition-all` remains under `src/`. Each component declares only properties it intentionally changes:

```tsx
// target examples
"transition-[background-color,border-color,color,box-shadow] duration-150"
"transition-[background-color,border-color,color,opacity,transform] duration-150"
```

Keep press feedback separate through the existing `.press-scale` utility:

```css
.press-scale {
  transition: transform 0.1s var(--ease-out-quart);
}
```

Do not add transition durations above 250ms. Do not add a new motion dependency.

## Repo conventions to follow

- Shared press feedback already lives in `src/app/globals.css:769-775`.
- Color-only controls already use `transition-colors`, for example `src/components/ordilo/task-assign-sheet.tsx:68`.
- Shadow-only focus feedback uses `transition-shadow`, for example `src/components/ordilo/ai-search-bar.tsx:441`.

## Steps

1. Run `rg -n "transition-all" src --glob '*.{ts,tsx,css}'` and use its complete result as the edit checklist.
2. In `src/components/ui/button.tsx`, replace `transition-all` with `transition-[background-color,border-color,color,box-shadow] duration-150`. Do not include `transform`; `.press-scale` owns it.
3. In `src/components/ui/tabs.tsx`, transition only `background-color,border-color,color,box-shadow` for 150ms.
4. For selected chips in `collection-form.tsx`, `person-picker.tsx`, `member-form.tsx`, `event-sheet.tsx`, `filter-chips.tsx`, and `edit-member-client.tsx`, list only the state properties actually changed by adjacent conditional classes.
5. In `ai-search-bar.tsx`, include `opacity` only where disabled/loading state changes it; preserve existing 44px targets.
6. In calendar and timeline rows, include `transform` only where the row intentionally translates on active/hover; include `box-shadow`, `border-color`, and `background-color` explicitly.
7. Re-run the search and require zero `transition-all` matches.

## Boundaries

- Do NOT change component markup, state logic, colors, radii or spacing.
- Do NOT add or remove visual states.
- Do NOT alter `.press-scale` in this plan.
- Do NOT touch native code under `apps/mobile`.
- If any occurrence changes properties not visible in its local conditional classes, STOP and report that file instead of guessing.

## Verification

- **Mechanical**: `rg -n "transition-all" src --glob '*.{ts,tsx,css}'` returns no matches; then run `npm run lint && npm run typecheck && npm run test && npm run build`.
- **Feel check**:
  - Rapidly press buttons, tabs, filter chips and person chips; only intended color/shadow/press feedback should move.
  - In DevTools, inspect each edited control and confirm no transition resolves to `all`.
  - Use the Performance panel on a calendar row hover and confirm no layout event is caused by the transition.
  - Enable Reduced Motion and confirm the controls remain legible; detailed Reduced Motion behavior belongs to plan 003.
- **Done when**: all 21 unbounded transitions are replaced, CI checks pass, and no control loses a state cue.
