import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migration = readFileSync(
  join(migrationsDir, "0093_chat_messages_update_policy.sql"),
  "utf8",
);

describe("chat message update policy migration", () => {
  it("has a unique migration version", () => {
    const versions = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => name.slice(0, 4));

    expect(versions.filter((version) => version === "0093")).toHaveLength(1);
  });

  it("recreates the family-scoped update policy idempotently", () => {
    expect(migration).toMatch(
      /drop policy if exists "chat_messages_update" on public\.chat_messages/i,
    );
    expect(migration).toMatch(
      /create policy "chat_messages_update" on public\.chat_messages/i,
    );
  });

  it("guards both halves of a repair write with the same family check", () => {
    const checks = migration.match(/public\.user_belongs_to_family\(family_id\)/g);
    expect(checks).toHaveLength(4);
    expect(migration).toContain("chat_conversations_update");
  });
});
