// Standalone integration verification for the confirm_document RPC.
// Exercises the real Supabase cloud DB: happy path, upsert reuse, atomic
// rollback on failure, and status_changed guard. Creates a throwaway test
// document and cleans up afterwards.
//
// Run with: node --env-file=.env.local scripts/verify-confirm-rpc.mjs
//
// This is NOT part of the vitest suite (it needs the real DB + service role
// key). It is a one-off verification script.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Use the existing Testfamilie for the test document.
const FAMILY_ID = "7bd95646-b7ba-4725-b15e-4cb1f904bee4";
const TEST_USER_ID = "5bf7b925-c751-4cec-a28d-7c4ca4e8de55"; // ordilo.auth.test@gmail.com

const results = [];
function check(name, cond, detail = "") {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

async function resetDocToAnalyzed(docId) {
  await supabase
    .from("documents")
    .update({ status: "analyzed", confirmed_at: null, error_message: null })
    .eq("id", docId);
}

async function getDoc(docId) {
  const { data, error } = await supabase
    .from("documents")
    .select("id, status, confirmed_at, title, summary, category, document_type")
    .eq("id", docId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function countRows(table, filter) {
  let q = supabase.from(table).select("id", { count: "exact", head: true });
  for (const [k, v] of Object.entries(filter)) {
    q = q.eq(k, v);
  }
  const { count, error } = await q;
  if (error) throw error;
  return count;
}

async function main() {
  // --- Setup: create a throwaway analyzed document -------------------------
  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .insert({
      family_id: FAMILY_ID,
      uploaded_by: TEST_USER_ID,
      title: "RPC Integration Test Doc",
      status: "analyzed",
      ocr_text: "Elternbrief der Kita Sonnenblume. Bringt bitte am Montag Sportsachen mit. Frau Müller.",
      file_url: `test/${Date.now()}/test.pdf`,
      mime_type: "application/pdf",
      page_count: 1,
    })
    .select("id")
    .single();
  if (docErr) throw docErr;
  const docId = doc.id;
  console.log(`\nCreated test document ${docId}`);

  // One OCR page.
  const { error: pageErr } = await supabase.from("document_pages").insert({
    document_id: docId,
    page_number: 1,
    ocr_markdown: "Elternbrief der Kita Sonnenblume. Bringt bitte am Montag Sportsachen mit. Frau Müller.",
  });
  if (pageErr) throw pageErr;

  // Some pre-existing entities/tasks (to verify replacement).
  await supabase.from("extracted_entities").insert([
    { document_id: docId, family_id: FAMILY_ID, entity_type: "person", entity_value: "Old Person", confidence: 0.5, confirmed: false },
  ]);
  await supabase.from("tasks").insert([
    { family_id: FAMILY_ID, document_id: docId, title: "Old task", confidence: 0.5, confirmed: false },
  ]);

  try {
    // --- 1. Happy path: confirm end-to-end --------------------------------
    console.log("\n=== Test 1: Happy path confirm ===");
    const embedding = Array.from({ length: 1536 }, (_, i) => (i % 7) / 10);
    const embStr = `[${embedding.join(",")}]`;

    const { data: r1, error: e1 } = await supabase.rpc("confirm_document", {
      p_document_id: docId,
      p_family_id: FAMILY_ID,
      p_title: "Kita-Brief Sportsachen",
      p_summary: "Sportsachen am Montag mitbringen.",
      p_document_type: "letter",
      p_category: "Kita",
      p_persons: [
        { name: "Emma", person_id: null, confidence: 0.95 },
      ],
      p_organizations: [
        { name: "Kita Sonnenblume", type: "Kita", confidence: 0.9 },
      ],
      p_embeddings: [
        { chunk_text: "Sportsachen am Montag", embedding: embStr, page_number: 1, chunk_index: 0, chunk_total: 1 },
      ],
      p_entities: [
        { entity_type: "person", entity_value: "Emma", normalized_value: "emma", confidence: 0.95, linked_object_id: null },
        { entity_type: "organization", entity_value: "Kita Sonnenblume", normalized_value: "kita sonnenblume", confidence: 0.9, linked_object_id: null },
        { entity_type: "category", entity_value: "Kita", normalized_value: "kita", confidence: 1.0, linked_object_id: null },
      ],
      p_tasks: [
        { title: "Sportsachen einpacken", due_date: "2026-07-06", priority: "medium", confidence: 0.8 },
      ],
    });

    check("RPC returns status=confirmed", r1 && r1.status === "confirmed", JSON.stringify(r1));
    check("RPC error is null on happy path", !e1, e1 ? JSON.stringify(e1) : "");

    const docAfter = await getDoc(docId);
    check("document status=confirmed", docAfter.status === "confirmed", docAfter.status);
    check("document confirmed_at set", !!docAfter.confirmed_at, String(docAfter.confirmed_at));
    check("document title updated", docAfter.title === "Kita-Brief Sportsachen", docAfter.title);
    check("document category updated", docAfter.category === "Kita", docAfter.category);

    const embCount = await countRows("document_embeddings", { document_id: docId });
    check("1 embedding row inserted", embCount === 1, `count=${embCount}`);

    const { data: embRow } = await supabase
      .from("document_embeddings")
      .select("metadata_json, embedding")
      .eq("document_id", docId)
      .maybeSingle();
    check("embedding metadata has page_number=1", embRow && embRow.metadata_json && embRow.metadata_json.page_number === 1, JSON.stringify(embRow?.metadata_json));
    check("embedding metadata has document_id", embRow && embRow.metadata_json && embRow.metadata_json.document_id === docId, JSON.stringify(embRow?.metadata_json));
    check("embedding vector is non-null", !!embRow && embRow.embedding !== null, "embedding present");

    const edgeCount = await countRows("knowledge_edges", { source_document_id: docId });
    check("2 edges (person + org)", edgeCount === 2, `count=${edgeCount}`);

    const { data: edges } = await supabase
      .from("knowledge_edges")
      .select("confirmed, relation_type, confidence")
      .eq("source_document_id", docId);
    check("all edges confirmed=true", edges && edges.every((e) => e.confirmed === true), JSON.stringify(edges));

    // Check person node was created.
    const { data: personNode } = await supabase
      .from("knowledge_nodes")
      .select("id, type, label")
      .eq("family_id", FAMILY_ID)
      .eq("type", "person")
      .eq("label", "Emma")
      .maybeSingle();
    check("person node 'Emma' exists", !!personNode, JSON.stringify(personNode));
    const emmaNodeId = personNode?.id;

    // Check entity replacement: "Old Person" should be gone, "Emma" present.
    const entityCount = await countRows("extracted_entities", { document_id: docId });
    check("3 entity rows (replaced, no 'Old Person')", entityCount === 3, `count=${entityCount}`);
    const { data: oldEntity } = await supabase
      .from("extracted_entities")
      .select("id")
      .eq("document_id", docId)
      .eq("entity_value", "Old Person")
      .maybeSingle();
    check("old entity 'Old Person' removed", !oldEntity, "gone");
    const { data: newEntities } = await supabase
      .from("extracted_entities")
      .select("confirmed")
      .eq("document_id", docId);
    check("all new entities confirmed=true", newEntities && newEntities.every((e) => e.confirmed === true), JSON.stringify(newEntities));

    // Check task replacement.
    const taskCount = await countRows("tasks", { document_id: docId });
    check("1 task row (replaced, no 'Old task')", taskCount === 1, `count=${taskCount}`);
    const { data: newTasks } = await supabase
      .from("tasks")
      .select("title, confirmed")
      .eq("document_id", docId);
    check("new task is 'Sportsachen einpacken' confirmed", newTasks && newTasks[0]?.title === "Sportsachen einpacken" && newTasks[0].confirmed === true, JSON.stringify(newTasks));

    // --- 2. Status_changed guard (double-submit) -------------------------
    console.log("\n=== Test 2: status_changed guard ===");
    const { data: r2 } = await supabase.rpc("confirm_document", {
      p_document_id: docId,
      p_family_id: FAMILY_ID,
      p_title: "Kita-Brief Sportsachen",
      p_summary: "Sportsachen am Montag mitbringen.",
      p_document_type: "letter",
      p_category: "Kita",
      p_persons: [{ name: "Emma", person_id: null, confidence: 0.95 }],
      p_organizations: [],
      p_embeddings: [],
      p_entities: [],
      p_tasks: [],
    });
    check("second confirm returns status_changed", r2 && r2.status === "status_changed", JSON.stringify(r2));
    // No new edges/embeddings should be created.
    const edgeCount2 = await countRows("knowledge_edges", { source_document_id: docId });
    check("no duplicate edges after double-submit", edgeCount2 === 2, `count=${edgeCount2}`);
    const embCount2 = await countRows("document_embeddings", { document_id: docId });
    check("no duplicate embeddings after double-submit", embCount2 === 1, `count=${embCount2}`);

    // --- 3. Upsert reuse: re-confirm reuses the same person node ----------
    console.log("\n=== Test 3: concurrent node reuse via upsert ===");
    await resetDocToAnalyzed(docId);
    // Pre-create a person node "Emma" (simulating a concurrent confirm that
    // already created it). Then confirm and verify the RPC reuses it.
    const { data: r3 } = await supabase.rpc("confirm_document", {
      p_document_id: docId,
      p_family_id: FAMILY_ID,
      p_title: "Kita-Brief Sportsachen v2",
      p_summary: "Re-confirm.",
      p_document_type: "letter",
      p_category: "Kita",
      p_persons: [{ name: "Emma", person_id: null, confidence: 0.95 }],
      p_organizations: [{ name: "Kita Sonnenblume", type: "Kita", confidence: 0.9 }],
      p_embeddings: [],
      p_entities: [],
      p_tasks: [],
    });
    check("re-confirm returns confirmed", r3 && r3.status === "confirmed", JSON.stringify(r3));
    // The person node "Emma" should still be the SAME id (upsert reused).
    const { data: personNodeAfter } = await supabase
      .from("knowledge_nodes")
      .select("id, type, label")
      .eq("family_id", FAMILY_ID)
      .eq("type", "person")
      .eq("label", "Emma")
      .maybeSingle();
    check("person node 'Emma' reused (same id)", personNodeAfter && personNodeAfter.id === emmaNodeId, `before=${emmaNodeId} after=${personNodeAfter?.id}`);
    // No duplicate person nodes.
    const { count: emmaNodeCount } = await supabase
      .from("knowledge_nodes")
      .select("id", { count: "exact", head: true })
      .eq("family_id", FAMILY_ID)
      .eq("type", "person")
      .eq("label", "Emma");
    check("exactly 1 person node 'Emma' (no duplicate)", emmaNodeCount === 1, `count=${emmaNodeCount}`);
    // Edges replaced (cleared + re-inserted), should still be 2.
    const edgeCount3 = await countRows("knowledge_edges", { source_document_id: docId });
    check("edges replaced (still 2, no duplicates)", edgeCount3 === 2, `count=${edgeCount3}`);

    // --- 4. Atomic rollback on failure -----------------------------------
    console.log("\n=== Test 4: atomic rollback on RPC failure ===");
    await resetDocToAnalyzed(docId);
    // Capture the pre-RPC state: Test 3 left 2 edges and a document node.
    // The rollback should RESTORE this state (the DELETEs inside the RPC are
    // rolled back), proving the transaction is atomic. No NEW state from the
    // failed call should persist.
    const edgesBeforeFail = await countRows("knowledge_edges", { source_document_id: docId });
    check("pre-fail edges captured (from Test 3)", edgesBeforeFail === 2, `count=${edgesBeforeFail}`);
    const docNodeBeforeFail = await supabase
      .from("knowledge_nodes")
      .select("id, label")
      .eq("family_id", FAMILY_ID)
      .eq("type", "document")
      .eq("properties_json->>document_id", docId)
      .maybeSingle();
    const docNodeIdBeforeFail = docNodeBeforeFail.data?.id;

    // Call the RPC with a malformed embedding (invalid vector string) to
    // force a Postgres error inside the transaction. The entire transaction
    // should roll back — status reverts to 'analyzed', and the pre-RPC
    // graph state is restored (no partial new state).
    const { data: r4, error: e4 } = await supabase.rpc("confirm_document", {
      p_document_id: docId,
      p_family_id: FAMILY_ID,
      p_title: "Should Rollback",
      p_summary: "x",
      p_document_type: "letter",
      p_category: "Kita",
      p_persons: [{ name: "Hanna", person_id: null, confidence: 0.9 }],
      p_organizations: [],
      p_embeddings: [
        // Invalid vector: not a valid pgvector literal → cast error.
        { chunk_text: "bad", embedding: "not-a-vector", page_number: 1, chunk_index: 0, chunk_total: 1 },
      ],
      p_entities: [],
      p_tasks: [],
    });
    check("RPC with bad embedding returns an error", !!e4, `error=${e4 ? e4.message : "none"}`);
    check("RPC with bad embedding returns no data", !r4, JSON.stringify(r4));

    const docAfterFail = await getDoc(docId);
    check("document reverted to analyzed (rollback)", docAfterFail.status === "analyzed", docAfterFail.status);
    check("confirmed_at cleared after rollback", !docAfterFail.confirmed_at, String(docAfterFail.confirmed_at));
    // The pre-RPC edges are RESTORED by the rollback (the DELETEs were rolled
    // back), proving atomicity. No NEW edge from the failed call persists.
    const edgeCount4 = await countRows("knowledge_edges", { source_document_id: docId });
    check("edges restored to pre-fail count (rollback undid deletes)", edgeCount4 === edgesBeforeFail, `count=${edgeCount4} expected=${edgesBeforeFail}`);
    const embCount4 = await countRows("document_embeddings", { document_id: docId });
    check("no embeddings after rollback", embCount4 === 0, `count=${embCount4}`);
    // The "Hanna" person node should NOT have been created (rollback).
    const { data: hannaNode } = await supabase
      .from("knowledge_nodes")
      .select("id")
      .eq("family_id", FAMILY_ID)
      .eq("type", "person")
      .eq("label", "Hanna")
      .maybeSingle();
    check("no 'Hanna' node after rollback", !hannaNode, "absent");
    // "Should Rollback" document node should NOT exist (rolled back).
    const { data: rollbackDocNode } = await supabase
      .from("knowledge_nodes")
      .select("id")
      .eq("family_id", FAMILY_ID)
      .eq("type", "document")
      .eq("label", "Should Rollback")
      .maybeSingle();
    check("no 'Should Rollback' document node after rollback", !rollbackDocNode, "absent");
    // The pre-existing document node is restored (same id as before the call).
    const { data: docNodeAfterFail } = await supabase
      .from("knowledge_nodes")
      .select("id, label")
      .eq("family_id", FAMILY_ID)
      .eq("type", "document")
      .eq("properties_json->>document_id", docId)
      .maybeSingle();
    check("pre-existing document node restored (same id)", docNodeAfterFail?.id === docNodeIdBeforeFail, `before=${docNodeIdBeforeFail} after=${docNodeAfterFail?.id}`);

  } finally {
    // --- Cleanup ----------------------------------------------------------
    console.log("\n=== Cleanup ===");
    // Delete edges for the test document.
    await supabase.from("knowledge_edges").delete().eq("source_document_id", docId);
    // Delete embeddings.
    await supabase.from("document_embeddings").delete().eq("document_id", docId);
    // Delete the document node (by properties_json->>document_id).
    await supabase.from("knowledge_nodes").delete().eq("type", "document").eq("properties_json->>document_id", docId);
    // Delete entities/tasks (cascade should handle, but be explicit).
    await supabase.from("extracted_entities").delete().eq("document_id", docId);
    await supabase.from("tasks").delete().eq("document_id", docId);
    // Delete document_pages + document (cascade).
    await supabase.from("document_pages").delete().eq("document_id", docId);
    await supabase.from("documents").delete().eq("id", docId);
    // Do NOT delete the "Emma" person node — it may pre-exist / be shared.
    console.log(`Cleaned up test document ${docId}`);
  }

  // --- Summary ---
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n=== SUMMARY: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`  - ${r.name}: ${r.detail}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
