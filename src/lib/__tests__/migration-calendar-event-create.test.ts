import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/0070_create_calendar_event_rpc.sql",
  ),
  "utf8",
);

describe("atomic calendar event creation migration", () => {
  it("creates the event and attendees inside one authenticated RPC", () => {
    expect(migration).toContain(
      "create or replace function public.create_calendar_event_with_attendees",
    );
    expect(migration).toContain("insert into public.calendar_events");
    expect(migration).toContain("insert into public.calendar_event_attendees");
    expect(migration).toContain("public.user_belongs_to_family(p_family_id)");
    expect(migration).toContain("p_ends_time <= p_starts_time");
    expect(migration).toContain("family_members.family_id = p_family_id");
    expect(migration).toContain("grant execute on function");
    expect(migration).toContain("to authenticated");
  });
});
