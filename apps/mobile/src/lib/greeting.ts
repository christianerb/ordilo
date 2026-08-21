/**
 * Time-of-day German greetings for the Home screen.
 *
 * Ported from src/components/ordilo/app-shell-shared.ts (web) — the
 * boundaries must stay identical on both platforms. Move to a shared
 * package when the first non-trivial module is extracted.
 */

export type TimeOfDay = "morning" | "day" | "evening" | "night";

export function getTimeOfDay(date: Date): TimeOfDay {
  const hour = date.getHours();
  if (hour >= 5 && hour < 10) return "morning";
  if (hour >= 10 && hour < 17) return "day";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

export function getGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return "Guten Morgen";
  if (hour >= 11 && hour < 18) return "Guten Tag";
  if (hour >= 18 && hour < 22) return "Guten Abend";
  return "Gute Nacht";
}
