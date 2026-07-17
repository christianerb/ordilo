---
name: Ordilo
description: AI-native family document organizer — warm, calm, loving.
colors:
  warm-white: "#FDFCFA"
  sand: "#F7F5F1"
  sand-light: "#F1EEE8"
  sand-warm: "#EFE8DC"
  graphite: "#262421"
  mist-light: "#D3CEC5"
  mist: "#9C978C"
  mist-dark: "#625D54"
  harbor-blue: "#305460"
  harbor-blue-dark: "#285064"
  harbor-blue-darker: "#193232"
  warm-apricot: "#E46018"
  warm-apricot-light: "#F0B4A0"
  blue-soft: "#E4F0FC"
  destructive: "#C0392B"
  destructive-foreground: "#FDFCFA"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "normal"
  timestamp:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  base: "10px"
  sm: "12px"
  md: "20px"
  lg: "24px"
  xl: "28px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.harbor-blue}"
    textColor: "{colors.warm-white}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.harbor-blue-dark}"
    textColor: "{colors.warm-white}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
    height: "36px"
  button-lg:
    backgroundColor: "{colors.harbor-blue}"
    textColor: "{colors.warm-white}"
    rounded: "{rounded.md}"
    padding: "16px 24px"
    height: "48px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.mist-dark}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  button-outline:
    backgroundColor: "{colors.warm-white}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
    height: "36px"
  card:
    backgroundColor: "{colors.sand}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.md}"
    padding: "16px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.graphite}"
    rounded: "{rounded.base}"
    padding: "4px 12px"
    height: "36px"
  badge:
    backgroundColor: "{colors.harbor-blue}"
    textColor: "{colors.warm-white}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  nav-tab:
    backgroundColor: "{colors.harbor-blue-darker}"
    textColor: "rgba(255,255,255,0.55)"
    rounded: "0"
    padding: "10px 0"
  nav-tab-active:
    backgroundColor: "{colors.harbor-blue-darker}"
    textColor: "{colors.warm-apricot}"
    rounded: "0"
    padding: "10px 0"
---

# Design System: Ordilo

## 1. Overview

**Creative North Star: "The Family Journal"**

Ordilo is a well-kept, warm, personal record — not a filing system. Every surface should feel like opening a family journal: quiet pages, gentle forms, calm confidence. The app does hard work (OCR, LLM extraction, semantic search) but never parades it. Users see the result, not the process. The interface is calm by default, warm in its details, and trustworthy in its structure.

The system rejects corporate document management aesthetics (SharePoint, SAP), cluttered scanner apps with aggressive upsells, cold clinical fintech dashboards, and generic AI tool UIs with dark-mode chat interfaces and novelty gradients. Ordilo is personal, not institutional. It does one thing beautifully, not fifteen things adequately. This does not preclude extremely subtle, single-hue ambient washes on large surfaces (e.g. a barely-visible Sand → Sand Light gradient, or a low-opacity Harbor Blue glow) — the rejection is of vibrant, multi-hue "novelty" gradients used as decoration, not of restrained ambient depth cues built from the brand's own palette.

The palette is anchored on a deep maritime teal for trust and authority, a baked apricot for warmth and attention, warm paper-toned surfaces for calm, and graphite text for clarity. The surfaces carry a genuinely warm undertone (never cool, never sterile), while a barely-visible Harbor Blue ambient glow — not a surface tint — is what ties the neutrals back to the brand color.

**Key Characteristics:**
- Warm paper-toned surfaces with graphite text — never sterile white, never yellow cream, never cold blue-gray
- Harbor Blue (#305460) as the single voice of authority — primary actions, links, focus rings
- Warm Apricot (#E46018) used sparingly for active state and high-priority emphasis
- Generous 20px radius on primary cards — gentle, not bubbly
- Subtle, warm-toned shadows that barely lift surfaces off the background
- Mobile-first, one-thumb, 30-second interaction windows
- Inter throughout — one family, multiple weights, no pairing needed
- German-language UI copy, plain and accessible

## 2. Colors: The Family Journal Palette

A restrained palette where one teal carries authority and one apricot carries warmth. Everything else is warm paper tones, graphite, and mist.

### Primary

- **Harbor Blue** (#305460): The voice of authority. Used for primary buttons, links, focus rings, document-type badges, and the checkbox active state. A deep maritime teal that reads as trustworthy and grounded without being corporate navy.
- **Harbor Blue Dark** (#285064): Hover state for primary actions. A slightly deeper, cooler variant.
- **Harbor Blue Darker** (#193232): The bottom navigation surface. Nearly black-teal, providing strong contrast for the white/apricot tab labels while staying within the brand hue.

### Secondary

- **Warm Apricot** (#E46018): The emotional pulse. Used exclusively for the active nav tab, high-priority task badges, and sparingly as a warm highlight. Its rarity is the point — when apricot appears, it means "this is where you are" or "this needs attention."
- **Warm Apricot Light** (#F0B4A0): A soft, baked-clay tint for subtle apricot backgrounds or disabled apricot states.

### Neutral

- **Warm White** (#FDFCFA): The app background. Not pure white — a soft paper tone (R ≥ G > B) that separates it from sterile fintech aesthetics.
- **Sand** (#F7F5F1): The primary card surface. A warm, airy paper tone — every card rests on this tone.
- **Sand Light** (#F1EEE8): Secondary surfaces, muted backgrounds, and the empty-state illustration circle. A slightly deeper warm tone for subtle layering.
- **Sand Warm** (#EFE8DC): Accent backgrounds and hover states. The most visible warmth in the neutral ramp — a soft tan, used for interactive emphasis.
- **Graphite** (#262421): Body text, headings, and primary content. A warm near-black — never pure #000, which would feel clinical.
- **Mist Dark** (#625D54): Muted foreground — secondary text, timestamps, helper text. Meets WCAG AA contrast against warm-white and sand surfaces.
- **Mist** (#9C978C): Icon strokes in empty states and decorative contexts. Does not meet AA for body text — use only for non-text or large-text elements.
- **Mist Light** (#D3CEC5): Borders and input strokes. The thinnest visible layer of separation between surfaces.

### Semantic

- **Destructive** (#C0392B): Error states, failed-document indicators, delete confirmations. A warm, muted red — not alarm-red.
- **Blue Soft** (#E4F0FC): Reserved for rare informational accents. Not part of the primary vocabulary.

### Named Rules

**The One Voice Rule.** Harbor Blue is the single color for primary actions, links, and focus. If two colors compete for "primary" on the same screen, one is wrong. Apricot never pairs with Harbor Blue on the same element.

**The Apricot Scarcity Rule.** Warm Apricot appears on ≤5% of any screen. It marks the active nav tab and high-priority items only. If apricot decorates more than one element per view, it has stopped being a signal and become noise.

**The Warm Neutral Rule.** Backgrounds are never pure white (#FFFFFF) and never sterile blue-gray. Warm White, Sand, Sand Light, and Sand Warm form a four-step warm paper ramp (R ≥ G > B throughout) — genuinely warm, not just warm-adjacent. Harbor Blue and Apricot still carry the brand's color identity; the neutrals carry its warmth.

## 3. Typography

**Display Font:** Inter (with ui-sans-serif, system-ui, sans-serif fallback)
**Body Font:** Inter (with ui-sans-serif, system-ui, sans-serif fallback)
**Label Font:** Inter (same stack — one family, no pairing)

**Character:** Inter is a single, well-tuned sans that carries headings, body, labels, buttons, and data with quiet competence. No display pairing is needed — the family's weight range (400, 500, 600) provides sufficient hierarchy. The choice is deliberate: a product UI should disappear into the task, and a familiar, well-set sans does that better than a distinctive display face.

### Hierarchy

- **Display** (Inter 600, 1.125rem, 1.3 line-height): Section headings and card titles. Appears at the top of each tab and in card headers. Small for a "display" role — product UI density over brand spectacle.
- **Headline** (Inter 600, 1rem, 1.3 line-height): Page-level headings within tabs. The same weight as Display but at body size, distinguishing through placement and spacing rather than size inflation.
- **Title** (Inter 500, 1rem, 1.4 line-height): Card titles, document titles, task titles. Medium weight for content that users scan.
- **Body** (Inter 400, 1rem, 1.5 line-height): Primary content text, descriptions, helper text. Max line length 65–75ch on wider surfaces (the max-w-md column naturally constrains this).
- **Label** (Inter 500, 0.75rem, 1.2 line-height): Badges, status labels, nav tab labels, form labels. Uppercase is not used — Ordilo speaks plainly.
- **Timestamp** (Inter 400, 0.875rem, 1.4 line-height): Relative timestamps ("vor 2 Stunden"), due dates, secondary metadata. Slightly smaller than body, in mist-dark color.

### Named Rules

**The No-Display-Font Rule.** Inter is the only typeface. No serif display, no geometric pairing, no monospace accents. Hierarchy comes from weight (400 → 500 → 600), size (0.75rem → 1.125rem), and color (graphite → mist-dark), never from a different family.

**The No-UpperCase Rule.** Labels and badges use sentence case, never uppercase with letter-spacing. German nouns are already capitalized — adding all-caps reads as bureaucratic, which Ordilo is not.

## 4. Elevation

Shadows are ambient — barely-there warmth that suggests surfaces rest on the background rather than float above it. The graphite-tinted shadow color (`rgba(36, 36, 36, 0.06)`) carries the warm-neutral brand into elevation, avoiding the cold gray drop-shadows of generic UI kits.

The system is flat by default. Shadows appear on cards and interactive surfaces to separate them from the background, not to create a dramatic floating effect. On hover, the shadow deepens slightly — a 2px shift in offset and blur — to confirm interactivity without spectacle.

### Shadow Vocabulary

- **Card Rest** (`box-shadow: 0 2px 8px rgba(36, 36, 36, 0.06)`): Default elevation for all card surfaces. Barely visible — the border does most of the separation work.
- **Card Hover** (`box-shadow: 0 4px 16px rgba(36, 36, 36, 0.08)`): Hover state for interactive cards. A gentle deepening, not a lift.

### Named Rules

**The Ambient Shadow Rule.** Shadows never exceed 16px blur. If a shadow is visible enough to notice, it is too strong. The border (mist-light, 1px) is the primary separator; the shadow is ambient warmth.

**The No-Shadow-Stacking Rule.** Nested cards do not get nested shadows. If a card contains another card, the inner card loses its shadow and relies on background contrast (sand-light vs. sand) for separation.

## 5. Components

### Buttons

Tactile and confident. Harbor Blue primaries, ghost secondaries, outlined tertiaries — one shape, three weights.

- **Shape:** 12px radius (rounded-ordilo-sm) for default/sm sizes; 20px radius (rounded-ordilo-md) for large
- **Primary:** Harbor Blue background (#305460), warm-white text, 36px height, 16px horizontal padding. Hover darkens to Harbor Blue Dark (#285064).
- **Large:** Same as primary but 48px height, 24px horizontal padding, 20px radius. Used for empty-state CTAs and onboarding actions.
- **Ghost:** Transparent background, mist-dark text, 12px radius, 6px/10px padding. Hover gains sand-warm background and graphite text.
- **Outline:** Warm-white background, 1px mist-light border, graphite text. Hover gains sand-warm background.
- **Focus:** 3px ring at 50% opacity of Harbor Blue (the ring color). All variants share this focus treatment.
- **Disabled:** 50% opacity, pointer-events none.

### Cards

The primary surface of the app. Document cards, task cards, person cards — all share the same vocabulary.

- **Corner Style:** 12px radius (rounded-ordilo-sm) — crisp, not puffy
- **Background:** Sand (#F7F5F1)
- **Shadow Strategy:** Card Rest at default, Card Hover on interactive cards
- **Border:** 1px solid Mist Light (#D3CEC5)
- **Internal Padding:** 12px (space-sm) — compact for list-density
- **Layout:** Horizontal flex with gap-2.5 (10px) — icon/checkbox on the left, content in the center, status/badge on the right

### Inputs

- **Style:** 1px Mist Light border, transparent background, 10px radius (base), 36px height
- **Focus:** Border shifts to Harbor Blue, 3px ring at 50% opacity
- **Placeholder:** Muted foreground (mist-dark, #606060) — meets WCAG AA contrast
- **Error:** Border shifts to Destructive, ring at 20% opacity

### Authentication

Login and email-code confirmation use a boxed, two-part welcome surface. On desktop, the product story and mascot illustration sit beside the form; on mobile, they stack into one continuous card. This makes the first contact feel friendly and substantial without turning authentication into a marketing page.

- **Outer background:** Warm White with large, low-contrast organic fields in diluted Harbor Blue, sage, and apricot. These shapes stay behind the auth card and never compete with the form.
- **Auth card:** Warm White, 20px radius, a subtle white border, and Card Rest shadow. The card uses a two-column layout on desktop and a single stacked layout on mobile.
- **Story panel:** Sand-toned surface with wordmark, security badge, short product promise, three feature labels, and the Ordilo mascot composition.
- **Form panel:** Quiet Warm White surface, max-width 384px, standard controls, and Harbor Blue as the only action color.
- **Email-code state:** Uses the same outer shell. On mobile, the story illustration collapses so the code inputs remain immediately accessible.
- **Supporting colors:** Sage and apricot are soft background tints only. They never replace Harbor Blue for buttons, links, focus, or status actions.

### Shared Canvas and Boxed App Layout

The friendly boxed composition from authentication and the public landing page is the shared visual language for the whole product. Authenticated screens should feel like pages placed inside the same calm family journal, not like a separate dashboard product.

- **Canvas:** Every major screen rests on Warm Canvas (`--canvas-warm`) with two or three large, low-contrast organic fields using Sage, Harbor Blue, and Apricot washes. These shapes are atmospheric and never carry information.
- **Page frame:** Authenticated content sits inside a responsive Warm White frame (`--surface-box`) with a 20px desktop radius, a subtle white border, and Card Rest shadow. On mobile the frame may meet the viewport edges, but internal sections retain 12px radii.
- **Story surfaces:** Page greetings, titles, summaries, empty states, and grouped information may use Sand Story (`--surface-story`) or Sage Wash (`--wash-sage`). One screen should not use more than two wash colors for content.
- **Section grouping:** Related content belongs in one boxed section with internal dividers. Avoid repeated floating cards when a single grouped surface communicates the relationship more clearly.
- **Page headers:** A page header combines title, count or short context, and the primary action in one calm surface. Harbor Blue remains the only primary action color.
- **Organic fields:** Large circles and softly rotated 28px rectangles are allowed behind page frames or inside illustrative regions. They remain low contrast, non-interactive, and hidden from assistive technology.
- **Mobile behavior:** Preserve one-thumb access and keep primary content above decorative areas. Organic fields may be cropped or hidden; forms, lists, and actions always take priority.
- **Metadata contrast:** Secondary text uses Mist Dark or `text-muted-foreground` at full opacity. Opacity below 70% is reserved for decorative icons, never instructional copy, dates, counts, or labels.

### Badges

- **Style:** Full pill radius (9999px), 2px/10px padding, 0.75rem font-size, medium weight
- **Status Badges:** Color-coded by document status — confirmed (harbor blue tint), failed (destructive), processing (mist), uploaded (mist-dark)
- **Priority Badges:** High (warm apricot), medium (harbor blue), low (muted)
- **Document Type Badges:** Harbor Blue at 10% opacity background, 20% opacity border, harbor blue text

### Navigation

Bottom tab bar, fixed, centered at max-w-md. Five tabs: Home, Scan, Suche, Familie, Aufgaben.

- **Background:** Harbor Blue Darker (#193232) — the darkest brand surface
- **Inactive Tab:** White at 55% opacity, 11px label, 20px icon
- **Active Tab:** Warm Apricot (#E46018), 11px label, 20px icon at 2.4 stroke-width
- **Border Top:** White at 10% opacity
- **Touch Target:** Full tab width, ~44px height minimum
- **Hidden on:** /onboarding (full-screen conversational flow)

### Desktop Sidebar

Persistent left rail on lg+ viewports, replacing the bottom tab bar. Collapsible (76px icon rail ⇄ 256px full width), with a Sammlungen (collections) list and a profile footer.

- **Background:** A barely-perceptible ambient wash — Sand blending into Sand Light over the first ~260px, plus a soft Harbor Blue radial glow (≤7% opacity) behind the wordmark. This extends the Ambient Shadow Rule's philosophy to the surface itself: present enough to add depth, restrained enough to never read as a "gradient effect."
- **Active Indicator:** A small Warm Apricot dot (never the tab background or label color) marks the current nav item or collection, per the Apricot Scarcity Rule — only one dot is visible at a time, since exactly one route is ever active.
- **Sammlungen Rows:** Each collection row is tinted at low opacity in its own collection color (a diluted version of its icon-chip color), so the list reads like a row of colored folder tabs. The active row adds a 1px inset ring in the same color — a full border, never a stripe.
- **Scenery Illustration:** A small line-art landscape (hills, house, trees, sun) sits above the profile footer. Its sky and sun/moon colors shift gently with time of day (morning/day/evening/night) — a quiet, ambient personality touch, not a state-conveying animation. Hidden when collapsed and from assistive tech.
- **Greeting:** A time-appropriate German greeting ("Guten Morgen", "Guten Tag", "Guten Abend", "Gute Nacht") plus the signed-in family's display name, in place of a purely decorative header — personal, not corporate branding.
- **Collapsed state:** Hides all text labels, the scenery illustration, and the greeting, keeping only icons and dots.

### Empty States

Warm, inviting, educational. Not "nothing here."

- **Illustration:** 80px sand-light circle with a 36px mist-colored icon (1.5 stroke)
- **Heading:** Inter 600, 1.125rem, graphite
- **Description:** Inter 400, 0.875rem, mist-dark, max-w-xs, centered
- **CTA:** Large primary button, 48px height, 20px radius

### Signature: Document Card

The most-seen component in the app. Horizontal layout: file-type icon (40px sand-light square, 12px radius, mist-dark icon) → title + timestamp → status badge + retry. The card is interactive when onClick is provided (role="button", cursor-pointer, hover shadow). Failed documents show friendly German copy (not raw error messages) and a retry button in harbor blue.

### Signature: Task Card

Horizontal layout: circular checkbox (24px, harbor blue when checked) → title + due date + priority badge → dismiss button. Done tasks get strikethrough and muted foreground. Due dates use German format (DD.MM.YYYY) with a calendar icon.

## 6. Do's and Don'ts

### Do:
- **Do** use Harbor Blue (#305460) as the single primary action color across every screen.
- **Do** use Warm Apricot (#E46018) only for the active nav tab and high-priority indicators — never more than one apricot element per view.
- **Do** use Sand (#F7F5F1) as the card surface and Warm White (#FDFCFA) as the app background. The four-step warm paper ramp (warm-white, sand, sand-light, sand-warm) is the surface vocabulary.
- **Do** use 12px radius (rounded-ordilo-sm) on primary cards and list items. 20px (rounded-ordilo-md) is reserved for large feature cards and empty-state CTAs.
- **Do** keep shadows ambient: `0 2px 8px rgba(36, 36, 36, 0.06)` at rest, `0 4px 16px rgba(36, 36, 36, 0.08)` on hover. Never exceed 16px blur.
- **Do** use Inter throughout, with hierarchy from weight (400/500/600) and size (0.75rem–1.125rem), never from a different typeface.
- **Do** write German UI copy at Hauptschul-niveau — plain, warm, non-bureaucratic.
- **Do** provide empty states that teach the interface (sand-light circle + icon + heading + description + CTA).
- **Do** respect `prefers-reduced-motion` — the page-fade-in and any animations need instant alternatives.
- **Do** explore sage greens and warm tans (from design references) as the system grows — they complement Harbor Blue and Apricot naturally.
- **Do** use extremely subtle, single-hue ambient gradients (within the Sand → Sand Light ramp, or a ≤10% Harbor Blue wash) for depth on large, mostly-empty surfaces — the sidebar and the app background both carry a barely-visible Harbor Blue corner glow for this reason. Never a vibrant, multi-hue, or novelty gradient.

### Don't:
- **Don't** use pure white (#FFFFFF) or a cool blue-gray for surfaces. Warm White and Sand are the backgrounds, and both lean genuinely warm; pure white feels clinical, cool-toned neutrals feel corporate.
- **Don't** use border-left or border-right greater than 1px as a colored accent stripe. Full borders or background tints only.
- **Don't** pair a 1px border with a wide drop shadow (blur ≥ 16px) on the same element. The border separates; the shadow warms. Pick the border as primary, keep the shadow ambient.
- **Don't** use gradient text (`background-clip: text` with a gradient). Single solid colors only — emphasis comes from weight or size.
- **Don't** use radii larger than 28px on cards, sections, or inputs. 12px is the primary card radius (crisp, list-density); 28px is the ceiling for large feature cards.
- **Don't** use uppercase letter-spacing on labels or badges. Sentence case, always — German nouns are already capitalized.
- **Don't** use Mist (#9C978C) for body text or any text that needs to meet WCAG AA contrast. Use Mist Dark (#625D54) for muted foreground.
- **Don't** use display fonts, serif pairings, or monospace accents in the UI. Inter is the only typeface.
- **Don't** use decorative motion that doesn't convey state. The page-fade-in (0.25s ease-out) is the only page-level animation; everything else is state transitions (150–250ms).
- **Don't** use corporate/enterprise document management aesthetics — grid-heavy layouts, permission dialogues, cold blue-gray surfaces. Ordilo is personal and warm.
- **Don't** use cluttered scanner-app patterns — upsell banners, watermarked free tiers, feature-dense toolbars. Ordilo does one thing beautifully.
- **Don't** use dark-mode chat interfaces, terminal typography, or novelty gradient accents. Ordilo is a family app, not a developer tool.
