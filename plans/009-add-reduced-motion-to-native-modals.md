# 009 — Add Reduced Motion to native modals

- **Status**: IMPLEMENTED — DEVICE CHECK PENDING
- **Commit**: d230bcb
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 3 source modules and focused tests, about 70 lines

## Problem

Several live native forms and previews force positional slide transitions:

```tsx
// apps/mobile/src/components/contacts.tsx:328 — current
<Modal animationType="slide" ...>

// apps/mobile/src/components/note-form-sheet.tsx:199,403 — current
<Modal animationType="slide" ...>

// apps/mobile/app/note/[id].tsx:417,501,540 — current
<Modal animationType="slide" ...>
```

The shared `OrdiloFormSheet` already branches to fade under Reduce Motion, but these parallel implementations do not.

## Target

Every live native modal reads Reanimated’s system preference:

```tsx
const reduceMotion = useReducedMotion();
<Modal animationType={reduceMotion ? "fade" : "slide"} ... />
```

For full-screen original-image preview, prefer the gesture-capable preview pattern in `apps/mobile/app/document/[id].tsx:839-998`: `animationType="none"`, Reanimated transform/opacity, velocity-aware dismissal, and opacity-only Reduced Motion. Forms may keep native slide/fade.

## Repo conventions to follow

- `apps/mobile/src/components/sheet.tsx:121-125` is the form-modal exemplar.
- `apps/mobile/app/document/[id].tsx:839-998` is the preview/gesture exemplar.
- Use `useReducedMotion` from `react-native-reanimated`; do not manually query platform accessibility APIs.

## Steps

1. Add `useReducedMotion` to `ContactFormSheet` and both note-form-sheet modal components.
2. Branch each form modal’s `animationType` between `"fade"` and `"slide"`.
3. Add the same branch to password and metadata editors in `app/note/[id].tsx`.
4. Replace note original-image preview’s native slide with the shared behavior or extract a reusable native `SwipeImagePreview` from the document implementation.
5. Preserve animation ownership: never combine native slide with an inner slide spring.
6. Ensure gesture dismiss callbacks fire only after exit animation completion and exactly once.
7. Add tests that mock `useReducedMotion()` true/false and assert animation type/preview behavior.

## Boundaries

- Do NOT change form fields, persistence logic, keyboard handling or sheet dimensions.
- Do NOT change `OrdiloSheet`/Gorhom behavior in this plan.
- Do NOT copy-paste a second 150-line preview implementation; extract shared behavior if both routes need it.
- Do NOT animate layout properties.

## Verification

- **Mechanical**: focused native tests, `npm run lint:mobile`, `npm run typecheck:mobile`, `npm run test --workspace @ordilo/mobile -- --runInBand`.
- **Feel check**:
  - On a physical iPhone, open/close contact and note forms normally.
  - Enable iOS Settings → Accessibility → Motion → Reduce Motion; forms should fade without travel.
  - Flick the note image preview, interrupt it mid-settle, reverse it, and confirm velocity handoff matches document preview.
  - Test on the slowest supported Android device.
- **Done when**: no live native modal forces positional movement for Reduce Motion users, and previews have one coherent animation owner.
