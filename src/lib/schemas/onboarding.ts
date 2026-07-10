import { z } from "zod";

/**
 * Zod schemas for the conversational onboarding flow.
 *
 * German validation messages are used so they can be surfaced directly in
 * the UI without an extra mapping layer.
 */

/**
 * Preset avatar colors offered during onboarding.
 * Warm, distinct colors that work well for person avatars.
 */
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
 * Schema for the family name step.
 * The family name is required — an empty/whitespace-only value is rejected.
 */
export const familyNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Bitte gib einen Familiennamen ein")
    .max(100, "Der Familienname ist zu lang (maximal 100 Zeichen)"),
});

export type FamilyNameInput = z.infer<typeof familyNameSchema>;

/**
 * Schema for adding a family member during onboarding.
 * Only the name is required; role, birthdate, and avatar_color are optional.
 */
export const memberSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Bitte einen Namen eingeben")
    .max(100, "Der Name ist zu lang (maximal 100 Zeichen)"),
  role: z
    .string()
    .trim()
    .max(50, "Die Rolle ist zu lang (maximal 50 Zeichen)")
    .optional()
    .or(z.literal("")),
  birthdate: z
    .string()
    .trim()
    .refine(
      (val) => val === "" || /^\d{4}-\d{2}-\d{2}$/.test(val),
      "Bitte ein gültiges Geburtsdatum eingeben",
    )
    .refine((val) => {
      if (val === "") return true;
      const date = new Date(val);
      return !isNaN(date.getTime()) && date.getFullYear() > 1900;
    }, "Bitte ein gültiges Geburtsdatum eingeben")
    .optional()
    .or(z.literal("")),
  avatar_color: z
    .string()
    .optional()
    .or(z.literal("")),
  related_member_id: z
    .string()
    .trim()
    .uuid("Ungültige Auswahl")
    .optional()
    .or(z.literal("")),
  relationship_label: z
    .string()
    .trim()
    .max(50, "Die Beziehung ist zu lang (maximal 50 Zeichen)")
    .optional()
    .or(z.literal("")),
});

export type MemberInput = z.infer<typeof memberSchema>;

/**
 * Normalized member input after validation — empty strings become null
 * for the optional fields so they can be persisted as NULL in the database.
 */
export type NormalizedMemberInput = {
  name: string;
  role: string | null;
  birthdate: string | null;
  avatar_color: string | null;
  related_member_id: string | null;
  relationship_label: string | null;
};

/**
 * Validate a family name string.
 *
 * Returns `{ success: true, data }` when valid, or
 * `{ success: false, error }` with a German error message when invalid.
 */
export function validateFamilyName(
  name: string,
): { success: true; data: { name: string } } | { success: false; error: string } {
  const parsed = familyNameSchema.safeParse({ name: name.trim() });
  if (parsed.success) {
    return { success: true, data: parsed.data };
  }
  const message = parsed.error.issues[0]?.message ?? "Bitte gib einen Familiennamen ein";
  return { success: false, error: message };
}

/**
 * Validate a member input object.
 *
 * Returns `{ success: true, data }` with normalized values (empty strings
 * converted to null for optional fields) when valid, or
 * `{ success: false, error }` with a German error message when invalid.
 */
export function validateMember(
  input: MemberInput,
):
  | { success: true; data: NormalizedMemberInput }
  | { success: false; error: string } {
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Bitte einen Namen eingeben";
    return { success: false, error: message };
  }

  const data = parsed.data;
  return {
    success: true,
    data: {
      name: data.name,
      role: data.role && data.role.trim() !== "" ? data.role.trim() : null,
      birthdate:
        data.birthdate && data.birthdate.trim() !== ""
          ? data.birthdate.trim()
          : null,
      avatar_color:
        data.avatar_color && data.avatar_color.trim() !== ""
          ? data.avatar_color.trim()
          : null,
      related_member_id:
        data.related_member_id && data.related_member_id.trim() !== ""
          ? data.related_member_id.trim()
          : null,
      relationship_label:
        data.relationship_label && data.relationship_label.trim() !== ""
          ? data.relationship_label.trim()
          : null,
    },
  };
}
