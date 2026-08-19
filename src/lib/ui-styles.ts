/**
 * Shared UI style constants.
 *
 * Class strings that recur across multiple components — extracted so a
 * design-system change lands in one place instead of ten.
 */

/**
 * Active state for filter chips, toggle buttons, and selectable items.
 * Harbor Blue tint — never apricot (that stays reserved for the nav).
 *
 * Used by: MoreFiltersButton, DuePresetChips, AssigneePicker, FilterChip
 * variants in aufgaben/suche, and the family documents-only toggle.
 */
export const FILTER_ACTIVE =
  "border-[var(--petrol)]/25 bg-[var(--petrol)]/10 text-[var(--petrol)]";

/**
 * Inactive state for the round "Weitere Filter" toggle button.
 * Paired with {@link FILTER_ACTIVE} in the more-filters button.
 */
export const FILTER_TOGGLE_INACTIVE =
  "border-border bg-card text-muted-foreground hover:text-foreground";

/**
 * Full-bleed horizontal scroll rail — used by the documents "Zuletzt
 * hinzugefügt" rail and the aufgaben member-chip row. Bleeds into the
 * page padding on mobile and snaps back to the content column on lg+.
 */
export const RAIL_BLEED =
  "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/**
 * Standard input/card surface — the 3-class prefix that starts most
 * bordered card and input elements. Combine with padding/text/focus
 * classes for the specific use case.
 */
export const SURFACE_CARD = "rounded-ordilo-sm border border-border bg-card";

/**
 * Section card — a full section surface with padding and ambient shadow.
 * Used by settings cards, onboarding steps, and answer cards.
 */
export const SECTION_CARD =
  "rounded-ordilo-md border border-border bg-card p-4 shadow-card";

/**
 * Petrol link button — a text-style link in Harbor Blue with hover
 * darkening. Used for "reset filters", "show all", and similar inline
 * text actions.
 */
export const PETROL_LINK =
  "text-sm font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)]";
