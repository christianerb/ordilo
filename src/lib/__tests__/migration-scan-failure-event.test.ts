import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("scan-failure event migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/0088_document_upload_failed_event.sql"),
    "utf8",
  );
  const previous = readFileSync(
    resolve(process.cwd(), "supabase/migrations/0075_first_value_events.sql"),
    "utf8",
  );

  it("preserves every existing event while adding the scan-failure event", () => {
    const previousEvents =
      previous.split("event_name in (")[1].match(/'[a-z_]+'/g) ?? [];
    for (const event of previousEvents) expect(migration).toContain(event);
    expect(migration).toContain("'document_upload_failed'");
  });

  it("can be reapplied and does not change data or access policies", () => {
    expect(migration).toContain("drop constraint if exists");
    expect(migration).not.toMatch(/\b(delete|truncate|insert|update|policy)\b/i);
  });
});
