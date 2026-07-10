---
target: home
total_score: 29
p0_count: 0
p1_count: 0
p2_count: 3
p3_count: 2
timestamp: 2026-07-07T09-41-34Z
slug: src-app-app-home
---
Method: dual-agent (A: 0a4ecf70 · B: 80b91f8e)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Task toggle optimistic but router.refresh() can briefly flash the card out and back in |
| 2 | Match System / Real World | 4 | "Heute wichtig", "Überfällig", "Weitere Fristen" are natural German household vocabulary |
| 3 | User Control and Freedom | 3 | No dismiss on home task cards — unwanted AI tasks can't be cleared from home |
| 4 | Consistency and Standards | 3 | RecentDocCard reimplements card markup instead of reusing DocumentCard |
| 5 | Error Prevention | 3 | Deduplication fix prevents the cognitive error of seeing the same task twice |
| 6 | Recognition Rather Than Recall | 4 | Section icons + titles + consistent card anatomy make scanning easy |
| 7 | Flexibility and Efficiency | 2 | No keyboard shortcuts, no way to jump to sections, avatars non-interactive |
| 8 | Aesthetic and Minimalist Design | 3 | Up to 5 stacked sections is a long scroll on mobile |
| 9 | Error Recovery | 2 | Optimistic revert is silent — no toast when DB save fails |
| 10 | Help and Documentation | 2 | First-visit welcome teaches one thing; no progressive hint about review or tasks |
| **Total** | | **29/40** | **Good — address weak areas, solid foundation** |

## Anti-Patterns Verdict

**LLM assessment:** This does not look AI-generated. No gradient text, no side-stripe borders, no glassmorphism, no hero-metric template, no uppercase tracked eyebrows, no numbered section markers, no border+wide-shadow pairing, no over-rounded radii. The one faint tell is the Sparkles icon on the AISearchBar, but it's small and harbor-blue. Copy is plain German, free of breathless marketing tone. A designer would not immediately suspect AI authorship.

**Deterministic scan:** The detector returned 0 findings across all 8 target files (7 TSX + 1 CSS). Clean scan, no false positives.

## Overall Impression

The page improved from 26 to 29 — the greeting warmth, first-visit welcome, deduplication, and overdue section are real gains. The remaining drag is structural rather than aesthetic: two task-list sections with identical card anatomy, a divergent RecentDocCard, no feedback on failed saves, and a one-shot teaching moment that doesn't carry into the second visit. The path to 32+ is consolidation (merge task sections) and feedback (toast on revert, inline search answers).

## What's Working

1. **Greeting + avatars block** — Time-aware German greeting with family name and overlapping avatars is the warmest moment on the page, directly enacting the "family journal" north star.
2. **First-visit welcome consolidation** — Replacing four simultaneous empty states with one centered CTA is the highest-impact fix; converts the coldest moment into an inviting on-ramp.
3. **Deduplication between Heute wichtig and Weitere Fristen** — The 7-day horizon split with renamed header is logically clean; each task appears in exactly one section.

## Priority Issues

### [P2] RecentDocCard diverges from DocumentCard
**Why it matters:** RecentDocCard reimplements getFileIcon, the icon tile, and the card shell inline instead of reusing DocumentCard. Users see two "document row" patterns on the same screen with different hover behavior and no status badge on the recent variant.
**Fix:** Render DocumentCard inside the Link (it already supports onClick-less display mode), or extract a shared DocumentRow primitive.
**Suggested command:** $impeccable polish

### [P2] Optimistic toggle + router.refresh() causes flash + silent revert
**Why it matters:** A task toggled done in "Heute wichtig" disappears from the section on refresh — visually abrupt. On DB error, the revert is silent with no toast, which users may misread as a bug.
**Fix:** Keep the optimistic card in place with a brief "Gespeichert" microstate, and show a toast ("Konnte nicht speichern — bitte erneut versuchen") on revert.
**Suggested command:** $impeccable harden

### [P2] Überfällig section lacks reassurance framing
**Why it matters:** Surfacing overdue tasks is correct, but the bare "Überfällig" + AlertCircle with no supporting copy lands as anxiety, conflicting with the "calm, loving" brand.
**Fix:** Add a one-line muted subtitle ("Ordilo merkt sich offene Fristen — hier kannst du sie jetzt erledigen") or soften the icon to CalendarClock in apricot.
**Suggested command:** $impeccable clarify

### [P3] No dismiss on home task cards
**Why it matters:** onDismiss is supported by TaskCard but never wired in HomeClient. An AI-suggested low-priority task can't be cleared from home without navigating to /aufgaben.
**Fix:** Wire onDismiss to a dismiss mutation, or document that dismiss is intentionally /aufgaben-only.
**Suggested command:** $impeccable polish

### [P3] Avatars are non-interactive and overflow silently
**Why it matters:** members.slice(0, 5) shows up to 5 avatars with no "+N" overflow indicator. For larger families, members are hidden with no affordance. Avatars have no tap target.
**Fix:** Show "+N" pill when members.length > 5, and make the cluster a link to /familie.
**Suggested command:** $impeccable polish

## Persona Red Flags

**Casey (distracted mobile user):**
- Five stacked sections require scrolling past ~3 screens to reach "Zuletzt gescannt"; the most recently scanned document is at the bottom
- Toggling a task done makes it vanish mid-tap with no confirmation — reads as "did I just delete it?"

**Jordan (first-timer):**
- First-visit welcome is good, but the second visit (1 doc, 1 task) jumps straight to five-section mode with no guidance on what "Neue Dokumente zur Bestätigung" means
- AI search bar's dual search/chat role is communicated only by placeholder text

**Sam (accessibility user):**
- Avatars have aria-label but no tabIndex or role — sighted keyboard users cannot focus them
- Task checkbox has proper role/aria-checked but the surrounding card is not a role="group"/labelledby region

## Minor Observations

- getGreeting() runs client-side, risking a hydration mismatch — consider computing server-side in page.tsx
- RecentDocCard shows absolute timestamp while DocumentCard shows relative — inconsistent time formatting
- HomeSection heading (text-lg font-semibold) is visually identical to the h1 greeting — weakens hierarchy
- "Gute Nacht" greeting between 23:00-04:00 is theatrical for a document app
- Empty states for partially-empty pages still show multiple identical "Dokument scannen" CTAs

## Questions to Consider

1. What if "Heute wichtig" and "Weitere Fristen" were a single timeline with a soft "Diese Woche" / "Später" divider?
2. If a family has many documents but few tasks, the page feels empty. What would a documents-first home look like?
3. Could the AI search bar answer inline for high-confidence queries, keeping users on the calm home surface?

## Regression Notes

- Überfällig section adds a 4th task-list-shaped section and pushes page length up; AlertCircle above the greeting-order is a subtle emotional regression
- First-visit welcome only fires on the all-empty boundary; partially-empty pages still show multiple empty states
- getGreeting() client-side computation introduces a hydration mismatch risk not present before
- "Weitere Fristen" heading pair no longer reads as naturally parallel as the prior "Fristen"
