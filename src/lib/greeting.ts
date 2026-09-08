/**
 * Time-of-day German greeting shared by the app shell and server-rendered
 * pages. Lives outside any "use client" module so server components can
 * call it — client modules only hand out references, which throw during
 * server rendering.
 *
 * Server components render in the host's timezone (UTC on Vercel), so
 * callers there pass the family's timezone explicitly.
 */
export function getGreeting(date: Date, timeZone?: string): string {
  const hour = timeZone
    ? Number(
        new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          hourCycle: "h23",
          timeZone,
        }).format(date),
      )
    : date.getHours();
  if (hour >= 5 && hour < 11) return "Guten Morgen";
  if (hour >= 11 && hour < 18) return "Guten Tag";
  if (hour >= 18 && hour < 22) return "Guten Abend";
  return "Gute Nacht";
}
