import { describe, it, expectTypeOf } from "vitest";
import type { Database } from "../../../types/database";

/**
 * Type-level tests for the generated Supabase database types.
 * These verify that the migration produced the expected schema surface:
 * all 9 tables, the error_message column, the embedding vector column,
 * and the user_belongs_to_family helper function.
 */
describe("database schema types", () => {
  type PublicTables = keyof Database["public"]["Tables"];

  it("includes all 9 required tables", () => {
    const required: PublicTables[] = [
      "families",
      "family_members",
      "documents",
      "document_pages",
      "extracted_entities",
      "tasks",
      "knowledge_nodes",
      "knowledge_edges",
      "document_embeddings",
    ];

    // expectTypeOf doesn't have a clean "includes all" assertion, so we
    // verify each table name resolves to a valid Row type instead.
    for (const table of required) {
      const row = {} as Database["public"]["Tables"][typeof table]["Row"];
      expectTypeOf(row).toBeObject();
    }
  });

  it("documents table has error_message column", () => {
    type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
    expectTypeOf<DocumentRow>()
      .toHaveProperty("error_message")
      .toEqualTypeOf<string | null>();
  });

  it("documents table has status column for the state machine", () => {
    type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
    expectTypeOf<DocumentRow>()
      .toHaveProperty("status")
      .toEqualTypeOf<string>();
  });

  it("document_embeddings has an embedding column", () => {
    type EmbeddingRow = Database["public"]["Tables"]["document_embeddings"]["Row"];
    expectTypeOf<EmbeddingRow>().toHaveProperty("embedding");
  });

  it("documents table has file_url column", () => {
    type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
    expectTypeOf<DocumentRow>()
      .toHaveProperty("file_url")
      .toEqualTypeOf<string>();
  });

  it("exposes the user_belongs_to_family helper function", () => {
    type Fn = Database["public"]["Functions"]["user_belongs_to_family"];
    expectTypeOf<Fn["Args"]["fam_id"]>().toEqualTypeOf<string>();
    expectTypeOf<Fn["Returns"]>().toEqualTypeOf<boolean>();
  });
});
