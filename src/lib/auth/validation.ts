import { z } from "zod";

/**
 * Zod schema for login email validation.
 *
 * German validation messages are used so they can be surfaced directly in
 * the UI without an extra mapping layer.
 */
export const loginEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Bitte E-Mail-Adresse eingeben")
    .email("Bitte gültige E-Mail-Adresse eingeben")
    .transform((email) => email.toLowerCase()),
});

export type LoginEmailInput = z.infer<typeof loginEmailSchema>;

/**
 * Validate an email string for the login form.
 *
 * Returns `{ success: true, data }` when valid, or
 * `{ success: false, error }` with a German error message when invalid.
 */
export function validateLoginEmail(email: string):
  | { success: true; data: { email: string } }
  | { success: false; error: string } {
  const parsed = loginEmailSchema.safeParse({ email: email.trim() });
  if (parsed.success) {
    return { success: true, data: parsed.data };
  }
  // Surface the first relevant issue message (German).
  const message = parsed.error.issues[0]?.message ?? "Bitte E-Mail-Adresse eingeben";
  return { success: false, error: message };
}
