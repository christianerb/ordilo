import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("family activity feed refinement migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/0091_family_activity_refinements.sql"),
    "utf8",
  );

  it("replaces the view idempotently and keeps the security_invoker contract", () => {
    expect(migration).toContain("create or replace view public.family_activity");
    expect(migration).toContain("security_invoker = true");
    expect(migration).toContain("grant select on public.family_activity to authenticated");
  });

  it("drops the redundant completed-task rows", () => {
    expect(migration).not.toContain("task:done");
    expect(migration).not.toContain("completed_at");
  });

  it("shows a friendly title while a document is still being processed", () => {
    expect(migration).toContain("then 'Neues Dokument'");
    expect(migration).toContain("'uploaded', 'ocr_processing', 'ocr_done', 'analyzing'");
  });

  it("exposes the document a task was read from so rows open their subject", () => {
    expect(migration).toContain("t.document_id");
    // The new column is appended, which CREATE OR REPLACE VIEW allows.
    expect(migration).toContain("document_id uuid        -- the document the row is about");
  });
});
