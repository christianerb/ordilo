---
target: home
total_score: 28
p0_count: 0
p1_count: 2
p2_count: 4
p3_count: 5
timestamp: 2026-07-07T11-38-52Z
slug: src-app-app-home
---
Method: dual-agent (A: 394c0059 · B: d1c05ade)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Toggling a task done removes it from view on the very next render (filters require `status === "open"`) — no "saved"/checked resting state before it disappears |
| 2 | Match System / Real World | 4 | "Überfällig / Diese Woche / Später" plus "Zu bestätigen / Zuletzt gescannt" is natural, non-overlapping household vocabulary — a real gain over the prior "Heute wichtig / Fristen" overlap |
| 3 | User Control and Freedom | 2 | No undo after marking a task done; no way to dismiss a "Zu bestätigen" tile from Home without opening `/scan` |
| 4 | Consistency and Standards | 3 | `BentoDocTile` is a third document-row visual language (vertical tile + bare status dot) alongside `DocumentCard` (horizontal + labeled badge) and `ReviewCard` — not reused, not documented in DESIGN.md |
| 5 | Error Prevention | 3 | Optimistic toggle/dismiss now roll back with `toast.error(...)` on failure; failed documents are correctly excluded from Home entirely |
| 6 | Recognition Rather Than Recall | 4 | Icons + text labels throughout; avatar "+N" overflow now implemented; status dots carry both `aria-label` and `title` |
| 7 | Flexibility and Efficiency | 2 | The dashboard's one-tap "Scannen" shortcut (stat tile) disappears entirely the moment any task exists — the fastest capture path is traded for a task counter that duplicates the Aufgaben section below it |
| 8 | Aesthetic and Minimalist Design | 2 | Two concrete, code-verifiable defects sit in the hero region: a permanently empty CSS grid cell on mobile (2-child grid-cols-2 with a col-span-2 + col-span-1 child), and apricot rendering in 4–5 independent signal channels at once |
| 9 | Error Recovery | 3 | Friendly German toasts, no raw error leakage; still no confirmation microstate between a checkbox tap and the card's disappearance |
| 10 | Help and Documentation | 2 | First-visit `EmptyState` teaches one thing (scan); nothing teaches a 2nd/3rd-visit user what "Zu bestätigen" means or what a bento tile tap does; subgroup labels (Überfällig/Diese Woche/Später) aren't headings, so screen-reader users can't jump between them |
| **Total** | | **28/40** | **Good — real structural gains, but the hero region has a visible layout bug and a broken color rule** |

## Anti-Patterns Verdict

**Deterministic scan (10 target files):** 1 finding — `bounce-easing` (warning) in `globals.css:307`, the `.ordilo-mascot-bounce` keyframe used by the mascot's celebratory animation, which also plays in Home's first-visit `EmptyState` (`mascotMood="greeting"`). All other 9 files (page.tsx, home-client.tsx, home-utils.ts, ai-search-bar.tsx, task-card.tsx, document-card.tsx, empty-state.tsx, app-shell.tsx, task-utils.ts) are clean.

**Typecheck/Lint:** Both pass with 0 errors/warnings against any target file (2 pre-existing, unrelated warnings in `format.test.ts`).

## Overall Impression

This reads as **competent-but-unremarkable**, not "Wow, this is Ordilo." The bento redesign genuinely fixed real structural problems flagged in the two prior audits (task-section overlap collapsed into one clean timeline, avatar+pill duplication removed, dismiss wired, toasts added, greeting moved server-side to kill a hydration risk). But the very first thing a user's eye lands on — the 2-tile bento hero row — has a real, always-reproducible empty grid cell on mobile, and the app's core "AI-native" pitch is represented by the same generic pill search bar that appears verbatim on `/suche`, with no home-specific framing. A best-in-class first touchpoint would open with something that feels alive and specific to *this* family's data, not a stat counter and a search pill indistinguishable from a generic productivity app.

## What's Working

1. **Task timeline consolidation** — `filterUeberfaellig`/`filterHeuteWichtig`/`filterFristen` in `home-utils.ts` produce three non-overlapping subgroups under one "Aufgaben" heading, with a reassuring subtitle on Überfällig ("Ordilo merkt sich offene Fristen…"). Directly answers a question raised in the prior audit and reads as genuinely calm, thoughtful copy.
2. **Server-computed, time-aware greeting** — `page.tsx: getGreeting()` eliminates the hydration-mismatch risk flagged previously; the `<h1>` is now the greeting itself, both warmer and a better landmark than the old family-name heading.
3. **Confidence noise removed from Home** — every `TaskCard` passes `showConfidence={false}`, so the clinical confidence badge (the prior audit's biggest complaint) never appears on this surface. Process is hidden; only the result surfaces.

## Priority Issues

### [P1] Mobile bento hero row leaves a permanent empty grid cell
**Why it matters:** `home-client.tsx`'s top row is `grid grid-cols-2 gap-3 lg:grid-cols-3` with a `col-span-2` greeting tile and a `col-span-1` stat tile as its only two children. On mobile (`grid-cols-2`), the greeting tile fills row 1 entirely; CSS auto-placement puts the stat tile alone in row 2, column 1 — leaving row 2, column 2 permanently empty on every load. This is the very first frame a user sees.
**Fix:** Make the stat tile `col-span-2` on mobile (full width) with `lg:col-span-1`, add a second always-present tile so the 2×2 grid is genuinely filled, or switch to `flex` for the 2-tile case.

### [P1] Apricot Scarcity Rule is broken by the current status-dot + stat-tile mapping
**Why it matters:** DESIGN.md caps apricot at ≤1 element per view. `STATUS_DOT_COLORS.analyzed` is apricot, and "Zu bestätigen" can show up to 3 analyzed-status dots at once; the stat tile turns fully apricot-tinted whenever there are zero tasks; any high-priority task renders a solid apricot pill; the nav's active Home tab is always apricot. In the zero-task, several-analyzed-doc case, one Home view can show 4–5 independent apricot signals simultaneously — apricot has stopped being a signal and become noise.
**Fix:** Give "Zu bestätigen" a non-apricot treatment (petrol-tinted or neutral badge instead of an apricot dot), and reserve apricot for one hero signal per view.

### [P2] Marking a task done removes it from view with no recoverable affordance
**Why it matters:** The moment `handleToggleDone` flips a task to `"done"`, the filter functions (`status === "open"`) drop it from `localTasks` display on the next render — the card vanishes mid-interaction with no checked/strikethrough resting state and no undo. For a fast, distracted tap, this reads as "did I just delete something?"
**Fix:** Keep the completed card visible with a checked state for ~1.5s before filtering it out, or move it to a collapsed "Erledigt" affordance instead of instant disappearance.

### [P2] The dashboard's "Scannen" shortcut disappears once any task exists
**Why it matters:** The stat tile is a strict ternary (`hasTasks ? <task-count> : <Scan CTA>`) — the moment a family has one open task, the fastest capture path on the dashboard itself is gone, even though PRODUCT.md's core use case is "scan a letter in 30 seconds." The bottom-nav Scan tab still works, but the dashboard's fast-path is a net loss for the primary action.
**Fix:** Keep a persistent, always-visible scan affordance independent of the task-count tile rather than making them mutually exclusive.

### [P2] `BentoDocTile` is an undocumented third document-card pattern
**Why it matters:** `DocumentCard` is DESIGN.md's "Signature: Document Card" (horizontal, labeled status badge). Home's `BentoDocTile` is a second, vertical variant with a bare colored dot instead of a labeled badge — a dot alone conveys nothing to sighted users who don't hover/tap. Across the codebase there are now 9 distinct card/tile components (`TaskCard`, `DocumentCard`, `ReviewCard`, shadcn `Card`, `SourceCard`, `PersonCard`, `UploadProgressCard`, `BentoDocTile`, `SheetTitlePersonCard`).
**Fix:** Either formally add "Bento Doc Tile" to DESIGN.md's component vocabulary with its own rules, or render a compact visible status word under the title instead of relying solely on a color dot.

### [P3] Section headings are typographically identical to the personal greeting
**Why it matters:** The `<h1>` greeting and every `<h2>` ("Aufgaben", "Zu bestätigen", "Zuletzt gescannt") share `text-base font-semibold text-foreground` — zero visual distinction between the warmest, most personal line on the page and a generic list header. Already flagged in the prior audit; persists in the bento rewrite.
**Fix:** Bump the greeting to DESIGN.md's Display spec (1.125rem/600).

### [P3] AI search bar has no home-specific identity
**Why it matters:** `AISearchBar` renders identically on Home and `/suche` — same placeholder, same visual treatment. For an "AI-native" product, the primary AI entry point on the first screen has no distinguishing framing (no example prompts, no proactive insight) that signals it's the app's central intelligence rather than a generic search field.
**Fix:** Add 1–2 tappable example-question chips beneath the bar on Home, or a proactive one-line insight generated from the family's own data.

### [P3] Task subgroup labels aren't real headings — screen readers can't jump between them
**Why it matters:** `TaskSubGroup` renders "Überfällig"/"Diese Woche"/"Später" as `<p>` elements, not headings. Only the top-level "Aufgaben" `<h2>` is discoverable via a screen reader's heading-navigation shortcut; the three time-horizon groups within it are invisible to that navigation pattern.
**Fix:** Promote subgroup labels to `<h3>` (they nest correctly under the "Aufgaben" `<h2>`).

### [P3] Missing focus-visible ring on the two "Dokument scannen" text buttons
**Why it matters:** The empty-state fallback buttons in "Zu bestätigen" and "Zuletzt gescannt" (`className="text-sm font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)]"`) have no `focus-visible:` ring, unlike every other interactive element on the page — a keyboard user tabbing through gets no visible indicator these are focused.
**Fix:** Add the same `focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50` treatment used elsewhere on the page.

### [P3] `formatRelativeTime` has a narrow hydration-mismatch window; test coverage gaps
**Why it matters:** `BentoDocTile`'s `formatRelativeTime` calls `Date.now()` directly in the render body with no `suppressHydrationWarning`; if wall-clock time crosses a minute/hour boundary between SSR and hydration, the rendered string can mismatch. Separately, `home-client.test.tsx` has no test for the member "+N" overflow branch (`members.length > 5`), the stat-tile petrol/apricot branch selection (`data-testid="home-stat-tasks"` vs `"home-stat-scan"`), or `BentoDocTile`'s status-dot class/label rendering.
**Fix:** Compute relative-time buckets coarsely enough to avoid mismatch, or accept the risk explicitly; add the three missing test cases.

## Cognitive Load Assessment

A populated dashboard requires parsing: 1 search bar, 1 greeting tile, 1 stat tile, up to 3 task subgroups × up to 3 `TaskCard`s each (~6 sub-elements per card: checkbox, title, due date, priority badge, doc link, dismiss), plus two bento grids of up to 3 tiles each — roughly **3 section headers, up to 9 task rows, and up to 6 document tiles**, 40+ individually tappable elements in a single first-touchpoint view. Color signals in simultaneous play: sand-warm (greeting), petrol (links, stat tile, confirmed/ocr_done dots, checked checkbox), apricot (analyzed dots, high-priority badges, and/or the Scan CTA tile, plus the always-active nav tab), mist/mist-dark (muted text). **The Apricot Scarcity Rule is concretely violated** (see P1). The One Voice Rule technically holds at the per-element level (apricot never co-renders with petrol on the same element) but apricot's sheer frequency across separate elements undermines its intended rarity.

## Persona Red Flags

**Casey (distracted mobile user, one-thumb, 30-second sessions):**
- The empty grid cell means the very first frame has dead space instead of an intentional-feeling layout.
- A fast checkbox tap makes the task vanish instantly with no confirmation — reads as "did I break something?"
- If Casey already has an open task, the dashboard's one-tap scan shortcut is gone; must use the bottom nav instead.

**Jordan (first-timer, 2nd/3rd visit):**
- Nothing teaches what "Zu bestätigen" means or what tapping a bento tile does (routes into the `/scan` review flow).
- The apricot dot on an "analyzed" tile has no visible text label — only `title`/`aria-label`, invisible without a hover or screen reader.

**Sam (accessibility — screen reader / keyboard-only):**
- Status meaning relies on a 2px colored dot with only an `aria-label`/`title` text alternative — no always-visible text equivalent for low-vision/colorblind sighted users.
- `TaskSubGroup` labels are `<p>`, not headings — heading-navigation shortcuts skip Überfällig/Diese Woche/Später entirely.
- The two "Dokument scannen" empty-state buttons have no visible keyboard-focus indicator.

## Questions to Consider

1. What would make the AI entry point feel like the product's defining "wow" moment rather than a generic search pill — e.g. a proactive one-line insight generated from the family's actual data ("Ordilo hat gesehen: die Stromrechnung ist in 3 Tagen fällig") sitting above the search bar on load?
2. Should the stat tile's binary choice (task-count vs. scan-CTA) become two permanent, separate bento cells instead of mutually exclusive states, so capture is always one tap away regardless of task load?
3. What is Home's job for a document-rich, task-poor household? Right now such a family sees an apricot-tinted "Scannen" tile and two nearly-empty task-adjacent sections — is Home currently biased toward task-management at the expense of being a genuine "family journal" browsing surface?

## Minor Observations

- `getFileIcon` and `formatRelativeTime` are each duplicated near-verbatim between `home-client.tsx` and `document-card.tsx` with slightly different thresholds — worth consolidating into shared `date-utils`/`file-icon` helpers to prevent drift.
- `STATUS_BADGE_CLASSES.confirmed` in `schemas/document.ts` still uses raw Material-style hex colors outside the Ordilo palette, but this constant is not used by Home's own status-dot map, so it does not currently leak onto this screen.
- `stagger-children` animation delays restart at each task subgroup boundary rather than cascading down the full page — likely unnoticeable but technically inconsistent.
- `BentoDocTile` and `TaskCard` both correctly link to `/scan?doc={id}`, consistent with the rest of the app's document-navigation convention — not a Home-specific anomaly.

## Regression Notes

- None relative to the prior (09:41Z) snapshot's structural complaints — the bento rewrite fixed the RecentDocCard/DocumentCard divergence, the silent-revert-with-no-toast issue, and the missing Überfällig reassurance copy that were previously flagged as P2s. Two new, previously-unseen defects (empty grid cell, apricot-signal proliferation) were introduced by the redesign itself and were not present in the pre-bento layout.
