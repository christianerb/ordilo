import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { buildFamilyCalendar, type IcsEvent } from "@/lib/ics";

/**
 * GET /api/calendar/ics?token=<feed token> — the family's calendar as an
 * iCalendar subscription feed for Google/Apple/Outlook.
 *
 * The token is a per-family capability created on demand from the Planer
 * tab (table `calendar_feed_tokens`). Calendar apps poll without any user
 * session, so the lookup runs with the service role; the token itself is
 * the authentication. Deleting the token row rotates access.
 */
export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  // Tokens are two hex-encoded UUIDs (64 chars); reject junk before
  // touching the database.
  if (!/^[0-9a-f]{32,128}$/i.test(token)) {
    return new Response("Not found", { status: 404 });
  }

  const supabase = createAdminClient();
  const { data: tokenRow } = await supabase
    .from("calendar_feed_tokens")
    .select("family_id")
    .eq("token", token)
    .maybeSingle();
  if (!tokenRow) {
    return new Response("Not found", { status: 404 });
  }

  const [familyResult, eventResult] = await Promise.all([
    supabase
      .from("families")
      .select("name")
      .eq("id", tokenRow.family_id)
      .maybeSingle(),
    supabase
      .from("calendar_events")
      .select(
        "id, title, note, starts_on, ends_on, all_day, starts_time, ends_time, recurrence, recurrence_until, recurrence_exceptions, location, created_at",
      )
      .eq("family_id", tokenRow.family_id)
      .order("starts_on", { ascending: true }),
  ]);

  if (eventResult.error) {
    return new Response("Feed unavailable", { status: 500 });
  }

  const events: IcsEvent[] = (eventResult.data ?? []).map((event) => ({
    ...event,
    recurrence: event.recurrence as IcsEvent["recurrence"],
    recurrence_exceptions: event.recurrence_exceptions ?? [],
  }));

  const familyName = familyResult.data?.name;
  const ics = buildFamilyCalendar(events, {
    calendarName: familyName ? `${familyName} – Ordilo` : undefined,
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="ordilo-familienkalender.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
