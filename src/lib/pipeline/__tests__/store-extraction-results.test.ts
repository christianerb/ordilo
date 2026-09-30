import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { DocumentAnalysis } from "@/lib/schemas/extraction";
import { storeExtractionResults } from "@/lib/pipeline/analyze-step";

const DOC_ID = "550e8400-e29b-41d4-a716-446655440000";
const FAMILY_ID = "660e8400-e29b-41d4-a716-446655440001";

/**
 * storeExtractionResults writes the analysis its caller handed it into
 * three tables (plus knowledge_edges on re-analysis). Recording the insert
 * payloads — not just that insert was called — is the point: the
 * `confirmed` flag decides whether the rows are part of the live family
 * book (fact search, task list and home all read confirmed rows only).
 */
function mockClient() {
  const inserts: Record<string, Record<string, unknown>[]> = {
    extracted_entities: [],
    tasks: [],
    document_facts: [],
  };
  const deletes: string[] = [];
  const ok = () => Promise.resolve({ data: null, error: null });

  const client = {
    from: (table: string) => {
      if (table === "knowledge_edges") {
        deletes.push(table);
        return { delete: () => ({ eq: ok }) };
      }
      if (!(table in inserts)) {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        delete: () => {
          deletes.push(table);
          return { eq: ok };
        },
        insert: (rows: Record<string, unknown>[]) => {
          inserts[table].push(...rows);
          return ok();
        },
      };
    },
  } as unknown as SupabaseClient<Database>;

  return { client, inserts, deletes };
}

const analysis: DocumentAnalysis = {
  document_type: "school",
  title: "Masterzeugnis Big Data & Business Analytics",
  summary: "Master of Science, Gesamtnote 1,9 bei 120 ECTS.",
  family_members: [
    { person_id: null, name: "Karina", confidence: 0.91 },
  ],
  organizations: [
    { name: "FOM Hochschule", type: "Hochschule", confidence: 1 },
  ],
  dates: [
    { date: "2023-08-10", type: "document_date", label: "Zeugnisdatum", confidence: 1 },
  ],
  amounts: [],
  tasks: [{ title: "Urkunde einrahmen", due_date: null, confidence: 0.8 }],
  facts: [
    { fact_type: "identifier", label: "Gesamtnote Masterstudium", value: "1,9", confidence: 0.9 },
    { fact_type: "identifier", label: "ECTS Masterstudium", value: "120", confidence: 0.9 },
  ],
  suggested_category: "Unterlagen",
  tags: ["Zeugnis", "Master"],
  needs_user_review: false,
};

describe("storeExtractionResults", () => {
  it("keeps the confirmed flag on every replacement when re-analyzing a confirmed document", async () => {
    // Re-analysis skips the review step — the replacement rows ARE the
    // live family book, so tasks and facts must arrive confirmed. A false
    // flag would hide them from the fact search and the task list.
    const { client, inserts } = mockClient();

    await storeExtractionResults(client, DOC_ID, FAMILY_ID, analysis, true);

    expect(inserts.tasks).toHaveLength(1);
    expect(inserts.tasks[0]).toMatchObject({ confirmed: true });
    expect(inserts.document_facts).toHaveLength(2);
    for (const fact of inserts.document_facts) {
      expect(fact).toMatchObject({ confirmed: true });
    }
    expect(
      inserts.extracted_entities.every((e) => e.confirmed === true),
    ).toBe(true);
  });

  it("writes unconfirmed rows for a first analysis — confirm flips them later", async () => {
    const { client, inserts } = mockClient();

    await storeExtractionResults(client, DOC_ID, FAMILY_ID, analysis, false);

    expect(inserts.tasks[0]).toMatchObject({ confirmed: false });
    expect(
      inserts.document_facts.every((f) => f.confirmed === false),
    ).toBe(true);
    expect(
      inserts.extracted_entities.every((e) => e.confirmed === false),
    ).toBe(true);
  });

  it("clears the knowledge graph edges only on re-analysis", async () => {
    const confirmedRun = mockClient();
    const freshRun = mockClient();

    await storeExtractionResults(confirmedRun.client, DOC_ID, FAMILY_ID, analysis, true);
    await storeExtractionResults(freshRun.client, DOC_ID, FAMILY_ID, analysis, false);

    expect(confirmedRun.deletes).toContain("knowledge_edges");
    expect(freshRun.deletes).not.toContain("knowledge_edges");
  });
});
