# 017 — Calm the landing mascots

- **Status**: DONE
- **Commit**: 40de274
- **Severity**: MEDIUM
- **Category**: Purpose, performance, and cohesion
- **Estimated scope**: 2 files and one focused test, about 35 lines

## Problem

Three below-the-fold mascots use the component default `animate={true}`:

```tsx
// src/app/landing-page.tsx:216-220, 256-260, 354-358 — current
<OrdiloMascot size={78} mood="helping" ... />
<OrdiloMascot size={64} mood="greeting" ... />
<OrdiloMascot size={72} mood="greeting" ... />
```

```tsx
// src/components/ordilo/mascot.tsx:65-81 — current
const bodyAnimClass = animate ? "ordilo-mascot-breathe" : undefined;
const earAnimClass = animate && (mood === "helping" || mood === "greeting")
  ? "ordilo-mascot-ear-wiggle"
  : undefined;
const trunkAnimClass =
  mood === "greeting" ? "ordilo-mascot-greet" : ...
```

They breathe, blink, or wiggle indefinitely even while offscreen. Greeting
trunks also play their rare one-shot animation before the user reaches them.
This competes with the product demo and violates Ordilo's restrained,
contextual mascot rule.

## Target

Make all three supporting landing mascots static while preserving their current
pose, happy eyes, blush, and color:

```tsx
<OrdiloMascot
  ...
  animate={false}
  className="landing-mascot-static ..."
/>
```

```css
.landing-mascot-static .ordilo-mascot-greet {
  animation: none;
}
```

The hero product preview remains the landing page's only authored motion
sequence. Wordmark behavior is handled separately by plans 018 and 019.

## Repo conventions to follow

- `OrdiloMascot` already exposes `animate?: boolean`; use it instead of adding
  another generic prop.
- `animate={false}` removes breathing, blinking, swaying, nodding, and ear
  wiggle through existing component logic.
- The page-specific class belongs near the other landing selectors in
  `src/app/globals.css`.

## Steps

1. Add `animate={false}` to the three `OrdiloMascot` calls in
   `src/app/landing-page.tsx`.
2. Add `landing-mascot-static` to each existing `className`.
3. Add the exact descendant override above beside the other landing-specific
   CSS in `src/app/globals.css`. It is required because the greeting trunk
   currently ignores the `animate` prop.
4. Extend `src/app/__tests__/landing-page.test.tsx` to assert all three landing
   mascots carry `landing-mascot-static`; add a stable test id only if querying
   the decorative SVGs otherwise becomes brittle.
5. Do not alter the shared mascot's default behavior for app screens.

## Boundaries

- Do NOT change `OrdiloMascot` behavior globally.
- Do NOT remove the mascot artwork or change moods, sizes, copy, or layout.
- Do NOT replace the loops with another loop.
- Do NOT add viewport observers; the strongest fix here is deletion.
- If the current markup no longer matches the excerpts, STOP and report drift.

## Verification

- **Mechanical**:
  `npm run lint && npm run typecheck && npm run test -- src/app/__tests__/landing-page.test.tsx && npm run build`
- **Feel check**:
  - Reload and scroll the full landing page. Only the product demonstration
    should move.
  - Leave the page open for 30 seconds at each mascot section. No breathing,
    blinking, ear wiggle, or delayed trunk movement should occur.
  - Confirm the greeting mascots still render happy eyes and raised trunks.
- **Done when**: every supporting mascot is visually expressive but fully
  static, and no offscreen infinite animation remains on the landing page.
