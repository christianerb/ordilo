import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migration = readFileSync(
  join(migrationsDir, "0073_chat_answer_metadata.sql"),
  "utf8",
);

describe("chat answer metadata migration", () => {
  it("has a unique migration version", () => {
    const versions = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => name.slice(0, 4));

    expect(versions.filter((version) => version === "0073")).toHaveLength(1);
  });

  it("adds reload metadata idempotently and allows repair analytics", () => {
    expect(migration).toMatch(/add column if not exists response_state/i);
    expect(migration).toMatch(/add column if not exists suggestion/i);
    expect(migration).toContain("'chat_answer_repair_started'");
    expect(migration).toMatch(/drop constraint if exists/i);
  });
});
