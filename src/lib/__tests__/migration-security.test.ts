import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Security regression tests for SQL migration files.
 *
 * These tests guard against re-introducing a PUBLIC-executable helper function
 * over Supabase's shared auth tables (auth.flow_state, auth.users). Such a
 * function would allow any anon/authenticated caller to read another user's
 * PKCE auth_code / code_challenge via PostgREST RPC — a critical data leak.
 *
 * See feature auth-flowstate-helper-security and library/auth-setup.md.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function readMigrationFiles(): { name: string; content: string }[] {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  return files.map((name) => ({
    name,
    content: readFileSync(join(MIGRATIONS_DIR, name), "utf-8"),
  }));
}

describe("migration security: auth.flow_state helper", () => {
  const migrations = readMigrationFiles();

  it("migration files are present and readable", () => {
    expect(migrations.length).toBeGreaterThan(0);
  });

  it("no migration creates or drops the old vulnerable function get_latest_flow_state", () => {
    for (const m of migrations) {
      // Explanatory comments mentioning the old name are fine; what matters
      // is that no migration actually CREATEs or DROPs the function.
      expect(
        m.content,
        `${m.name} must not CREATE the vulnerable get_latest_flow_state function`,
      ).not.toMatch(
        /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+[\w.]*get_latest_flow_state/i,
      );
      expect(
        m.content,
        `${m.name} must not DROP the vulnerable get_latest_flow_state function`,
      ).not.toMatch(/DROP\s+FUNCTION.*get_latest_flow_state/i);
    }
  });

  it("any migration referencing auth.flow_state revokes PUBLIC execute and grants only service_role", () => {
    const flowStateMigrations = migrations.filter((m) =>
      m.content.includes("auth.flow_state"),
    );

    // If no migrations reference auth.flow_state, that's fine (no helper at all).
    if (flowStateMigrations.length === 0) return;

    for (const m of flowStateMigrations) {
      // Must revoke from PUBLIC
      expect(
        m.content,
        `${m.name} must REVOKE EXECUTE FROM PUBLIC`,
      ).toMatch(/REVOKE\s+EXECUTE.*FROM\s+PUBLIC/i);

      // Must grant to service_role
      expect(
        m.content,
        `${m.name} must GRANT EXECUTE TO service_role`,
      ).toMatch(/GRANT\s+EXECUTE.*TO\s+service_role/i);

      // Must NOT grant to anon
      expect(
        m.content,
        `${m.name} must not GRANT EXECUTE TO anon`,
      ).not.toMatch(/GRANT\s+EXECUTE.*TO\s+anon/i);

      // Must NOT grant to authenticated
      expect(
        m.content,
        `${m.name} must not GRANT EXECUTE TO authenticated`,
      ).not.toMatch(/GRANT\s+EXECUTE.*TO\s+authenticated/i);
    }
  });

  it("any function created over auth.flow_state takes a user-scoping parameter (not parameterless)", () => {
    const flowStateMigrations = migrations.filter(
      (m) =>
        m.content.includes("auth.flow_state") &&
        /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i.test(m.content),
    );

    for (const m of flowStateMigrations) {
      // A parameterless function over auth.flow_state is inherently global
      // and insecure — it must accept at least one parameter to scope the query.
      // [\w.]+ handles schema-qualified names like public.get_latest_flow_state
      expect(
        m.content,
        `${m.name} must not create a parameterless function over auth.flow_state`,
      ).not.toMatch(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+[\w.]+\s*\(\s*\)/i,
      );
    }
  });
});
