---
target: home
total_score: 26
p0_count: 0
p1_count: 3
p2_count: 2
p3_count: 1
timestamp: 2026-07-07T09-13-54Z
slug: src-app-app-home
---
Method: dual-agent (A: 8b6a688d · B: 9e3efadd)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Status badges + processing spinners are clear, but no loading/skeleton state while server component fetches |
| 2 | Match System / Real World | 3 | German labels are plain and appropriate; "Heute wichtig" and "Fristen" overlap conceptually |
| 3 | User Control and Freedom | 2 | No undo toast after marking task done; no dismiss handler wired on home |
| 4 | Consistency and Standards | 3 | Card patterns are consistent; RecentDocCard reimplements its own card markup instead of reusing DocumentCard |
| 5 | Error Prevention | 2 | "Heute wichtig" / "Fristen" overlap is an unprevented cognitive error — users see the same task twice |
| 6 | Recognition Rather Than Recall | 3 | Icons + text labels throughout; member avatars show only a single initial — no disambiguation for same-initial names |
| 7 | Flexibility and Efficiency | 2 | No keyboard shortcuts, no swipe gestures, no quick-actions on cards |
| 8 | Aesthetic and Minimalist Design | 3 | Clean and warm overall; member area shows avatars AND name pills (redundant); confidence badge adds badge clutter |
| 9 | Error Recovery | 3 | Failed documents show friendly German copy with retry; optimistic task toggle reverts on DB error |
| 10 | Help and Documentation | 2 | Empty states teach well, but no inline help, tooltip, or first-visit coach mark; four simultaneous empty states overwhelm first-timers |
| **Total** | | **26/40** | **Good — address weak areas, solid foundation** |

## Anti-Patterns Verdict

**LLM assessment:** This does not look AI-generated. No gradient text, no side-stripe borders, no glassmorphism, no hero-metric template, no uppercase tracked eyebrows, no numbered section markers, no border+wide-shadow pairing, no over-rounded radii (max 20px on cards), no sketchy SVG, no repeating-linear-gradient stripes, no decorative grid backgrounds. The card vocabulary is varied (TaskCard with checkbox, DocumentCard with status badge, RecentDocCard with chevron). The one mild AI-tool tell is the Sparkles icon on the AISearchBar — restrained but leaning toward "generic AI chat." The confidence badge's Material Design color palette (#4CAF50 green, #FF9800 amber, #EF5350 red) is the closest thing to a "default AI output" color choice and clashes with the warm earthy Ordilo palette.

**Deterministic scan:** The automated detector returned 0 findings on both the TSX component batch (6 files) and the CSS file (globals.css). Exit code 0 (clean) on both runs. No false positives to flag.

**Visual overlays:** No browser visualization was performed — no dev server was running, and browser automation was not available in the sub-agent context. No user-visible overlay is available for this run.

## Overall Impression

The home page is a well-engineered task dashboard that hasn't fully decided whether it's a family journal or a filing system. The token discipline and empty states are genuinely warm, but the greeting is functional, the confidence badge is clinical, and the four-section layout creates cognitive overlap. The single biggest opportunity: replace the four equal sections with a summary-first approach that answers "what needs my attention?" before asking the user to browse.

## What's Working

1. **Empty states that teach.** Each section's empty state uses the section's own icon, a warm German heading, a one-line description, and a single CTA. These say "here's what to do next," not "nothing here." The strongest embodiment of the "show, don't tell" principle.

2. **Token discipline.** The warm-neutral surface ramp (warm-white, sand, sand-light, sand-warm), single authority color (petrol), single accent (apricot), and ambient shadow vocabulary capped at 16px blur create a cohesive system. No rogue gradients, no ad-hoc colors. This is what keeps the page from looking AI-generated.

3. **Optimistic task interaction with graceful revert.** The handleToggleDone flow immediately updates local state, attempts the DB write, and reverts on error with router.refresh() to sync cross-section state. Tapping a checkbox feels instant — critical for the "30-second window" use case.

## Priority Issues

### [P1] "Heute wichtig" and "Fristen" show duplicate tasks
**Why it matters:** filterHeuteWichtig (due within 7 days) is a subset of filterFristen (all future due dates). A task due in 3 days appears in both sections. Users see the same task twice and may act on it in both places, or wonder if they're different items. This is a working memory tax that compounds with each overlapping task.
**Fix:** Make the sections mutually exclusive — filterFristen should exclude tasks already in heuteWichtig (i.e., due > 7 days out), or rename "Fristen" to "Weitere Fristen" to signal it's the remainder. Alternatively, collapse into one section with a "this week" / "later" visual divider.
**Suggested command:** $impeccable shape

### [P1] Greeting lacks warmth and time awareness
**Why it matters:** The h1 is just {familyName} with "{n} Familienmitglieder" below. This reads like a database record, not a family journal entry. PRODUCT.md says "warm, calm, loving" and "a family keepsake, not a filing cabinet." The first thing the user sees should feel like opening a journal.
**Fix:** Add a time-of-day greeting ("Guten Abend" / "Guten Morgen") above or instead of the family name. Consider showing the family name as a sub-element rather than the h1. The greeting should feel personal, not administrative.
**Suggested command:** $impeccable clarify

### [P1] Overdue tasks are invisible on the home page
**Why it matters:** Both filterHeuteWichtig and filterFristen filter with `>= today`, so a task that was due yesterday and is still open vanishes from the home page entirely. The most urgent tasks (past due) are the ones most likely to need attention, and their absence is a significant functional gap. A past-due bill is the highest-stakes moment in a family document system.
**Fix:** Add an "Überfällig" section at the top, or include overdue tasks in "Heute wichtig" with a distinct visual treatment (destructive or apricot accent). The app's most caring moment should be when something needs urgent attention.
**Suggested command:** $impeccable shape

### [P2] Member information is duplicated (avatars + name pills)
**Why it matters:** The greeting area renders member avatars (overlap stack, up to 5) AND immediately below, a full list of member name pills. This doubles the visual weight of the family identity area. For a family of 5, that's 10 elements in the first 200px of the page.
**Fix:** Pick one representation. Keep the avatar stack with aria-label per avatar (already present) and remove the name pills, OR keep only the pills and remove the avatar stack. Don't show both.
**Suggested command:** $impeccable distill

### [P2] Confidence badge uses Material Design colors that clash with the warm palette
**Why it matters:** ConfidenceBadge uses #4CAF50 (green), #FF9800 (amber), #EF5350 (red) — Google Material Design colors, not Ordilo tokens. On a warm cream card with graphite text and petrol/apricot accents, a saturated green dot and red percentage feel like a different design system was pasted in. This is the most "clinical" element on the page. Also, showing a confidence percentage is "process, not result" — PRODUCT.md says "surface results, not process."
**Fix:** Map confidence to the Ordilo palette (high = petrol or sage green, medium = apricot, low = destructive), or remove the percentage and use a single muted dot. Consider hiding confidence on the home page entirely and only showing it on the review screen.
**Suggested command:** $impeccable colorize

### [P3] No prefers-reduced-motion handling for page-fade-in
**Why it matters:** The animate-page-fade-in keyframe is applied on every route change. PRODUCT.md and DESIGN.md both explicitly require respecting prefers-reduced-motion. The globals.css defines the animation but has no @media (prefers-reduced-motion: reduce) block to disable it.
**Fix:** Add @media (prefers-reduced-motion: reduce) { .animate-page-fade-in { animation: none; } } to globals.css.
**Suggested command:** $impeccable polish

## Persona Red Flags

**Casey (distracted mobile user):**
- No single "you have N things to review" summary — Casey must scroll through four sections to build a mental picture
- Search bar is the first interactive element but the least likely action for a quick check-in; "see what needs attention" is buried below the greeting
- Task checkbox is size-6 (24px) and dismiss button is ~28px — both below the 44px touch target minimum
- No state preservation indicator if Casey leaves and returns mid-scroll

**Jordan (first-timer):**
- All four sections show empty states simultaneously — four illustrations, four headings, four "Dokument scannen" buttons is overwhelming and visually repetitive
- No "welcome" or first-visit guidance — the greeting is just the family name with no coach mark or progressive onboarding nudge
- The search bar placeholder implies the app already has content to search — for a first-timer with zero documents, this is misleading

**Sam (accessibility user):**
- The h1 is the family name, which is not a meaningful page title for screen reader navigation — "Familie Müller" doesn't describe the page's purpose
- The dismiss button (aria-label="Aufgabe verwerfen") is not wired up on the home page (onDismiss is not passed), so Sam could find a control that does nothing
- Confidence badge has no text alternative for the color coding — data-confidence-level exists but is not exposed via aria
- Member name pills don't have a semantic list role (ul/li), so Sam hears them as disconnected spans

## Minor Observations

- RecentDocCard uses FileCheck icon for all documents regardless of MIME type, while DocumentCard correctly differentiates between ImageIcon and FileText
- HomeSection icon color is set via inline style rather than a Tailwind class — inconsistent with the rest of the codebase
- The Link wrapping DocumentCard in "Neue Dokumente" creates a nested interactive element pattern that could lead to double-navigation bugs
- The AppShell header contains only a logout button — no wordmark, no logo. For a "family keepsake" product, the absence of any brand mark makes the app feel generic
- Four sections in a vertical scroll with only whitespace separation can feel like an undifferentiated list on a long page — no visual container or divider
- The h1 uses text-2xl (1.5rem) with font-bold, which is larger than the DESIGN.md display spec (1.125rem, 600 weight) — a spec violation

## Questions to Consider

1. What if the home page had a single "Heute" summary card at the top instead of four sections? One card that says "Du hast 2 Dokumente zu bestätigen und 1 Aufgabe fällig" with a tap to expand into details.

2. What if confidence were invisible by default on the home page? The percentage is AI process, not result. What if confidence only appeared on the review screen where the user is making a confirmation decision?

3. What if overdue tasks were the loudest thing on the page? A past-due bill is the highest-stakes moment — what if it triggered a warm but prominent "Diese Aufgabe ist überfällig" card at the very top?
