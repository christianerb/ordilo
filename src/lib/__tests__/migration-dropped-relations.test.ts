import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for migrations that read a relation a previous migration
 * dropped.
 *
 * PL/pgSQL resolves table names when a function RUNS, not when it is created.
 * A `create or replace function` body that reads a dropped table therefore
 * applies without a murmur and then raises 42P01 on every call — the failure
 * surfaces in production, never in the migration job.
 *
 * That is exactly how 0054 shipped broken: it read `family_inventory_items`,
 * which 0053 had folded into `documents` and dropped one day earlier, so the
 * whole family-merge invite flow raised on every attempt.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/**
 * Relations a migration dropped, with the version that repaired the last
 * migration still reading them.
 *
 * Applied migrations are frozen history — 0054 keeps its broken body forever
 * and 0055 replaces the function definitions it left behind. So the check runs
 * from the repair onwards: the live definition and every migration after it
 * must stay clear of the dropped relation.
 */
const DROPPED_RELATIONS: Record<string, { droppedIn: string; repairedIn: string }> = {
  family_inventory_items: { droppedIn: "0053", repairedIn: "0055" },
};

function readMigrations(): { name: string; version: string; content: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      version: name.slice(0, 4),
      content: readFileSync(join(MIGRATIONS_DIR, name), "utf-8"),
    }));
}

describe("migrations do not read dropped relations", () => {
  const migrations = readMigrations();

  it("finds the migration files", () => {
    expect(migrations.length).toBeGreaterThan(0);
  });

  for (const [relation, { droppedIn, repairedIn }] of Object.entries(DROPPED_RELATIONS)) {
    it(`no migration from ${repairedIn} onwards references public.${relation}`, () => {
      const offenders = migrations
        .filter((migration) => migration.version >= repairedIn)
        .filter((migration) =>
          // Comments explaining the removal are fine; a SQL reference is not.
          migration.content
            .split("\n")
            .filter((line) => !line.trimStart().startsWith("--"))
            .some((line) => line.includes(relation)),
        )
        .map((migration) => migration.name);

      expect(
        offenders,
        `public.${relation} was dropped in ${droppedIn}; these migrations still read it`,
      ).toEqual([]);
    });

    it(`${repairedIn} exists to replace what ${droppedIn} invalidated`, () => {
      expect(
        migrations.map((migration) => migration.version),
      ).toContain(repairedIn);
    });
  }
});

describe("family invite merge fingerprint", () => {
  const migrations = readMigrations();

  /**
   * The preview and the merge must derive the SAME fingerprint or every merge
   * bails out with "preview_changed". Keeping the formula in one shared
   * function is what stops the two copies drifting apart.
   */
  it("is computed by a single shared snapshot function", () => {
    const latest = migrations
      .filter((migration) =>
        migration.content.includes("create or replace function public.get_family_invite_merge_preview"),
      )
      .at(-1);

    expect(latest).toBeDefined();
    expect(latest!.content).toContain(
      "create or replace function public.family_invite_merge_snapshot",
    );
    // Both RPCs read the snapshot instead of spelling out their own md5().
    const md5Calls = latest!.content.match(/md5\(/g) ?? [];
    expect(md5Calls).toHaveLength(1);
    expect(latest!.content).toContain(
      "public.family_invite_merge_snapshot(v_source.id, v_target_family_id)",
    );
    expect(latest!.content).toContain(
      "public.family_invite_merge_snapshot(v_source.id, v_invite.family_id)",
    );
  });

  it("keeps the shared snapshot helper off the public API surface", () => {
    const latest = migrations
      .filter((migration) =>
        migration.content.includes("create or replace function public.family_invite_merge_snapshot"),
      )
      .at(-1);

    expect(latest!.content).toContain(
      "revoke all on function public.family_invite_merge_snapshot(uuid, uuid) from public",
    );
    expect(latest!.content).not.toMatch(
      /grant execute on function public\.family_invite_merge_snapshot/,
    );
  });
});
