import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/ai/search", () => ({
  semanticSearch: vi.fn().mockResolvedValue([]),
  hybridSearch: vi.fn().mockResolvedValue([]),
  graphSearch: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/ai/chat", () => ({
  filterByRelevanceThreshold: vi.fn((r: unknown[]) => r),
  combineSearchResults: vi.fn(() => []),
}));

vi.mock("@/app/(app)/familie/actions", () => ({
  addFamilyMember: vi.fn(),
}));

import { executeTool, CONFIRMATION_TOOLS } from "@/lib/ai/tools";
import type { ToolContext } from "@/lib/ai/tools";
import type { ChatSource } from "@/lib/schemas/chat";
import { addFamilyMember } from "@/app/(app)/familie/actions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  const chainable: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ["select", "eq", "order", "update", "insert", "in", "limit", "not", "or", "gte", "lte"]) {
    chainable[m] = vi.fn().mockReturnThis();
  }
  chainable.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  chainable.single = vi.fn().mockResolvedValue({ data: null, error: null });

  return {
    client: {
      from: vi.fn(() => chainable),
    } as unknown as ToolContext["client"],
    familyId: "fam-1",
    sources: [] as ChatSource[],
    speakerName: null,
    ...overrides,
  };
}

function makeCtxWithTask(task: { id: string; title: string } | null, updateError: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: task,
    error: null,
  });
  // Build a self-referential thenable for the update.eq() chain.
  // The real Supabase client's .eq() returns a thenable PostgrestFilterBuilder.
  const updateThenable: {
    eq: ReturnType<typeof vi.fn>;
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise<unknown>;
  } = {
    eq: vi.fn(),
    then: (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: null, error: updateError }).then(resolve),
  };
  updateThenable.eq.mockReturnValue(updateThenable);

  return {
    client: {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        maybeSingle,
        update: vi.fn(() => ({ eq: vi.fn().mockReturnValue(updateThenable) })),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    } as unknown as ToolContext["client"],
    familyId: "fam-1",
    sources: [] as ChatSource[],
    speakerName: null,
  };
}

/**
 * A chainable query-builder mock that resolves to `{ data, error }` both
 * when awaited directly (mirrors Supabase's thenable PostgrestFilterBuilder)
 * and when terminated with `.maybeSingle()`/`.single()`.
 */
function makeThenableChain(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "in", "limit", "not", "or", "ilike", "gte", "lte"]) {
    chain[m] = vi.fn(() => chain);
  }
  const single = Array.isArray(data) ? (data[0] ?? null) : data;
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: single, error });
  chain.single = vi.fn().mockResolvedValue({ data: single, error });
  chain.then = (
    resolve: (v: { data: unknown; error: unknown }) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve({ data, error }).then(resolve, reject);
  return chain;
}

/**
 * Ctx for move_document_to_collection: `.from("documents")` resolves the
 * document lookup (and supports `.update()`), `.from("collections")`
 * resolves the ilike match on the first call and the "all collections"
 * fallback list on any subsequent call.
 */
function makeMoveDocCtx({
  doc,
  matchingCollections,
  allCollections,
  updateError = null,
}: {
  doc: { id: string; title: string | null } | null;
  matchingCollections: Array<{ name: string }>;
  allCollections?: Array<{ name: string }>;
  updateError?: unknown;
}): ToolContext {
  let collectionsCalls = 0;
  const from = vi.fn((table: string) => {
    if (table === "documents") {
      const chain = makeThenableChain(doc) as Record<string, unknown> & {
        update?: ReturnType<typeof vi.fn>;
      };
      chain.update = vi.fn(() => makeThenableChain(null, updateError));
      return chain;
    }
    if (table === "collections") {
      collectionsCalls++;
      const data = collectionsCalls === 1 ? matchingCollections : (allCollections ?? matchingCollections);
      return makeThenableChain(data);
    }
    return makeThenableChain(null);
  });

  return {
    client: { from } as unknown as ToolContext["client"],
    familyId: "fam-1",
    sources: [] as ChatSource[],
    speakerName: null,
  };
}

/**
 * Ctx for add_document_tags: `.from("documents")` resolves the document
 * lookup (with existing `tags`) and supports `.update()`.
 */
function makeTagsCtx({
  doc,
  updateError = null,
}: {
  doc: { id: string; title: string | null; tags: string[] } | null;
  updateError?: unknown;
}): ToolContext {
  const from = vi.fn(() => {
    const chain = makeThenableChain(doc) as Record<string, unknown> & {
      update?: ReturnType<typeof vi.fn>;
    };
    chain.update = vi.fn(() => makeThenableChain(null, updateError));
    return chain;
  });

  return {
    client: { from } as unknown as ToolContext["client"],
    familyId: "fam-1",
    sources: [] as ChatSource[],
    speakerName: null,
  };
}

// ---------------------------------------------------------------------------
// mark_task_done confirmation gate
// ---------------------------------------------------------------------------

describe("mark_task_done confirmation gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes 'mark_task_done' in CONFIRMATION_TOOLS", () => {
    expect(CONFIRMATION_TOOLS.has("mark_task_done")).toBe(true);
  });

  it("returns needs_confirmation when confirmed is false", async () => {
    const ctx = makeCtxWithTask({ id: "task-1", title: "Müll rausbringen" });
    const result = await executeTool("mark_task_done", { task_id: "task-1" }, ctx);
    const parsed = JSON.parse(result);

    expect(parsed.needs_confirmation).toBe(true);
    expect(parsed.task_id).toBe("task-1");
    expect(parsed.task_title).toBe("Müll rausbringen");
    expect(parsed.message).toContain("Müll rausbringen");
  });

  it("returns needs_confirmation when confirmed is missing", async () => {
    const ctx = makeCtxWithTask({ id: "task-1", title: "Rechnung bezahlen" });
    const result = await executeTool("mark_task_done", { task_id: "task-1" }, ctx);
    const parsed = JSON.parse(result);

    expect(parsed.needs_confirmation).toBe(true);
  });

  it("returns needs_confirmation when confirmed is explicitly false", async () => {
    const ctx = makeCtxWithTask({ id: "task-1", title: "Termin" });
    const result = await executeTool(
      "mark_task_done",
      { task_id: "task-1", confirmed: false },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.needs_confirmation).toBe(true);
  });

  it("executes the update when confirmed is true", async () => {
    const ctx = makeCtxWithTask({ id: "task-1", title: "Erledigt" });
    const result = await executeTool(
      "mark_task_done",
      { task_id: "task-1", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.needs_confirmation).toBeUndefined();
    expect(parsed.success).toBe(true);
    expect(parsed.task_id).toBe("task-1");
    expect(parsed.titel).toBe("Erledigt");
  });

  it("returns error when task is not found", async () => {
    const ctx = makeCtxWithTask(null);
    const result = await executeTool(
      "mark_task_done",
      { task_id: "nonexistent", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Aufgabe nicht gefunden.");
  });

  it("returns error when task_id is empty", async () => {
    const ctx = makeCtx();
    const result = await executeTool("mark_task_done", { task_id: "" }, ctx);
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Keine Aufgaben-ID angegeben.");
  });

  it("returns error on update failure", async () => {
    const ctx = makeCtxWithTask(
      { id: "task-1", title: "Test" },
      new Error("RLS denied"),
    );
    const result = await executeTool(
      "mark_task_done",
      { task_id: "task-1", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Aufgabe konnte nicht aktualisiert werden.");
  });
});

// ---------------------------------------------------------------------------
// add_family_member confirmation gate
// ---------------------------------------------------------------------------

describe("add_family_member confirmation gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes 'add_family_member' in CONFIRMATION_TOOLS", () => {
    expect(CONFIRMATION_TOOLS.has("add_family_member")).toBe(true);
  });

  it("returns needs_confirmation when confirmed is missing", async () => {
    const ctx = makeCtx();
    const result = await executeTool("add_family_member", { name: "Emma" }, ctx);
    const parsed = JSON.parse(result);

    expect(parsed.needs_confirmation).toBe(true);
    expect(parsed.member_name).toBe("Emma");
    expect(addFamilyMember).not.toHaveBeenCalled();
  });

  it("returns error when name is empty", async () => {
    const ctx = makeCtx();
    const result = await executeTool("add_family_member", { name: "  " }, ctx);
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Kein Name angegeben.");
    expect(addFamilyMember).not.toHaveBeenCalled();
  });

  it("calls addFamilyMember and returns success when confirmed is true", async () => {
    (addFamilyMember as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { id: "member-1", name: "Emma" },
    });
    const ctx = makeCtx();
    const result = await executeTool(
      "add_family_member",
      { name: "Emma", role: "Kind", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(addFamilyMember).toHaveBeenCalledWith({
      name: "Emma",
      role: "Kind",
      birthdate: undefined,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.member_id).toBe("member-1");
  });

  it("returns error when addFamilyMember fails", async () => {
    (addFamilyMember as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    });
    const ctx = makeCtx();
    const result = await executeTool(
      "add_family_member",
      { name: "Emma", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Etwas ist schiefgelaufen. Bitte versuche es erneut.");
  });
});

// ---------------------------------------------------------------------------
// move_document_to_collection confirmation gate
// ---------------------------------------------------------------------------

describe("move_document_to_collection confirmation gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes 'move_document_to_collection' in CONFIRMATION_TOOLS", () => {
    expect(CONFIRMATION_TOOLS.has("move_document_to_collection")).toBe(true);
  });

  it("returns error when document is not found", async () => {
    const ctx = makeMoveDocCtx({ doc: null, matchingCollections: [] });
    const result = await executeTool(
      "move_document_to_collection",
      { document_id: "doc-1", collection_name: "Rechnungen" },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Dokument nicht gefunden.");
  });

  it("returns available collections when no collection matches", async () => {
    const ctx = makeMoveDocCtx({
      doc: { id: "doc-1", title: "Stromrechnung" },
      matchingCollections: [],
      allCollections: [{ name: "Verträge" }, { name: "Steuer" }],
    });
    const result = await executeTool(
      "move_document_to_collection",
      { document_id: "doc-1", collection_name: "Rechnungen" },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain("Rechnungen");
    expect(parsed.verfuegbare_sammlungen).toEqual(["Verträge", "Steuer"]);
  });

  it("returns needs_confirmation when confirmed is missing", async () => {
    const ctx = makeMoveDocCtx({
      doc: { id: "doc-1", title: "Stromrechnung" },
      matchingCollections: [{ name: "Rechnungen" }],
    });
    const result = await executeTool(
      "move_document_to_collection",
      { document_id: "doc-1", collection_name: "rechnungen" },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.needs_confirmation).toBe(true);
    expect(parsed.document_title).toBe("Stromrechnung");
    expect(parsed.collection_name).toBe("Rechnungen");
  });

  it("executes the update when confirmed is true", async () => {
    const ctx = makeMoveDocCtx({
      doc: { id: "doc-1", title: "Stromrechnung" },
      matchingCollections: [{ name: "Rechnungen" }],
    });
    const result = await executeTool(
      "move_document_to_collection",
      { document_id: "doc-1", collection_name: "Rechnungen", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.collection_name).toBe("Rechnungen");
  });

  it("returns error on update failure", async () => {
    const ctx = makeMoveDocCtx({
      doc: { id: "doc-1", title: "Stromrechnung" },
      matchingCollections: [{ name: "Rechnungen" }],
      updateError: new Error("RLS denied"),
    });
    const result = await executeTool(
      "move_document_to_collection",
      { document_id: "doc-1", collection_name: "Rechnungen", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Dokument konnte nicht verschoben werden.");
  });
});

// ---------------------------------------------------------------------------
// add_document_tags confirmation gate
// ---------------------------------------------------------------------------

describe("add_document_tags confirmation gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes 'add_document_tags' in CONFIRMATION_TOOLS", () => {
    expect(CONFIRMATION_TOOLS.has("add_document_tags")).toBe(true);
  });

  it("returns error when document is not found", async () => {
    const ctx = makeTagsCtx({ doc: null });
    const result = await executeTool(
      "add_document_tags",
      { document_id: "doc-1", tags: ["Steuer"] },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Dokument nicht gefunden.");
  });

  it("returns error when tags are empty", async () => {
    const ctx = makeTagsCtx({ doc: { id: "doc-1", title: "Beleg", tags: [] } });
    const result = await executeTool(
      "add_document_tags",
      { document_id: "doc-1", tags: [] },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Dokument-ID oder Tags fehlen.");
  });

  it("returns needs_confirmation when confirmed is missing", async () => {
    const ctx = makeTagsCtx({ doc: { id: "doc-1", title: "Beleg", tags: [] } });
    const result = await executeTool(
      "add_document_tags",
      { document_id: "doc-1", tags: ["Steuer", "2025"] },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.needs_confirmation).toBe(true);
    expect(parsed.tags).toEqual(["Steuer", "2025"]);
  });

  it("dedupes against existing tags and executes when confirmed", async () => {
    const ctx = makeTagsCtx({
      doc: { id: "doc-1", title: "Beleg", tags: ["Steuer"] },
    });
    const result = await executeTool(
      "add_document_tags",
      { document_id: "doc-1", tags: ["Steuer", "2025"], confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.tags).toEqual(["Steuer", "2025"]);
  });

  it("returns error on update failure", async () => {
    const ctx = makeTagsCtx({
      doc: { id: "doc-1", title: "Beleg", tags: [] },
      updateError: new Error("RLS denied"),
    });
    const result = await executeTool(
      "add_document_tags",
      { document_id: "doc-1", tags: ["Steuer"], confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Schlagworte konnten nicht gespeichert werden.");
  });
});

// ---------------------------------------------------------------------------
// list_documents — deterministic, complete listing
// ---------------------------------------------------------------------------

describe("list_documents", () => {
  function makeListCtx(
    docs: Array<{
      id: string;
      title: string | null;
      document_type: string | null;
      category: string | null;
      created_at: string;
      confirmed_at: string | null;
    }>,
  ): ToolContext {
    const thenable = {
      then: (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: docs, error: null }).then(resolve),
    };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "ilike", "in", "gte", "lt", "order"]) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.limit = vi.fn().mockReturnValue(thenable);

    return {
      client: {
        from: vi.fn(() => chain),
      } as unknown as ToolContext["client"],
      familyId: "fam-1",
      sources: [] as ChatSource[],
      speakerName: null,
    };
  }

  it("returns a chronological, complete listing and surfaces sources", async () => {
    const ctx = makeListCtx([
      {
        id: "doc-1",
        title: "Stromrechnung Juli",
        document_type: "invoice",
        category: "Rechnungen",
        created_at: "2026-07-01T10:00:00Z",
        confirmed_at: "2026-07-02T10:00:00Z",
      },
      {
        id: "doc-2",
        title: "Stromrechnung Juni",
        document_type: "invoice",
        category: "Rechnungen",
        created_at: "2026-06-01T10:00:00Z",
        confirmed_at: null,
      },
    ]);

    const result = await executeTool(
      "list_documents",
      { document_type: "invoice" },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.total).toBe(2);
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0].titel).toBe("Stromrechnung Juli");
    expect(parsed.results[0].datum).toBe("2026-07-02");
    expect(parsed.results[1].datum).toBe("2026-06-01");
    // Listed documents become tappable sources for the answer.
    expect(ctx.sources.map((s) => s.document_id)).toEqual(["doc-1", "doc-2"]);
  });

  it("returns an empty result with a German message when nothing matches", async () => {
    const ctx = makeListCtx([]);
    const result = await executeTool("list_documents", {}, ctx);
    const parsed = JSON.parse(result);
    expect(parsed.total).toBe(0);
    expect(parsed.message).toContain("Keine passenden Dokumente");
  });
});
