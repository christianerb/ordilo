import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0053_notes_and_secrets.sql"),
  "utf8",
);

describe("0053_notes_and_secrets migration", () => {
  it("keeps inventory context in migrated note content", () => {
    expect(migration).toContain("E'\\nArt: ' || i.item_type");
    expect(migration).toContain("E'\\nGehört zu: ' || m.name");
    expect(migration).toContain("jsonb_pretty(i.metadata)");
  });

  it("guards the removed inventory relation on reruns", () => {
    expect(migration).toContain("to_regclass('public.family_inventory_items') is not null");
    expect(migration).toContain(
      "execute 'drop policy if exists \"inventory_items_select\" on public.family_inventory_items'",
    );
  });
});

describe("Supabase migration versions", () => {
  it("uses every version only once", () => {
    const versions = readdirSync(resolve(process.cwd(), "supabase/migrations"))
      .filter((filename) => filename.endsWith(".sql"))
      .map((filename) => filename.slice(0, 4));

    expect(new Set(versions).size).toBe(versions.length);
  });
});
