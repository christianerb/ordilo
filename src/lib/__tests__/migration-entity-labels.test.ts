import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression guard for `extracted_entities.label`.
 *
 * The label ("Bereits gezahlt", "Zahlungsfrist") is what makes a stored
 * amount or date meaningful. It was missing for a long time, so every
 * confirmed amount read back as a generic "Betrag" and the display-level
 * dedupe collapsed a total and an already-paid part into one row.
 *
 * The way it got lost is the reason for this test: `confirm_document` is
 * rewritten wholesale by each migration that touches it (0005 → 0017 →
 * 0028 → 0035 → …), and a rewrite that forgets one column in the
 * extracted_entities INSERT silently drops the data again — no type error,
 * no failing query. So we assert against the LAST definition of the
 * function, whichever migration that lives in.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function readMigrationFiles(): { name: string; content: string }[] {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      content: readFileSync(join(MIGRATIONS_DIR, name), "utf-8"),
    }));
}

describe("extracted_entities.label", () => {
  const migrations = readMigrationFiles();

  it("has migrations to inspect", () => {
    expect(migrations.length).toBeGreaterThan(0);
  });

  it("is added by a migration", () => {
    const adding = migrations.filter((m) =>
      /alter\s+table\s+public\.extracted_entities[\s\S]{0,120}?add\s+column[\s\S]{0,60}?label/i.test(
        m.content,
      ),
    );
    expect(
      adding.length,
      "no migration adds extracted_entities.label",
    ).toBeGreaterThan(0);
  });

  it("is written by the newest confirm_document definition", () => {
    const defining = migrations.filter((m) =>
      /create\s+or\s+replace\s+function\s+public\.confirm_document/i.test(
        m.content,
      ),
    );
    expect(defining.length).toBeGreaterThan(0);

    // Only the last definition is live in the database.
    const latest = defining[defining.length - 1];
    const insert = latest.content.match(
      /insert\s+into\s+public\.extracted_entities\s*\(([\s\S]*?)\)/i,
    );
    expect(
      insert,
      `${latest.name} defines confirm_document but never inserts extracted_entities`,
    ).not.toBeNull();
    expect(
      insert![1],
      `${latest.name} rewrote confirm_document without the label column — ` +
        "amount and date meanings would be silently dropped on confirm",
    ).toMatch(/\blabel\b/);
  });
});
