import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("growth tracking migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/0094_growth_tracking_events.sql"),
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
    expect(migration.match(/drop trigger if exists/g)).toHaveLength(2);
    expect(migration.match(/create or replace function/g)).toHaveLength(2);
  });

  it("never lets analytics block an invite", () => {
    expect(migration.match(/exception when others then/g)).toHaveLength(2);
  });

  it("does not count the family creator's own membership as an accepted invite", () => {
    expect(migration).toContain("if new.role <> 'owner' then");
  });

  it("runs the trigger functions with a fixed search path and no direct execute grant", () => {
    expect(migration.match(/security definer\s+set search_path = public/g)).toHaveLength(2);
    expect(migration).toMatch(/revoke execute on function public\.record_invite_created_event\(\)/);
    expect(migration).toMatch(/revoke execute on function public\.record_invite_accepted_event\(\)/);
  });
});
