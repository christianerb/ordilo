import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0072_append_manual_note.sql"),
  "utf8",
);

describe("0072_append_manual_note migration", () => {
  it("updates only a confirmed manual note in the selected family", () => {
    expect(migration).toContain("family_id = p_family_id");
    expect(migration).toContain("v_note.source <> 'manual'");
    expect(migration).toContain("v_note.status <> 'confirmed'");
  });

  it("keeps credentials out of plain-text chat updates", () => {
    expect(migration).toContain("v_note.document_type = 'credentials'");
  });

  it("updates the document and first page together without duplicating a complete block", () => {
    expect(migration).toMatch(
      /position\(\s*E'\\n\\n' \|\| v_addition \|\| E'\\n\\n'\s+in E'\\n\\n' \|\| v_content \|\| E'\\n\\n'\s*\) > 0/,
    );
    expect(migration).not.toContain("position(v_addition in v_content)");
    expect(migration).toContain("set ocr_text = v_content");
    expect(migration).toContain("set ocr_markdown = v_content");
  });

  it("limits the complete note to the editor's 10000 character cap", () => {
    expect(migration).toContain("char_length(v_content) > 10000");
  });
});
