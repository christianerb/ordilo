/**
 * Soft background washes cycled across the family member cards so each
 * one reads as its own tile in the grid — pulled from the same palette
 * already used for highlighted surfaces elsewhere in the app (see
 * globals.css `--wash-*` and `--sand-*` tokens), not new colors.
 */
const CARD_WASHES = [
  "var(--wash-blue)",
  "var(--wash-apricot)",
  "var(--sand-warm)",
  "var(--wash-sage)",
  "var(--sand-light)",
  "var(--wash-sage-soft)",
] as const;

export function getFamilyCardWash(index: number): string {
  return CARD_WASHES[index % CARD_WASHES.length];
}
