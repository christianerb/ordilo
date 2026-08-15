import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for RLS policies whose EXISTS subquery references an
 * outer column WITHOUT qualifying it.
 *
 * Inside a subquery, an unqualified column name resolves against the
 * INNERMOST scope first. When the inner table happens to have a column of
 * the same name, the correlation silently binds to the wrong table and the
 * policy compares a row with itself.
 *
 * That is how 0024 shipped a families SELECT policy whose membership arm
 * read `m.family_id = id` — `id` bound to family_memberships.id, so the arm
 * matched nothing, ever. Creators passed through the created_by arm, which
 * hid the bug until the first real invited member existed: they could see
 * their membership but not the family, and were routed into onboarding to
 * found a family they had just joined. Fixed in 0057.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/** Migrations that are frozen history — their known offense is repaired later. */
const HISTORICAL_OFFENDERS = ["0024_family_memberships.sql"];

function readMigrations(): { name: string; content: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      content: readFileSync(join(MIGRATIONS_DIR, name), "utf-8"),
    }));
}

/** All `create policy … ;` statements in a migration file. */
function policyStatements(content: string): string[] {
  return content.match(/create policy[\s\S]*?;/gi) ?? [];
}

/**
 * True when an EXISTS body inside the policy references a bare `id` token.
 * `x.id`, `_id`-suffixed columns and identifiers containing `id` do not
 * count — only the unqualified column name that caused the 0024 bug.
 */
function hasUnqualifiedIdInExists(policy: string): boolean {
  const existsBodies = policy.match(/exists\s*\(([\s\S]*?)\)\s*(?:\)|;|or\s|and\s)/gi) ?? [];
  return existsBodies.some((body) => /(?<![\w.])id(?![\w])/.test(body));
}

describe("RLS policy correlation scoping", () => {
  const migrations = readMigrations();

  it("no policy after 0024 correlates on an unqualified `id`", () => {
    const offenders = migrations
      .filter((m) => !HISTORICAL_OFFENDERS.includes(m.name))
      .flatMap((m) =>
        policyStatements(m.content)
          .filter(hasUnqualifiedIdInExists)
          .map(() => m.name),
      );

    expect(
      offenders,
      "an unqualified `id` inside an EXISTS subquery binds to the INNER table"
      + " — qualify it (outer_table.id) or pass it through a helper function",
    ).toEqual([]);
  });

  it("the repair exists and routes families visibility through the shared helper", () => {
    const repair = migrations.find(
      (m) => m.name === "0057_families_membership_visibility.sql",
    );

    expect(repair).toBeDefined();
    expect(repair!.content).toContain(
      'drop policy if exists "families_member_select" on public.families',
    );
    expect(repair!.content).toContain("public.user_belongs_to_family(id)");
  });

  it("no later migration reintroduces a families select policy with the bug", () => {
    const later = migrations.filter(
      (m) => m.name > "0057_families_membership_visibility.sql",
    );

    for (const m of later) {
      for (const policy of policyStatements(m.content)) {
        if (!/on\s+public\.families\b/i.test(policy)) continue;
        expect(
          hasUnqualifiedIdInExists(policy),
          `${m.name} recreates a families policy with an unqualified id correlation`,
        ).toBe(false);
      }
    }
  });
});
