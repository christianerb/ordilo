import { z } from "zod";
import {
  FileText,
  Receipt,
  Building2,
  Shield,
  Heart,
  GraduationCap,
  Car,
  Home,
  Briefcase,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Collections ("Sammlungen") — user-defined, persistent document folders
 * shown in the sidebar. See supabase/migrations/0012_collections.sql for
 * the data model rationale.
 */

// ---------------------------------------------------------------------------
// Icon options
// ---------------------------------------------------------------------------

/** A selectable icon in the collection icon picker. */
export interface CollectionIconOption {
  key: string;
  icon: LucideIcon;
  label: string;
}

export const COLLECTION_ICON_OPTIONS: readonly CollectionIconOption[] = [
  { key: "file-text", icon: FileText, label: "Dokument" },
  { key: "receipt", icon: Receipt, label: "Rechnung" },
  { key: "building", icon: Building2, label: "Gebäude" },
  { key: "shield", icon: Shield, label: "Vertrag" },
  { key: "heart", icon: Heart, label: "Gesundheit" },
  { key: "graduation-cap", icon: GraduationCap, label: "Schule" },
  { key: "car", icon: Car, label: "Auto" },
  { key: "home", icon: Home, label: "Zuhause" },
  { key: "briefcase", icon: Briefcase, label: "Arbeit" },
  { key: "wallet", icon: Wallet, label: "Finanzen" },
] as const;

const DEFAULT_ICON_KEY = "file-text";

/**
 * Resolve the Lucide icon component for a stored icon key.
 * Falls back to the default document icon for unknown/legacy keys.
 */
export function getCollectionIcon(iconKey: string | null | undefined): LucideIcon {
  return (
    COLLECTION_ICON_OPTIONS.find((opt) => opt.key === iconKey)?.icon ??
    COLLECTION_ICON_OPTIONS.find((opt) => opt.key === DEFAULT_ICON_KEY)!.icon
  );
}

// ---------------------------------------------------------------------------
// Color options
// ---------------------------------------------------------------------------

/** A selectable color swatch (background tint + icon foreground). */
export interface CollectionColorOption {
  key: string;
  label: string;
  /** CSS background-color value for the icon circle. */
  bg: string;
  /** CSS color value for the icon glyph. */
  fg: string;
}

export const COLLECTION_COLOR_OPTIONS: readonly CollectionColorOption[] = [
  { key: "petrol", label: "Petrol", bg: "rgba(48, 84, 96, 0.1)", fg: "var(--petrol)" },
  { key: "apricot", label: "Apricot", bg: "rgba(228, 96, 24, 0.12)", fg: "var(--apricot)" },
  { key: "destructive", label: "Rot", bg: "rgba(192, 57, 43, 0.1)", fg: "var(--destructive)" },
  { key: "blue-soft", label: "Blau", bg: "var(--blue-soft)", fg: "var(--petrol)" },
  { key: "mist", label: "Grau", bg: "var(--sand-light)", fg: "var(--mist-dark)" },
  { key: "apricot-light", label: "Sand", bg: "rgba(240, 180, 160, 0.3)", fg: "var(--apricot)" },
] as const;

const DEFAULT_COLOR_KEY = "petrol";

/**
 * Resolve the color option for a stored color key.
 * Falls back to petrol for unknown/legacy keys.
 */
export function getCollectionColor(colorKey: string | null | undefined): CollectionColorOption {
  return (
    COLLECTION_COLOR_OPTIONS.find((opt) => opt.key === colorKey) ??
    COLLECTION_COLOR_OPTIONS.find((opt) => opt.key === DEFAULT_COLOR_KEY)!
  );
}

// ---------------------------------------------------------------------------
// Default collections (seeded when onboarding completes)
// ---------------------------------------------------------------------------

export const DEFAULT_COLLECTIONS: ReadonlyArray<{
  name: string;
  icon: string;
  color: string;
}> = [
  { name: "Rechnungen", icon: "receipt", color: "petrol" },
  { name: "Schule", icon: "graduation-cap", color: "apricot" },
  { name: "Verträge", icon: "shield", color: "blue-soft" },
  { name: "Gesundheit", icon: "heart", color: "destructive" },
  { name: "Unterlagen", icon: "file-text", color: "mist" },
];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const collectionNameSchema = z
  .string()
  .trim()
  .min(1, "Bitte gib einen Namen ein")
  .max(50, "Der Name ist zu lang (maximal 50 Zeichen)");

const collectionIconSchema = z
  .string()
  .refine(
    (key) => COLLECTION_ICON_OPTIONS.some((opt) => opt.key === key),
    "Ungültiges Icon",
  );

const collectionColorSchema = z
  .string()
  .refine(
    (key) => COLLECTION_COLOR_OPTIONS.some((opt) => opt.key === key),
    "Ungültige Farbe",
  );

export const collectionInputSchema = z.object({
  name: collectionNameSchema,
  icon: collectionIconSchema,
  color: collectionColorSchema,
});

export type CollectionInput = z.infer<typeof collectionInputSchema>;

/**
 * Validate a collection name/icon/color input.
 *
 * Returns `{ success: true, data }` with the trimmed name when valid, or
 * `{ success: false, error }` with a German error message when invalid.
 */
export function validateCollectionInput(
  input: { name: string; icon: string; color: string },
):
  | { success: true; data: CollectionInput }
  | { success: false; error: string } {
  const parsed = collectionInputSchema.safeParse(input);
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ?? "Bitte gib einen Namen ein";
    return { success: false, error: message };
  }
  return { success: true, data: parsed.data };
}
