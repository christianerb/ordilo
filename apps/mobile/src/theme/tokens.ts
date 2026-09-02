/**
 * Ordilo design tokens for the native app.
 *
 * Source of truth is DESIGN.md (the Family Journal palette). Keep these
 * values in sync with the CSS custom properties in src/app/globals.css
 * on the web. When the tokens diverge a second time, extract a shared
 * packages/design-tokens module instead of editing both sides again.
 */
export const colors = {
  warmWhite: "#FDFCFA",
  sand: "#F7F5F1",
  sandLight: "#F1EEE8",
  sandWarm: "#EFE8DC",
  graphite: "#262421",
  mistLight: "#D3CEC5",
  mist: "#9C978C",
  mistDark: "#625D54",
  harborBlue: "#305460",
  harborBlueDark: "#285064",
  harborBlueDarker: "#193232",
  warmApricot: "#E46018",
  warmApricotLight: "#F0B4A0",
  blueSoft: "#E4F0FC",
  washSage: "#DDEBE5",
  washSageSoft: "#E6F0EC",
  washBlue: "#E5EEF1",
  washApricot: "#F8E7D4",
  /** Harbor Blue at 10% — the quiet selected/tinted surface. */
  harborTint: "rgba(48, 84, 96, 0.10)",
  /** Harbor Blue at 18% — borders that belong to a harbor-tinted surface. */
  harborLine: "rgba(48, 84, 96, 0.18)",
  destructive: "#C0392B",
  destructiveBackground: "#F9E8E5",
} as const;

export const radii = {
  base: 10,
  sm: 12,
  md: 20,
  lg: 24,
  xl: 28,
  pill: 9999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 48,
} as const;

/**
 * Font family names as registered by @expo-google-fonts/figtree.
 * Figtree is the only typeface — hierarchy comes from weight and size.
 */
export const fonts = {
  regular: "Figtree_400Regular",
  medium: "Figtree_500Medium",
  semibold: "Figtree_600SemiBold",
} as const;

/**
 * Type ramp from DESIGN.md. Line heights are absolute values so RN does
 * not fall back to font metrics that vary per platform.
 */
export const typography = {
  /** Screen titles only — one per screen, never inside cards. */
  largeTitle: {
    fontFamily: fonts.semibold,
    fontSize: 28,
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  /** The briefing headline and confirmation moments. */
  heading: {
    fontFamily: fonts.semibold,
    fontSize: 22,
    letterSpacing: -0.2,
    lineHeight: 28,
  },
  display: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 23.4 },
  headline: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 20.8 },
  title: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22.4 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 14.4 },
  timestamp: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19.6 },
  /** Small emphasised metadata: due labels, chips, counts. */
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 17 },
} as const;

/** Standard control sizes — one vocabulary for touch targets. */
export const sizes = {
  /** Minimum touch target (Apple HIG). */
  touch: 44,
  /** Compact circular icon button. */
  iconButton: 40,
  /** Row leading icon tile. */
  tile: 40,
  /** Row avatar. */
  avatar: 32,
  /** Inline chip avatar. */
  avatarSmall: 22,
} as const;
