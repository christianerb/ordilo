/**
 * Login email validation for the native app.
 *
 * Mirrors src/lib/auth/validation.ts (web, zod-based) including the German
 * messages. Ported without zod until a shared contracts package exists.
 */
export function validateLoginEmail(
  email: string,
):
  | { success: true; data: { email: string } }
  | { success: false; error: string } {
  const trimmed = email.trim();
  if (trimmed.length === 0) {
    return { success: false, error: "Bitte E-Mail-Adresse eingeben" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { success: false, error: "Bitte gültige E-Mail-Adresse eingeben" };
  }
  return { success: true, data: { email: trimmed.toLowerCase() } };
}
