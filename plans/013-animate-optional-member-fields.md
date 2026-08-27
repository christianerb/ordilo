# 013 — Animate optional member fields

- **Status**: IMPLEMENTED — MANUAL FEEL CHECK PENDING
- **Commit**: d230bcb
- **Severity**: LOW
- **Category**: Missed opportunity — spatial consistency
- **Estimated scope**: 2 files and member-form tests, about 60 lines

## Problem

The optional section is conditionally inserted:

```tsx
// src/components/ordilo/member-form.tsx:180-194 — current
<button onClick={() => setShowOptional((s) => !s)}>...</button>
{showOptional && (
  <div className="space-y-4 rounded-ordilo-md bg-secondary/50 p-3">
```

Opening/removing a sizeable panel causes a hard layout jump. This is an occasional, deliberate disclosure where spatial continuity helps.

## Target

Use the existing `OrdiloDisclosure` pattern, but improve it to animate measured visual content without an abrupt padding jump:

- duration: 200ms;
- curve: `cubic-bezier(0.77, 0, 0.175, 1)` for expansion/collapse;
- content opacity: 150ms strong ease-out;
- chevron rotation: 200ms strong ease-in-out;
- Reduced Motion: instant geometry plus 150ms opacity/color only.

If the existing grid-row technique must remain for dynamic-height content, keep it scoped to the disclosure and remove padding changes from the transitioning outer grid. Put padding inside the clipped child.

## Repo conventions to follow

- `src/components/ordilo/ordilo-disclosure.tsx:50-67` already supplies accessible button/content IDs and chevron state.
- Keep the optional panel mounted only if required by form-state preservation; otherwise use the existing disclosure’s clipping pattern.

## Steps

1. Replace the bespoke optional-fields toggle with `OrdiloDisclosure`, preserving the exact label and initial-open rule.
2. Extend `OrdiloDisclosure` with an optional `contentClassName` if needed rather than hardcoding member-form styles.
3. Move bottom padding into the inner overflow-hidden content so it does not jump separately from the expansion.
4. Use 200ms strong ease-in-out for the grid/movement and 150ms opacity transition for content.
5. Add `aria-expanded`, stable IDs and chevron rotation through the shared component.
6. Under Reduced Motion, disable grid/rotation movement and retain opacity/color feedback.
7. Test repeated open/close, initial-open edit state and preservation of entered optional values.

## Boundaries

- Do NOT animate to a hardcoded height.
- Do NOT remove fields from form submission or reset their values on close.
- Do NOT change validation, labels, photo behavior or relationship fields.
- Do NOT add a dependency.

## Verification

- **Mechanical**: member-form and disclosure tests, then full web checks.
- **Feel check**:
  - Open and close with empty, photo and large-font content.
  - Reverse halfway through; the disclosure must retarget without snapping.
  - Test 200% text zoom and narrow mobile Safari.
  - Enable Reduced Motion; geometry changes immediately and content remains understandable.
- **Done when**: optional content opens spatially without hardcoded height or layout discontinuity.
