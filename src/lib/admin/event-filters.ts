/**
 * Which product events each admin reader skips, in one place.
 *
 * The database writes app_opened (once per person and day) and
 * invite_accepted (joining a family) on its own. Neither is product use,
 * so the overview's "aktiv" numbers and the beta funnel never load them;
 * the Wachstum tab reads them through its own aggregate.
 */
export const NOT_PRODUCT_USE_EVENTS = ["app_opened", "invite_accepted"] as const;

/** The activity feed keeps joins visible but hides the daily app opens. */
export const FEED_HIDDEN_EVENTS = ["app_opened"] as const;

/** PostgREST list literal for `.not("event_name", "in", …)`. */
export function eventNameList(names: readonly string[]): string {
  return `(${names.join(",")})`;
}
