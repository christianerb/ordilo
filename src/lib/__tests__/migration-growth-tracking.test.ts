import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("growth tracking migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/0097_growth_tracking_events.sql"),
    "utf8",
  );
  const previous = readFileSync(
    resolve(process.cwd(), "supabase/migrations/0089_live_conversation_ended_event.sql"),
    "utf8",
  );

  it("preserves every existing event while adding the growth events", () => {
    const previousEvents =
      previous.split("event_name in (")[1].match(/'[a-z_]+'/g) ?? [];
    for (const event of previousEvents) expect(migration).toContain(event);
    for (const event of ["'invite_created'", "'invite_accepted'", "'app_opened'"]) {
      expect(migration).toContain(event);
    }
  });

  it("can be reapplied", () => {
    expect(migration).toContain("drop constraint if exists");
    expect(migration.match(/drop trigger if exists/g)).toHaveLength(3);
    expect(migration.match(/create (or replace )?function/g)).toHaveLength(9);
    // Functions whose return type changed are dropped first so reapplying works.
    expect(migration).toContain("drop function if exists public.record_app_open(uuid, text);");
    expect(migration).toContain(
      "drop function if exists public.admin_growth_event_days(timestamptz, text[]);",
    );
    expect(migration).toContain("create unique index if not exists product_events_app_opened_daily_idx");
  });

  it("never lets analytics block an invite", () => {
    expect(migration.match(/exception when others then/g)).toHaveLength(3);
  });

  it("only attributes invite events to the signed-in person", () => {
    expect(migration).toContain("and (auth.uid() is null or auth.uid() = new.created_by) then");
    expect(migration).toContain("and (auth.uid() is null or auth.uid() = new.user_id) then");
  });

  it("does not count the family creator's own membership as an accepted invite", () => {
    expect(migration).toContain("if new.role <> 'owner'\n     and (auth.uid() is null or auth.uid() = new.user_id) then");
  });

  it("runs every definer function with a fixed search path and tight grants", () => {
    expect(migration.match(/security definer\s+set search_path = public/g)).toHaveLength(4);
    // Admin readers run as the service role, which bypasses (forced) RLS.
    expect(migration.match(/security invoker\s+set search_path = public/g)).toHaveLength(3);
    expect(migration).toMatch(/revoke execute on function public\.record_invite_created_event\(\)/);
    expect(migration).toMatch(/revoke execute on function public\.record_invite_accepted_event\(\)/);
    expect(migration).toContain(
      "revoke execute on function public.admin_forwarding_family_count() from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function public.admin_forwarding_family_count() to service_role;",
    );
    expect(migration).toContain("grant execute on function public.record_app_open(uuid, text) to authenticated;");
  });

  it("keeps app_opened to one row per user and German calendar day", () => {
    expect(migration).toMatch(
      /\(occurred_at at time zone 'Europe\/Berlin'\)::date\)\s+\)\s+where event_name = 'app_opened'/,
    );
    expect(migration).toContain("on conflict do nothing");
    // The caller can only attach a family they belong to.
    expect(migration).toContain("public.user_belongs_to_family(p_family_id)");
  });

  it("stops clients from inserting the database-written events", () => {
    expect(migration).toContain('drop policy if exists "product_events_insert_own"');
    expect(migration).toContain(
      "and event_name not in ('invite_created', 'invite_accepted', 'app_opened')",
    );
    // The 0047 rules stay in place.
    expect(migration).toContain("auth.uid() = user_id");
    expect(migration).toContain("or public.user_belongs_to_family(family_id)");
  });

  it("aggregates growth events per user, event and Berlin day for the service role only", () => {
    expect(migration).toContain(
      "group by e.user_id, e.event_name, (e.occurred_at at time zone 'Europe/Berlin')::date",
    );
    expect(migration).toContain(
      "revoke execute on function public.admin_growth_event_days(timestamptz, text[]) from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function public.admin_growth_event_days(timestamptz, text[]) to service_role;",
    );
  });

  it("does not count reopening an unfinished setup as an app open", () => {
    expect(migration).toContain("returns text");
    expect(migration).toContain("return to_char((now() at time zone 'Europe/Berlin')::date, 'YYYY-MM-DD');");
    expect(migration).toContain("and (f.onboarding_completed_at is not null or m.role <> 'owner')");
  });

  it("tags invite events with the platform from the request header", () => {
    expect(migration).toContain("->> 'x-ordilo-platform'");
    expect(
      migration.match(/'platform', public\.request_product_platform\(\)/g),
    ).toHaveLength(2);
  });

  it("lets only the service role read when app opens were first recorded", () => {
    // Stored once, so deleted rows cannot move the start forward.
    expect(migration).toContain("create table if not exists public.analytics_markers");
    expect(migration).toContain("alter table public.analytics_markers enable row level security;");
    expect(migration).toContain("select at from public.analytics_markers where key = 'app_opened_since';");
    expect(migration).toContain(
      "grant execute on function public.admin_app_opens_tracked_since() to service_role;",
    );
  });

  it("locks the helper functions down like every other function", () => {
    expect(migration).toContain(
      "revoke execute on function public.request_product_platform() from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "revoke execute on function public.clean_signup_attribution(jsonb) from public, anon, authenticated;",
    );
  });

  it("returns the growth aggregate as a single JSON array", () => {
    expect(migration).toContain("coalesce(jsonb_agg(day_rows), '[]'::jsonb)");
  });

  it("removes duplicate app_opened rows before building the unique index", () => {
    const dedupe = migration.indexOf("delete from public.product_events e");
    const index = migration.indexOf("create unique index if not exists product_events_app_opened_daily_idx");
    expect(dedupe).toBeGreaterThan(-1);
    expect(dedupe).toBeLessThan(index);
    expect(migration).toContain("and (earlier.occurred_at, earlier.id) < (e.occurred_at, e.id);");
  });

  it("cleans the attribution inside the exception-guarded block", () => {
    expect(migration).toContain(
      "  v_attribution := public.clean_signup_attribution(new.raw_user_meta_data -> 'signup_attribution');",
    );
    expect(migration).not.toContain("v_attribution jsonb := ");
  });

  it("copies the first touch at account creation into a table users cannot change", () => {
    expect(migration).toContain("create table if not exists public.signup_attributions");
    expect(migration).toContain("alter table public.signup_attributions enable row level security;");
    expect(migration).toContain(
      "after insert or update of raw_user_meta_data, email_confirmed_at on auth.users",
    );
    // Follows the metadata until confirmation, then frozen.
    expect(migration).toContain("set attribution = excluded.attribution, updated_at = now();");
    expect(migration).not.toMatch(/create policy[^;]*signup_attributions/);
    // Existing accounts are backfilled once.
    expect(migration).toContain(
      "where public.clean_signup_attribution(raw_user_meta_data -> 'signup_attribution') <> '{}'::jsonb",
    );
    // Untrusted client JSON is reduced to known keys without personal data.
    expect(migration).toContain("and value not like '%@%'");
    expect(migration).toContain("and value !~* '%40'");
    expect(migration).toContain("and length(value) between 1 and 200");
  });
});

