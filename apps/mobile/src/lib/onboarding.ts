/**
 * Onboarding constants and validation — hand-ported from the web app's
 * Zod schemas (src/lib/schemas/onboarding.ts) and collections
 * (src/lib/schemas/collections.ts). The mobile app carries no zod, so the
 * rules are reimplemented with identical bounds and identical German
 * messages. If the web schemas change, change them here too.
 */

/** Preset avatar colors offered during onboarding (same list as web). */
export const AVATAR_COLORS = [
  "#305460", // Deep Petrol
  "#E46018", // Warm Apricot
  "#8E44AD", // Purple
  "#27AE60", // Green
  "#2980B9", // Blue
  "#F39C12", // Amber
  "#C0392B", // Red
  "#16A085", // Teal
] as const;

/**
 * The shared role options, offered as one-tap chips wherever a family
 * member's role is entered. Same list as the web role-chips component.
 */
export const ROLE_CHIPS = [
  "Partner:in",
  "Kind",
  "Tochter",
  "Sohn",
  "Mutter",
  "Vater",
  "Oma",
  "Opa",
  "Bruder",
  "Schwester",
] as const;

/** Default collections seeded when onboarding completes (same as web). */
export const DEFAULT_COLLECTIONS: readonly {
  name: string;
  icon: string;
  color: string;
}[] = [
  { name: "Rechnungen", icon: "receipt", color: "petrol" },
  { name: "Schule", icon: "graduation-cap", color: "apricot" },
  { name: "Verträge", icon: "shield", color: "blue-soft" },
  { name: "Gesundheit", icon: "heart", color: "destructive" },
  { name: "Unterlagen", icon: "file-text", color: "mist" },
];

/** Normalized member input — empty strings become null for the DB. */
export type NormalizedMemberInput = {
  name: string;
  role: string | null;
  birthdate: string | null;
  avatar_color: string | null;
};

/** Friendly German error used for unexpected failures (same as web). */
export const FRIENDLY_ERROR =
  "Etwas ist schiefgelaufen. Bitte versuche es erneut.";

export function validateFamilyName(
  name: string,
):
  | { success: true; data: { name: string } }
  | { success: false; error: string } {
  const trimmed = name.trim();
  if (trimmed.length < 1) {
    return { success: false, error: "Bitte gib einen Familiennamen ein" };
  }
  if (trimmed.length > 100) {
    return {
      success: false,
      error: "Der Familienname ist zu lang (maximal 100 Zeichen)",
    };
  }
  return { success: true, data: { name: trimmed } };
}

export function validateMember(input: {
  name: string;
  role?: string;
  birthdate?: string;
  avatar_color?: string;
}):
  | { success: true; data: NormalizedMemberInput }
  | { success: false; error: string } {
  const name = input.name.trim();
  if (name.length < 1) {
    return { success: false, error: "Bitte einen Namen eingeben" };
  }
  if (name.length > 100) {
    return {
      success: false,
      error: "Der Name ist zu lang (maximal 100 Zeichen)",
    };
  }

  const role = (input.role ?? "").trim();
  if (role.length > 50) {
    return {
      success: false,
      error: "Die Rolle ist zu lang (maximal 50 Zeichen)",
    };
  }

  const birthdate = (input.birthdate ?? "").trim();
  if (birthdate !== "") {
    const valid =
      /^\d{4}-\d{2}-\d{2}$/.test(birthdate) &&
      !Number.isNaN(new Date(birthdate).getTime()) &&
      new Date(birthdate).getFullYear() > 1900;
    if (!valid) {
      return {
        success: false,
        error: "Bitte ein gültiges Geburtsdatum eingeben",
      };
    }
  }

  const avatarColor = (input.avatar_color ?? "").trim();

  return {
    success: true,
    data: {
      name,
      role: role !== "" ? role : null,
      birthdate: birthdate !== "" ? birthdate : null,
      avatar_color: avatarColor !== "" ? avatarColor : null,
    },
  };
}
