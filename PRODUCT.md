# Product

## Register

product

## Users

Families — primarily German-speaking parents who manage the household's
important paperwork (invoices, insurance policies, medical records, tax
documents, school letters). They interact on a phone, often in brief
moments between other tasks: scan a letter that came in the mail, look up
a due date, check whether a bill was already paid. Tech literacy varies
across family members; the app must feel effortless for the least
technical person in the household while still satisfying the one who set
it up. The emotional context is "I want this handled so I can stop
worrying about it," not "I enjoy using document software."

## Product Purpose

Ordilo is an AI-native family document organizer. It turns scans and
uploads into a structured, searchable knowledge base: capture a document,
let OCR and LLM extraction do the work, review the result, and confirm it
to build a family knowledge graph that powers semantic search and
conversational Q&A. Success means a family never loses track of an
important document again, and finding any piece of information takes a
natural-language question instead of a filing-cabinet hunt.

## Brand Personality

Warm. Calm. Loving.

Ordilo should feel like a family keepsake, not a filing cabinet. The
voice is quiet and confident — it does the hard work invisibly and
surfaces the result, not the process. Premium without being cold;
competent without being clinical. The app cares about your family's
peace of mind, and every interaction should reinforce that this is a
safe, organized, trustworthy home for the things that matter.

Design references (ChatGPT mockups, July 2026): warm earthy palette with
sage greens, warm browns, and soft cream surfaces; natural, organic,
calm; generous spacing; rounded, gentle forms. The feeling is a
well-kept family journal, not an enterprise tool.

## Anti-references

- **Corporate / enterprise document management** (SharePoint, SAP,
  DocuSign admin panels). Cold, grid-heavy, permission-dialogue
  aesthetics. Ordilo is personal, not institutional.
- **Cluttered scanner apps** with aggressive upsell banners, watermarked
  free tiers, and feature-dense toolbars. Ordilo does one thing
  beautifully, not fifteen things adequately.
- **Cold, clinical fintech aesthetics** — navy-blue dashboards, sharp
  angles, dense data tables, sterile white. Ordilo is warm and human.
- **Generic AI tool UIs** — dark-mode chat interfaces, terminal-style
  typography, novelty gradient accents. Ordilo is a family app, not a
  developer tool.

## Design Principles

1. **Loving, not clinical.** Every surface should feel cared-for — warm
   tones, gentle radii, soft shadows. The app is a family keepsake, not
   a filing system. If a design choice makes the app feel institutional,
   it is wrong.

2. **Calm confidence.** Premium without ostentation. The app does hard
   work (OCR, extraction, embeddings) but never parades it. Surface
   results, not process. Confidence is shown through clarity and
   brevity, not through feature density or visual noise.

3. **Show, don't tell.** The AI is invisible by default. Users see the
   extracted document, not the extraction pipeline. Status is
   communicated through gentle, German-language affordances, not
   technical jargon or progress-bars-as-spectacle.

4. **One hand, one moment.** Mobile-first is not a constraint but a
   design principle. Every primary action is reachable with one thumb.
   The app is built for the 30-second window between dinner and bedtime,
   not for a desktop power session.

5. **Natural warmth through detail.** Warmth comes from typography,
   color, spacing, and micro-interactions — not from cream backgrounds
   by default. The palette is earthy and organic; warmth is intentional
   and specific, not a side effect of tinting everything beige.

## Accessibility & Inclusion

WCAG 2.1 AA compliance is the baseline. Key considerations:

- Body text contrast ≥ 4.5:1 against backgrounds; large text ≥ 3:1.
- Placeholder and muted text must meet the same 4.5:1 threshold, not
  default to barely-legible gray.
- Focus indicators must be visible on warm-tinted surfaces (the petrol
  ring color provides sufficient contrast).
- Touch targets meet the 44 × 44 px minimum, especially on the bottom
  navigation and primary action buttons.
- German-language UI copy should be plain and accessible (Hauptschul-
  niveau where possible), avoiding bureaucratic or technical jargon.
- Reduced-motion preferences are respected — the page-fade-in transition
  and any future animations have `prefers-reduced-motion` alternatives.
