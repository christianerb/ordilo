import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0065_family_contacts.sql"),
  "utf8",
);
const dismissalMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0071_contact_dismissal.sql"),
  "utf8",
);

describe("0065_family_contacts migration", () => {
  it("creates a family-scoped contact table with RLS", () => {
    expect(migration).toContain("create table if not exists public.contacts");
    expect(migration).toContain("alter table public.contacts enable row level security");
    expect(migration).toContain("public.user_belongs_to_family(family_id)");
  });

  it("promotes extracted contacts in the document transaction", () => {
    expect(migration).toContain("create trigger sync_contact_entity_insert");
    expect(migration).toContain(
      "case when new.confirmed then 'confirmed' else 'suggested' end",
    );
  });

  it("removes document-derived contacts when their source entity disappears", () => {
    expect(migration).toContain("if tg_op = 'DELETE' then");
    expect(migration).toContain("source_document_id = old.document_id");
  });

  it("preserves a source contact after the family corrected it", () => {
    expect(migration).toContain("user_edited_at is null");
    expect(migration).toContain("when contacts.user_edited_at is null");
  });

  it("transfers contacts before a merged source family is deleted", () => {
    expect(migration).toContain(
      "create trigger transfer_contacts_on_family_merge",
    );
    expect(migration).toContain("set family_id = new.target_family_id");
    expect(migration).toContain("where family_id = new.source_family_id");
  });
});

describe("0071_contact_dismissal migration", () => {
  it("allows a dismissed tombstone state", () => {
    expect(dismissalMigration).toContain(
      "check (status in ('suggested', 'confirmed', 'dismissed'))",
    );
  });

  it("keeps dismissed contacts dismissed when extraction upserts them again", () => {
    expect(dismissalMigration).toContain(
      "c.source_document_id = new.document_id",
    );
    expect(dismissalMigration).toContain("c.status = 'dismissed'");
    expect(dismissalMigration).toContain(
      "regexp_replace(c.phone, '[^0-9]', '', 'g')",
    );
    expect(dismissalMigration).toContain(
      "when contacts.status = 'dismissed' then 'dismissed'",
    );
    expect(dismissalMigration).toContain("else excluded.status");
  });

  it("leaves user-edited tombstones in place when source entities are deleted", () => {
    expect(dismissalMigration).toContain("user_edited_at is null");
  });
});
