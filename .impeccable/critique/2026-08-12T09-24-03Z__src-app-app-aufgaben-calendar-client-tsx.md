---
target: Familienplaner calendar client
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-12T09-24-03Z
slug: src-app-app-aufgaben-calendar-client-tsx
---
# Familienplaner critique

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 3 | Save and conflict feedback exist, but form failures do not identify the field. |
| 2 | Match system and real world | 4 | Plain German and household context fit families well. |
| 3 | User control and freedom | 2 | No draft protection when opening a source document while editing. |
| 4 | Consistency and standards | 3 | Calendar modes and form tone are not fully aligned. |
| 5 | Error prevention | 3 | Date and conflict protection are good; destructive recovery is limited. |
| 6 | Recognition rather than recall | 2 | Initial-only people filters and mobile dots require memory. |
| 7 | Flexibility and efficiency | 2 | No quick repeat or compact creation workflow. |
| 8 | Aesthetic and minimalist design | 3 | Warm and legible, but several primary control systems compete. |
| 9 | Error recovery | 2 | Generic save errors and no unsaved-draft protection. |
| 10 | Help and documentation | 1 | Important planner concepts have no contextual explanation. |
| **Total** | | **25/40** | **Acceptable, significant refinement needed** |

## Design Specificity Verdict

The document-derived discovery moment and explicit family language are distinctively Ordilo. The core planner is still largely a generic calendar plus a long CRUD form. The detector found seven target-specific typography advisories in `calendar-client.tsx` where literal 10px and 11px labels fall outside the documented type ramp. No false positives were established.

## Overall Impression

A capable, warm family planner with useful intelligence, but not yet a relaxed 10/10 coordination surface. The biggest opportunity is to establish one dominant task per moment, then turn the edit sheet into a short, protected flow.

## What's Working

- Document discoveries are useful, sourced, and never applied without consent.
- Ownership is stated in language instead of encoded only with color.
- Calendar status, recurrence, location, and family context are surfaced in meaningful copy.

## Priority Issues

### [P1] Too many competing first-class controls
Suggestions, person filters, view controls, date navigation, calendar grid, and the selected-day agenda compete above the fold. Make seeing what is next the default, with planning controls secondary or progressively revealed. Suggested command: `$impeccable layout`.

### [P1] Flat, long event-edit flow
The sheet presents title, dates, timing, conflict, place, recurrence, people, responsibility, note, save, and delete as one serial form. Put the essentials first and reveal planning details only when needed. Suggested command: `$impeccable distill`.

### [P1] Unsaved edits are not protected
The document source link can leave a stateful edit sheet without preserving its draft. Warn before leaving or retain the draft when returning. Suggested command: `$impeccable harden`.

### [P2] People are difficult to recognize in filters
Initial-only circles become ambiguous for shared initials and do not explain attendance versus responsibility. Use recognisable, visible names or avatar chips. Suggested command: `$impeccable clarify`.

### [P2] Mobile month view hides useful event information
Identical dots only reveal that something exists. Make counts or the next event recognisable without exploratory tapping. Suggested command: `$impeccable adapt`.

## Persona Red Flags

**Jordan, first-time parent:** cannot infer what initial filters represent, and month dots conceal appointment meaning.

**Casey, distracted mobile parent:** must navigate a tall, flat form and could lose work while checking a source document.

**Alex, frequent coordinator:** has no fast path for routine recurring events and must manually work through the same planning details repeatedly.

## Minor Observations

- The detector flags seven `text-[10px]`/`text-[11px]` usages outside the documented type ramp.
- Uppercase week labels conflict with the design system's no-uppercase rule.
- The persistent pulsing suggestion sparkle is decorative rather than stateful.
- The amber conflict warning is outside Ordilo's constrained semantic palette.

## Questions to Consider

1. Is this primarily a surface for seeing today, or a full planner for managing the household timeline?
2. What is the minimum information needed to secure a family appointment before optional planning details appear?
3. How should document discoveries reduce work instead of opening another form?
