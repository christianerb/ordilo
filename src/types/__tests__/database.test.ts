import { describe, it, expectTypeOf } from "vitest";
import type { Database } from "../../../types/database";

/**
 * Type-level tests for the generated Supabase database types.
 * These verify that the migration produced the expected schema surface:
 * all 9 tables, the error_message column, the embedding vector column,
 * and the user_belongs_to_family helper function.
 */
describe("database schema types", () => {
  it("includes all 9 required tables", () => {
    // expectTypeOf doesn't have a clean "includes all" assertion, so we
    // verify each table name resolves to a valid Row type individually.
    expectTypeOf<Database["public"]["Tables"]["families"]["Row"]>().toBeObject();
    expectTypeOf<Database["public"]["Tables"]["family_members"]["Row"]>().toBeObject();
    expectTypeOf<Database["public"]["Tables"]["documents"]["Row"]>().toBeObject();
    expectTypeOf<Database["public"]["Tables"]["document_pages"]["Row"]>().toBeObject();
    expectTypeOf<Database["public"]["Tables"]["extracted_entities"]["Row"]>().toBeObject();
    expectTypeOf<Database["public"]["Tables"]["tasks"]["Row"]>().toBeObject();
    expectTypeOf<Database["public"]["Tables"]["knowledge_nodes"]["Row"]>().toBeObject();
    expectTypeOf<Database["public"]["Tables"]["knowledge_edges"]["Row"]>().toBeObject();
    expectTypeOf<Database["public"]["Tables"]["document_embeddings"]["Row"]>().toBeObject();
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
