import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("first-value migration", () => {
  const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/0075_first_value_events.sql"), "utf8");
  const previous = readFileSync(resolve(process.cwd(), "supabase/migrations/0073_chat_answer_metadata.sql"), "utf8");

  it("preserves every existing event while adding the three honest funnel events", () => {
    const previousEvents = previous.split("event_name in (")[1].match(/'[a-z_]+'/g) ?? [];
    for (const event of previousEvents) expect(migration).toContain(event);
    for (const event of ["onboarding_entry_selected", "document_result_viewed", "document_next_step_selected"]) {
      expect(migration).toContain(`'${event}'`);
    }
  });
  it("can be reapplied and does not change data or access policies", () => {
    expect(migration).toContain("drop constraint if exists");
    expect(migration).not.toMatch(/\b(delete|truncate|insert|update|policy)\b/i);
  });
});
