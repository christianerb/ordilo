---
target: aufgaben und planer
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-08-11T09-18-28Z
slug: src-app-app-aufgaben
---
⚠️ DEGRADED: single-context (Assessment B sub-agent failed: child turn error; Assessment B evidence gathered inline in parent context)

# Critique: Aufgaben & Planer (`src/app/(app)/aufgaben`)

Surface type: Operate. Scope: task board (`/aufgaben`) and calendar planner (`/aufgaben?tab=planer`). Note: this critique runs on the just-fixed surface (audit fixes uncommitted in the working tree); the deterministic scan is clean because those fixes landed.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Toasts, selected date, conflict warnings are good; no single-glance "today" summary. |
| 2 | Match System / Real World | 4 | Plain German, familiar task/calendar terms, Hauptschul-niveau copy. |
| 3 | User Control and Freedom | 2 | Swipe-left dismiss has no confirmation or undo; Aufgaben/Planer switching only via nav. |
| 4 | Consistency and Standards | 2 | Board, calendar, gesture, and menu actions overlap; member colors functional without stable visual rule. |
| 5 | Error Prevention | 2 | Event conflict warning good; accidental swipe dismissal and gesture collision remain. |
| 6 | Recognition Rather Than Recall | 2 | Mode switch hidden in URL/nav; initials-only filters; gestures need remembering. |
| 7 | Flexibility and Efficiency | 2 | Drag, swipe, voice, filters help experts; no simple "next up" mode. |
| 8 | Aesthetic and Minimalist Design | 2 | Calendar stacks filter, view mode, navigation, grid, agenda, voice, suggestions in one flow. |
| 9 | Error Recovery | 3 | Friendly German validation/errors; task dismissal is the weak exception. |
| 10 | Help and Documentation | 2 | One-time drag hint only; no explanation of board buckets, gesture risk, or voice privacy. |
| **Total** | | **24/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment: 5/10.** Warm German copy, document-derived suggestions, and confirmation-first voice entry are genuinely Ordilo-specific. But the core remains a generic Kanban board plus a generic month calendar; it does not yet make the family's immediate "Was muss heute wer tun?" decision feel uniquely effortless. Category-interchangeable choices: four-column board, month grid + agenda stack, initials filter chips. Missed opportunity: a calm persistent "Heute / diese Woche / wartet auf wen?" summary.

**Deterministic scan: clean.** `detect.mjs --json src/app/(app)/aufgaben` returned `[]` (exit 0) — zero findings. This reflects the immediately preceding fix round (touch targets, type ramp, border-rule, contrast chips), not an absence of design issues.

**Visual overlays: not available.** Mutable script injection was not attempted (Playwright MCP `browser_evaluate` not loaded in this run); screenshots also timed out at the harness 5 s limit. Fallback signal: accessibility-tree snapshots for both routes at 1440px and 390px, plus console log inspection (clean except pre-existing favicon 404).

## Overall Impression

The surface is calm, warm, and competently built — a solid German family planner. What works: trustworthy feedback loops, document-linked suggestions, voice-to-proposal flow. What doesn't: two hidden modes that must be navigated before answering "what now?", and gesture-heavy task cards where one wrong thumb motion can silently discard work. Biggest opportunity: make Aufgaben and Planer feel like one shared operating surface instead of two views behind a URL parameter.

## What's Working

- **Document dates become actionable suggestions** with a link back to the source document — genuinely product-specific and useful.
- **Event conflicts warn rather than block**, preserving family control; German feedback is clear and forgiving; rescheduling offers undo.
- **Voice planning requires review before writing an event** — correct trust posture for an AI feature in a family context.

## Priority Issues

1. **[P1] Aufgaben and Planer lack visible local orientation.**
   - **Why it matters:** The route changes behavior through `?tab=planer` while the page title says only "Familienplaner". A busy parent cannot immediately see or change the current mode; they must remember which nav entry does what.
   - **Fix:** Add a visible local view switcher (segmented "Aufgaben / Planer" control) at the top of the surface, or at minimum an unmistakable mode label linking to the sibling view.
   - **Suggested command:** `$impeccable shape`

2. **[P1] Task-card gestures make destructive action too easy.**
   - **Why it matters:** One card supports tap, checkbox, swipe-right complete, swipe-left dismiss, long-press drag, desktop drag, and overflow actions. Left-swipe dismissal has neither confirmation nor undo. One accidental thumb flick silently discards a task.
   - **Fix:** Make dismissal non-destructive/undoable (toast with "Rückgängig"), reduce gesture count, and make the destructive path explicit rather than hidden behind a gesture.
   - **Suggested command:** `$impeccable harden`

3. **[P2] The calendar is a collection of views, not a focused operating surface.**
   - **Why it matters:** Filters, month/week switching, date navigation, grid, selected-day agenda, voice entry, and document suggestions all stack vertically and compete. Defaulting to a full month grid forces scanning before acting.
   - **Fix:** Default to a concise upcoming/today agenda; treat the month grid as navigation, not the dominant first decision.
   - **Suggested command:** `$impeccable layout`

4. **[P2] People signals are semantically and visually overloaded.**
   - **Why it matters:** Colored event borders, initial avatars, attendee chips, a responsible-person select, and an initials-only filter all encode different person states. Co-parents cannot tell whether a color means "attending", "responsible", or "filtered".
   - **Fix:** Show full names in the member filter, distinguish "dabei" from "kümmert sich" explicitly, and avoid arbitrary avatar colors carrying calendar meaning.
   - **Suggested command:** `$impeccable clarify`

5. **[P3] Visual drift from the calm Ordilo hierarchy.**
   - **Why it matters:** The active "Alle" filter uses a dark foreground treatment; arbitrary member colors and amber conflict styling introduce competing accents, diluting the One Voice and Apricot Scarcity rules.
   - **Fix:** Keep Harbor Blue as the primary interaction voice, reserve Apricot for urgency, and use a quieter conflict treatment.
   - **Suggested command:** `$impeccable quieter`

## Persona Red Flags

**Alex (Power User):** No keyboard shortcuts on board or calendar; no bulk actions; moving between modes requires nav clicks; desktop drag has no visible affordance. Alex will tolerate it, but feels the friction immediately.

**Jordan (First-Timer):** The page title "Familienplaner" does not reveal whether this is tasks or calendar; hidden gestures (swipe dismiss) are discovered only by accident; no help explains board buckets ("Später" mixes later and undated tasks). Jordan will abandon at the first accidental dismissal.

**Casey (Distracted Mobile):** One-thumb use is decent after the 44px fix, but swipe-left dismiss is one accidental motion away from silently losing a task; no undo. Interruption mid-gesture is a real risk.

## Minor Observations

- "Später" combines genuinely later tasks with tasks that have no due date — distinct planning states.
- "Erledigt" stays as a full board column and can dominate instead of supporting current work.
- Desktop drag has no visible affordance; the mobile hint is hidden for fine pointers.
- Empty-state promise "nie wieder Fristen im Kopf behalten" overstates coverage when manual entry is still required.
- Voice entry explains confirmation but not what happens to spoken input before it becomes a proposal (privacy-sensitive users will wonder).

## Questions to Consider

- Why must a parent navigate between two modes before they can answer "Was sollten wir als Nächstes tun?"
- Is a task board organized by computed due-date buckets really the family's mental model of a plan?
- Should "attending" and "responsible" be separate fields without a clearer payoff in the calendar?
- Is voice entry more valuable than a calm, persistent "Heute / diese Woche / wartet auf wen?" summary?
