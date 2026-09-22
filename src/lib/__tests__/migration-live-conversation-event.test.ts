import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("live-conversation event migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/0089_live_conversation_ended_event.sql"),
    "utf8",
  );
  const previous = readFileSync(
    resolve(process.cwd(), "supabase/migrations/0088_document_upload_failed_event.sql"),
    "utf8",
  );

  it("preserves every existing event while adding the live-conversation event", () => {
    const previousEvents =
      previous.split("event_name in (")[1].match(/'[a-z_]+'/g) ?? [];
    for (const event of previousEvents) expect(migration).toContain(event);
    expect(migration).toContain("'live_conversation_ended'");
  });

  it("can be reapplied and does not change data or access policies", () => {
    expect(migration).toContain("drop constraint if exists");
    expect(migration).not.toMatch(/\b(delete|truncate|insert|update|policy)\b/i);
  });
});
