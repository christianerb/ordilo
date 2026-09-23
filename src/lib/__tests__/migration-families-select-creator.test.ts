import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Onboarding creates a family with insert … returning. The returned row is
 * checked against the SELECT policy, and a STABLE helper cannot see a row
 * inserted by the same statement — so the policy needs a direct
 * `created_by = auth.uid()` arm or every new family is rejected.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function latestFamiliesSelectPolicy(): { file: string; policy: string } {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  let latest: { file: string; policy: string } | null = null;
  for (const file of files) {
    const content = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    for (const policy of content.match(/create policy[\s\S]*?;/gi) ?? []) {
      if (/on\s+public\.families\s+for\s+select/i.test(policy)) {
        latest = { file, policy };
      }
    }
  }
  if (!latest) throw new Error("no families select policy found");
  return latest;
}

describe("families select policy", () => {
  it("lets the creator read back a family in the inserting statement", () => {
    const { file, policy } = latestFamiliesSelectPolicy();

    expect(file).toBe("0092_families_select_creator_arm.sql");
    expect(policy).toMatch(/created_by\s*=\s*auth\.uid\(\)/);
    expect(policy).toContain("public.user_belongs_to_family(id)");
  });

  it("is idempotent", () => {
    const migration = readFileSync(
      join(MIGRATIONS_DIR, "0092_families_select_creator_arm.sql"),
      "utf-8",
    );

    expect(migration).toContain(
      'drop policy if exists "families_member_select" on public.families;',
    );
  });
});
