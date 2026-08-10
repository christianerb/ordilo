const DEFAULT_AVATAR_COLOR = "#305460";
const LIGHT_AVATAR_TEXT = "#FDFCFA";
const DARK_AVATAR_TEXT = "#201E1B";

function parseHexColor(color: string): [number, number, number] | null {
  const value = color.trim().replace(/^#/, "");
  const expanded =
    value.length === 3
      ? value
          .split("")
          .map((channel) => `${channel}${channel}`)
          .join("")
      : value;

  if (!/^[\da-f]{6}$/i.test(expanded)) return null;

  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ];
}

function relativeLuminance(color: [number, number, number]): number {
  const [red, green, blue] = color
    .map((channel) => channel / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundColor = parseHexColor(foreground);
  const backgroundColor = parseHexColor(background);
  if (!foregroundColor || !backgroundColor) return 0;

  const [lighter, darker] = [
    relativeLuminance(foregroundColor),
    relativeLuminance(backgroundColor),
  ].sort((first, second) => second - first);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Keeps initials legible on every supported family-member avatar color.
 * Invalid legacy values fall back to the trusted Ordilo petrol.
 */
export function resolveAvatarColor(color: string | null | undefined): string {
  return color && parseHexColor(color) ? color : DEFAULT_AVATAR_COLOR;
}

/** Chooses the stronger of Ordilo's light and dark avatar inks. */
export function getAvatarTextColor(color: string | null | undefined): string {
  const background = resolveAvatarColor(color);

  return contrastRatio(LIGHT_AVATAR_TEXT, background) >=
    contrastRatio(DARK_AVATAR_TEXT, background)
    ? LIGHT_AVATAR_TEXT
    : DARK_AVATAR_TEXT;
}
