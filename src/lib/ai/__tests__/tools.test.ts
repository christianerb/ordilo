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

// Partial mock: the real PipelineStepError / isDestructiveAnalysisFailure
// pair decides how a failed enrichment is recorded.
vi.mock("@/lib/pipeline/analyze-step", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/pipeline/analyze-step")>();
  return { ...actual, performAnalyzeStep: vi.fn().mockResolvedValue({}) };
});

vi.mock("@/lib/supabase/document-helpers", () => ({
  markDocumentFailed: vi.fn().mockResolvedValue(undefined),
  restoreConfirmedAfterAnalysisFailure: vi.fn().mockResolvedValue(undefined),
}));

import { executeTool, CONFIRMATION_TOOLS } from "@/lib/ai/tools";
import type { ToolContext } from "@/lib/ai/tools";
import type { ChatSource } from "@/lib/schemas/chat";
import {
  performAnalyzeStep,
  PipelineStepError,
} from "@/lib/pipeline/analyze-step";
import {
  markDocumentFailed,
  restoreConfirmedAfterAnalysisFailure,
} from "@/lib/supabase/document-helpers";

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
  for (const m of ["select", "eq", "order", "in", "limit", "not", "or", "ilike", "gte", "lte", "lt"]) {
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

/**
 * Ctx for add_family_member: `.from("family_members")` captures the insert
 * payload and resolves the select/single chain.
 */
function makeMemberCtx({
  inserted = null,
  insertError = null,
  relationsRpcError = null,
}: {
  inserted?: { id: string; name: string } | null;
  insertError?: unknown;
  /** Make the atomic relation write fail. */
  relationsRpcError?: unknown;
} = {}) {
  let capturedInsert: Record<string, unknown> | null = null;
  let capturedRelations: Record<string, unknown>[] | null = null;
  const memberDelete = vi.fn(() => ({
    eq: vi.fn().mockResolvedValue({ error: null }),
  }));

  const from = vi.fn((table: string) => {
    if (table === "family_members") {
      return {
        insert: vi.fn((payload: Record<string, unknown>) => {
          capturedInsert = payload;
          return {
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: insertError ? null : inserted,
                error: insertError,
              }),
            })),
          };
        }),
        // The role is mirrored into family_member_relations, which syncs
        // the primary role back onto the member row.
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
        delete: memberDelete,
      };
    }
    if (table === "family_member_relations") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
          in: vi.fn().mockResolvedValue({ error: null }),
        })),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }
    return makeThenableChain(null);
  });

  // The relations are written by the replace_member_relations RPC, which
  // swaps a member's rows in one transaction.
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    if (name === "replace_member_relations") {
      capturedRelations = args.p_relations as Record<string, unknown>[];
    }
    return Promise.resolve({ data: [], error: relationsRpcError ?? null });
  });

  const ctx = {
    client: { from, rpc } as unknown as ToolContext["client"],
    familyId: "fam-1",
    sources: [] as ChatSource[],
    speakerName: null,
  };

  return {
    ctx,
    getInsert: () => capturedInsert,
    getRelations: () => capturedRelations,
    memberDelete,
  };
}

describe("add_family_member confirmation gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes 'add_family_member' in CONFIRMATION_TOOLS", () => {
    expect(CONFIRMATION_TOOLS.has("add_family_member")).toBe(true);
  });

  it("returns needs_confirmation when confirmed is missing, without inserting", async () => {
    const { ctx, getInsert } = makeMemberCtx();
    const result = await executeTool("add_family_member", { name: "Emma" }, ctx);
    const parsed = JSON.parse(result);

    expect(parsed.needs_confirmation).toBe(true);
    expect(parsed.member_name).toBe("Emma");
    expect(getInsert()).toBeNull();
  });

  it("returns error when name is empty", async () => {
    const { ctx, getInsert } = makeMemberCtx();
    const result = await executeTool("add_family_member", { name: "  " }, ctx);
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Kein Name angegeben.");
    expect(getInsert()).toBeNull();
  });

  it("inserts into the ACTIVE chat family with normalized optional fields", async () => {
    const { ctx, getInsert } = makeMemberCtx({
      inserted: { id: "member-1", name: "Emma" },
    });
    const result = await executeTool(
      "add_family_member",
      { name: "Emma", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    // The family binding is the regression guard: the member must land in
    // ctx.familyId, not in an arbitrary RLS-visible family.
    expect(getInsert()).toEqual({
      family_id: "fam-1",
      name: "Emma",
      role: null,
      birthdate: null,
      avatar_color: null,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.member_id).toBe("member-1");
  });

  it("passes role and birthdate through the shared validation", async () => {
    const { ctx, getInsert, getRelations } = makeMemberCtx({
      inserted: { id: "member-2", name: "Emma" },
    });
    await executeTool(
      "add_family_member",
      { name: "Emma", role: "Kind", birthdate: "2020-04-03", confirmed: true },
      ctx,
    );

    expect(getInsert()).toMatchObject({ role: "Kind", birthdate: "2020-04-03" });
    // The role also becomes a relationship, so the /familie UI shows the
    // same thing for a member added through chat.
    expect(getRelations()).toEqual([
      { related_member_id: null, role: "Kind", sort_order: 0 },
    ]);
  });

  it("undoes the member when the role cannot be stored as a relation", async () => {
    const { ctx, memberDelete } = makeMemberCtx({
      inserted: { id: "member-3", name: "Emma" },
      relationsRpcError: { message: "boom" },
    });
    const result = await executeTool(
      "add_family_member",
      { name: "Emma", role: "Kind", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Familienmitglied konnte nicht angelegt werden.");
    expect(memberDelete).toHaveBeenCalled();
  });

  it("returns the shared validation error for an invalid birthdate", async () => {
    const { ctx, getInsert } = makeMemberCtx();
    const result = await executeTool(
      "add_family_member",
      { name: "Emma", birthdate: "3.4.2020", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Bitte ein gültiges Geburtsdatum eingeben");
    expect(getInsert()).toBeNull();
  });

  it("marks the note failed when the enrichment broke mid-write", async () => {
    // A destructive failure can leave the note's stored results
    // half-replaced — the visible failed state is what gets it retried.
    (performAnalyzeStep as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new PipelineStepError("Speichern fehlgeschlagen", "DB_STORE_FAILED", {
        destructive: true,
      }),
    );
    const ctx = makeNoteCtx();
    const result = await executeTool(
      "create_note",
      { title: "WLAN", content: "Text", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.analysiert).toBe(false);
    expect(markDocumentFailed).toHaveBeenCalled();
    expect(restoreConfirmedAfterAnalysisFailure).not.toHaveBeenCalled();
  });

  it("returns error when the insert fails", async () => {
    const { ctx } = makeMemberCtx({ insertError: { message: "RLS denied" } });
    const result = await executeTool(
      "add_family_member",
      { name: "Emma", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Familienmitglied konnte nicht angelegt werden.");
  });
});

// ---------------------------------------------------------------------------
// add_task confirmation gate
// ---------------------------------------------------------------------------

/**
 * Ctx for add_task: `.from("family_members")` resolves the optional
 * assignee lookup, `.from("tasks")` supports `.insert().select().single()`.
 */
function makeAddTaskCtx({
  member = null,
  insertedTask = null,
  insertError = null,
}: {
  member?: { id: string } | null;
  insertedTask?: { id: string; title: string } | null;
  insertError?: unknown;
} = {}): ToolContext {
  const from = vi.fn((table: string) => {
    if (table === "family_members") {
      return makeThenableChain(member);
    }
    if (table === "tasks") {
      const chain: Record<string, unknown> = {};
      chain.insert = vi.fn(() => chain);
      chain.select = vi.fn(() => chain);
      chain.single = vi
        .fn()
        .mockResolvedValue({ data: insertedTask, error: insertError });
      return chain;
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

describe("add_task confirmation gate", () => {
  it("includes 'add_task' in CONFIRMATION_TOOLS", () => {
    expect(CONFIRMATION_TOOLS.has("add_task")).toBe(true);
  });

  it("returns needs_confirmation when confirmed is missing, without inserting", async () => {
    const ctx = makeAddTaskCtx();
    const result = await executeTool(
      "add_task",
      { title: "Kita-Ausflug", due_date: "2026-09-12" },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.needs_confirmation).toBe(true);
    expect(parsed.task_title).toBe("Kita-Ausflug");
    expect(parsed.due_date).toBe("2026-09-12");
    expect(ctx.client.from).not.toHaveBeenCalledWith("tasks");
  });

  it("returns error when title is empty", async () => {
    const ctx = makeAddTaskCtx();
    const result = await executeTool("add_task", { title: "  ", confirmed: true }, ctx);
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Kein Titel angegeben.");
  });

  it("inserts the task and returns success when confirmed is true", async () => {
    const ctx = makeAddTaskCtx({
      insertedTask: { id: "task-9", title: "Kita-Ausflug" },
    });
    const result = await executeTool(
      "add_task",
      { title: "Kita-Ausflug", due_date: "2026-09-12", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.task_id).toBe("task-9");
    expect(parsed.titel).toBe("Kita-Ausflug");
  });

  it("resolves assignee_name to a family member id before inserting", async () => {
    const ctx = makeAddTaskCtx({
      member: { id: "member-5" },
      insertedTask: { id: "task-9", title: "Kita-Ausflug" },
    });
    await executeTool(
      "add_task",
      { title: "Kita-Ausflug", assignee_name: "Emma", confirmed: true },
      ctx,
    );

    expect(ctx.client.from).toHaveBeenCalledWith("family_members");
  });

  it("marks the note failed when the enrichment broke mid-write", async () => {
    // A destructive failure can leave the note's stored results
    // half-replaced — the visible failed state is what gets it retried.
    (performAnalyzeStep as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new PipelineStepError("Speichern fehlgeschlagen", "DB_STORE_FAILED", {
        destructive: true,
      }),
    );
    const ctx = makeNoteCtx();
    const result = await executeTool(
      "create_note",
      { title: "WLAN", content: "Text", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.analysiert).toBe(false);
    expect(markDocumentFailed).toHaveBeenCalled();
    expect(restoreConfirmedAfterAnalysisFailure).not.toHaveBeenCalled();
  });

  it("returns error when the insert fails", async () => {
    const ctx = makeAddTaskCtx({ insertError: { message: "db error" } });
    const result = await executeTool(
      "add_task",
      { title: "Kita-Ausflug", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Aufgabe konnte nicht angelegt werden.");
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

// ---------------------------------------------------------------------------
// save_document_fact
// ---------------------------------------------------------------------------

/**
 * Ctx for save_document_fact: `.from("documents")` resolves the document
 * lookup, `.from("document_facts")` resolves the existing-facts lookup
 * and supports `.insert()` / `.update()`.
 */
function makeSaveFactCtx({
  doc,
  existingFacts = [],
  insertError = null,
  updateError = null,
}: {
  doc: { id: string; title: string | null } | null;
  existingFacts?: Array<{ id: string; label: string; value: string }>;
  insertError?: unknown;
  updateError?: unknown;
}): ToolContext & { inserted: unknown[]; updated: unknown[] } {
  const inserted: unknown[] = [];
  const updated: unknown[] = [];
  const from = vi.fn((table: string) => {
    if (table === "documents") {
      return makeThenableChain(doc);
    }
    if (table === "document_facts") {
      const chain = makeThenableChain(existingFacts) as Record<string, unknown> & {
        insert?: ReturnType<typeof vi.fn>;
        update?: ReturnType<typeof vi.fn>;
      };
      chain.insert = vi.fn((row: unknown) => {
        inserted.push(row);
        return Promise.resolve({ error: insertError });
      });
      chain.update = vi.fn((row: unknown) => {
        updated.push(row);
        return makeThenableChain(null, updateError);
      });
      return chain;
    }
    return makeThenableChain(null);
  });

  return {
    client: { from } as unknown as ToolContext["client"],
    familyId: "fam-1",
    sources: [] as ChatSource[],
    speakerName: null,
    inserted,
    updated,
  };
}

describe("save_document_fact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is a confirmation-gated tool", () => {
    expect(CONFIRMATION_TOOLS.has("save_document_fact")).toBe(true);
  });

  it("returns error when the document is not found", async () => {
    const ctx = makeSaveFactCtx({ doc: null });
    const result = await executeTool(
      "save_document_fact",
      { document_id: "doc-1", label: "Seriennummer", value: "SN-1", confirmed: true },
      ctx,
    );
    expect(JSON.parse(result).error).toBe("Dokument nicht gefunden.");
  });

  it("requests confirmation before writing anything", async () => {
    const ctx = makeSaveFactCtx({ doc: { id: "doc-1", title: "Rechnung Waschmaschine" } });
    const result = await executeTool(
      "save_document_fact",
      { document_id: "doc-1", label: "Seriennummer", value: "WM-482" },
      ctx,
    );
    const parsed = JSON.parse(result);
    expect(parsed.needs_confirmation).toBe(true);
    expect(ctx.inserted).toHaveLength(0);
    expect(ctx.updated).toHaveLength(0);
  });

  it("discloses the overwrite scope in the preview when a fact exists", async () => {
    const ctx = makeSaveFactCtx({
      doc: { id: "doc-1", title: "Rechnung Waschmaschine" },
      existingFacts: [{ id: "fact-1", label: "Seriennummer", value: "WM-4B2" }],
    });
    const result = await executeTool(
      "save_document_fact",
      { document_id: "doc-1", label: "Seriennummer", value: "WM-482" },
      ctx,
    );
    const parsed = JSON.parse(result);
    expect(parsed.needs_confirmation).toBe(true);
    // The action card renders these to show the correction, not just an add.
    expect(parsed.label).toBe("Seriennummer");
    expect(parsed.existing_value).toBe("WM-4B2");
    expect(parsed.value).toBe("WM-482");
  });

  it("reports existing_value null in the preview for a brand-new fact", async () => {
    const ctx = makeSaveFactCtx({ doc: { id: "doc-1", title: "Rechnung Waschmaschine" } });
    const result = await executeTool(
      "save_document_fact",
      { document_id: "doc-1", label: "IBAN", value: "DE12 3456" },
      ctx,
    );
    const parsed = JSON.parse(result);
    expect(parsed.needs_confirmation).toBe(true);
    expect(parsed.existing_value).toBeNull();
    expect(parsed.label).toBe("IBAN");
  });

  it("does not overwrite a differently named number on the same document", async () => {
    // One document can carry the Steuer-ID of two people. Without a
    // matching label, saving must add — never guess which one to replace.
    const ctx = makeSaveFactCtx({
      doc: { id: "doc-1", title: "Steuerbescheid" },
      existingFacts: [
        { id: "fact-1", label: "Steuer-ID Emma", value: "12 345 678 901" },
      ],
    });
    const result = await executeTool(
      "save_document_fact",
      {
        document_id: "doc-1",
        label: "Steuer-ID Hanna",
        value: "74 031 832 353",
        confirmed: true,
      },
      ctx,
    );
    const parsed = JSON.parse(result);
    expect(parsed.action).toBe("added");
    expect(ctx.inserted).toHaveLength(1);
    expect(ctx.updated).toHaveLength(0);
  });

  it("adds a new fact when the document has none by that name", async () => {
    const ctx = makeSaveFactCtx({ doc: { id: "doc-1", title: "Rechnung Waschmaschine" } });
    const result = await executeTool(
      "save_document_fact",
      {
        document_id: "doc-1",
        label: "Seriennummer Waschmaschine",
        value: "WM-482-B93816",
        confirmed: true,
      },
      ctx,
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.action).toBe("added");
    expect(ctx.inserted).toHaveLength(1);
    expect(ctx.inserted[0]).toMatchObject({
      fact_type: "identifier",
      label: "Seriennummer Waschmaschine",
      value: "WM-482-B93816",
      normalized_value: "wm482b93816",
      confirmed: true,
    });
  });

  it("corrects the existing fact of the same name instead of duplicating", async () => {
    const ctx = makeSaveFactCtx({
      doc: { id: "doc-1", title: "Rechnung Waschmaschine" },
      existingFacts: [{ id: "fact-1", label: "Seriennummer", value: "WM-4B2" }],
    });
    const result = await executeTool(
      "save_document_fact",
      { document_id: "doc-1", label: "seriennummer", value: "WM-482", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.action).toBe("corrected");
    expect(parsed.message).toContain("WM-4B2");
    expect(ctx.updated).toHaveLength(1);
    expect(ctx.inserted).toHaveLength(0);
  });

  it("rejects a save without a value", async () => {
    const ctx = makeSaveFactCtx({ doc: { id: "doc-1", title: "Doc" } });
    const result = await executeTool(
      "save_document_fact",
      { document_id: "doc-1", label: "Kundennummer", confirmed: true },
      ctx,
    );
    expect(JSON.parse(result).error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// query_payments
// ---------------------------------------------------------------------------

/**
 * Build a context whose `extracted_entities` query resolves to the given
 * amount rows and whose `documents` query resolves to the given documents.
 */
function makeCtxWithAmounts(
  amountRows: Array<Record<string, unknown>>,
  documents: Array<Record<string, unknown>>,
  amountsError: unknown = null,
) {
  function builder(result: { data: unknown; error: unknown }) {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "not", "gte", "lte", "in", "order", "limit"]) {
      chain[m] = vi.fn(() => chain);
    }
    chain.then = (resolve: (v: unknown) => void) =>
      Promise.resolve(result).then(resolve);
    return chain;
  }

  return {
    client: {
      from: vi.fn((table: string) => {
        if (table === "extracted_entities") {
          return builder({
            data: amountsError ? null : amountRows,
            error: amountsError,
          });
        }
        // Mirror the real query: the executor asks for confirmed documents
        // only, so the mock must not hand back drafts.
        return builder({
          data: documents.filter((d) => d.status === "confirmed"),
          error: null,
        });
      }),
    } as unknown as ToolContext["client"],
    familyId: "fam-1",
    sources: [] as ChatSource[],
    speakerName: null,
  } as ToolContext;
}

describe("query_payments", () => {
  const rows = [
    {
      document_id: "doc-1",
      label: "Bereits gezahlt",
      amount_minor: 1000,
      currency: "EUR",
      amount_kind: "paid",
      value_date: "2026-07-12",
    },
    {
      document_id: "doc-1",
      label: "Gesamtbetrag",
      amount_minor: 8800,
      currency: "EUR",
      amount_kind: "total",
      value_date: null,
    },
  ];
  const documents = [
    { id: "doc-1", title: "Abschiedssammlung", category: "Kita", status: "confirmed" },
  ];

  it("sums server-side so the model never adds excerpt numbers itself", async () => {
    const ctx = makeCtxWithAmounts(rows, documents);
    const result = JSON.parse(await executeTool("query_payments", {}, ctx));

    expect(result.anzahl).toBe(2);
    // Never one number across kinds: 88,00 total + 10,00 paid is not
    // 98,00 — that figure is neither the invoice nor the payment.
    expect(result.summen).toEqual(
      expect.arrayContaining([
        { art: "Bereits gezahlt", currency: "EUR", wert: "10,00 EUR", anzahl: 1 },
        { art: "Gesamtbetrag", currency: "EUR", wert: "88,00 EUR", anzahl: 1 },
      ]),
    );
    expect(result.summen).toHaveLength(2);
    // And the model is told not to add them.
    expect(result.hinweis).toMatch(/NICHT/);
  });

  it("adds up several amounts of the SAME kind", async () => {
    const instalments = [
      { ...rows[0], amount_minor: 5000, value_date: "2026-06-01" },
      { ...rows[0], amount_minor: 5000, value_date: "2026-07-01" },
    ];
    const ctx = makeCtxWithAmounts(instalments, documents);
    const result = JSON.parse(
      await executeTool("query_payments", { kind: "paid" }, ctx),
    );

    expect(result.summen).toEqual([
      { art: "Bereits gezahlt", currency: "EUR", wert: "100,00 EUR", anzahl: 2 },
    ]);
    // One semantic group, so there is nothing to warn about.
    expect(result.hinweis).toBeUndefined();
  });

  it("leaves unconfirmed documents out of money answers", async () => {
    // The analyze step writes amount rows before the user reviews anything.
    const draft = [
      { id: "doc-2", title: "Noch nicht geprueft", category: "Kita", status: "analyzed" },
    ];
    const ctx = makeCtxWithAmounts(
      [{ ...rows[0], document_id: "doc-2" }],
      draft,
    );
    const result = JSON.parse(await executeTool("query_payments", {}, ctx));
    expect(result.betraege).toEqual([]);
  });

  it("returns the payment date and meaning with each amount", async () => {
    const ctx = makeCtxWithAmounts(rows, documents);
    const result = JSON.parse(await executeTool("query_payments", {}, ctx));

    const paid = result.betraege.find(
      (b: { art: string }) => b.art === "Bereits gezahlt",
    );
    expect(paid).toMatchObject({
      betrag: "10,00 EUR",
      datum: "12.07.2026",
      dokument: "Abschiedssammlung",
      sammlung: "Kita",
    });
  });

  it("filters by collection", async () => {
    const ctx = makeCtxWithAmounts(rows, documents);
    const result = JSON.parse(
      await executeTool("query_payments", { category: "Versicherung" }, ctx),
    );
    expect(result.betraege).toEqual([]);
  });

  it("keeps currencies apart instead of adding them together", async () => {
    const mixed = [
      { ...rows[0], amount_minor: 1000, currency: "EUR" },
      { ...rows[0], amount_minor: 2000, currency: "CHF" },
    ];
    const ctx = makeCtxWithAmounts(mixed, documents);
    const result = JSON.parse(await executeTool("query_payments", {}, ctx));

    expect(result.summen).toHaveLength(2);
    expect(result.summen).toEqual(
      expect.arrayContaining([
        { art: "Bereits gezahlt", currency: "EUR", wert: "10,00 EUR", anzahl: 1 },
        { art: "Bereits gezahlt", currency: "CHF", wert: "20,00 CHF", anzahl: 1 },
      ]),
    );
  });

  it("explains an empty result instead of implying there were no payments", async () => {
    const ctx = makeCtxWithAmounts([], documents);
    const result = JSON.parse(await executeTool("query_payments", {}, ctx));
    expect(result.betraege).toEqual([]);
    expect(result.hinweis).toMatch(/vor der Einfuehrung/);
  });

  it("reports a read failure rather than answering with nothing", async () => {
    const ctx = makeCtxWithAmounts([], documents, { message: "boom" });
    const result = JSON.parse(await executeTool("query_payments", {}, ctx));
    expect(result.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// update_task confirmation gate
// ---------------------------------------------------------------------------

/**
 * Ctx for update_task: `.from("tasks")` resolves the task lookup and
 * captures the update payload, `.from("family_members")` resolves the
 * optional assignee lookup.
 */
function makeUpdateTaskCtx({
  task = null,
  member = null,
  updateError = null,
}: {
  task?: { id: string; title: string; status?: string } | null;
  member?: { id: string; name: string } | null;
  updateError?: unknown;
} = {}) {
  let capturedUpdate: Record<string, unknown> | null = null;

  const updateThenable: {
    eq: ReturnType<typeof vi.fn>;
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise<unknown>;
  } = {
    eq: vi.fn(),
    then: (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: null, error: updateError }).then(resolve),
  };
  updateThenable.eq.mockReturnValue(updateThenable);

  const from = vi.fn((table: string) => {
    if (table === "tasks") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: task, error: null }),
        update: vi.fn((payload: Record<string, unknown>) => {
          capturedUpdate = payload;
          return { eq: vi.fn().mockReturnValue(updateThenable) };
        }),
      };
    }
    if (table === "family_members") {
      return makeThenableChain(member);
    }
    return makeThenableChain(null);
  });

  const ctx = {
    client: { from } as unknown as ToolContext["client"],
    familyId: "fam-1",
    sources: [] as ChatSource[],
    speakerName: null,
  };

  return { ctx, getUpdate: () => capturedUpdate };
}

describe("update_task confirmation gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes 'update_task' in CONFIRMATION_TOOLS", () => {
    expect(CONFIRMATION_TOOLS.has("update_task")).toBe(true);
  });

  it("returns needs_confirmation with the planned changes when unconfirmed", async () => {
    const { ctx, getUpdate } = makeUpdateTaskCtx({
      task: { id: "task-1", title: "Steuererklaerung" },
    });
    const result = await executeTool(
      "update_task",
      { task_id: "task-1", due_date: "2026-09-01" },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.needs_confirmation).toBe(true);
    expect(parsed.task_title).toBe("Steuererklaerung");
    expect(parsed.aenderungen).toEqual(["Frist: 2026-09-01"]);
    expect(getUpdate()).toBeNull();
  });

  it("returns error when the task is not found", async () => {
    const { ctx } = makeUpdateTaskCtx({ task: null });
    const result = await executeTool(
      "update_task",
      { task_id: "nope", due_date: "2026-09-01", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Aufgabe nicht gefunden.");
  });

  it("returns error when task_id is empty", async () => {
    const { ctx } = makeUpdateTaskCtx();
    const result = await executeTool("update_task", { task_id: "" }, ctx);
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Keine Aufgaben-ID angegeben.");
  });

  it("returns error when no field to change is given", async () => {
    const { ctx } = makeUpdateTaskCtx({
      task: { id: "task-1", title: "Test" },
    });
    const result = await executeTool(
      "update_task",
      { task_id: "task-1", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain("Keine Aenderung angegeben");
  });

  it("applies only the provided fields when confirmed", async () => {
    const { ctx, getUpdate } = makeUpdateTaskCtx({
      task: { id: "task-1", title: "Steuererklaerung" },
    });
    const result = await executeTool(
      "update_task",
      { task_id: "task-1", due_date: "2026-09-01", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(getUpdate()).toEqual({ due_date: "2026-09-01" });
  });

  it("clears the due date when due_date is an empty string", async () => {
    const { ctx, getUpdate } = makeUpdateTaskCtx({
      task: { id: "task-1", title: "Test" },
    });
    await executeTool(
      "update_task",
      { task_id: "task-1", due_date: "", confirmed: true },
      ctx,
    );

    expect(getUpdate()).toEqual({ due_date: null });
  });

  it("reopens a done task via status 'open'", async () => {
    const { ctx, getUpdate } = makeUpdateTaskCtx({
      task: { id: "task-1", title: "Test", status: "done" },
    });
    const result = await executeTool(
      "update_task",
      { task_id: "task-1", status: "open", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(getUpdate()).toEqual({ status: "open" });
    expect(parsed.aenderungen).toEqual(["wieder geoeffnet"]);
  });

  it("resolves assignee_name to the member id", async () => {
    const { ctx, getUpdate } = makeUpdateTaskCtx({
      task: { id: "task-1", title: "Test" },
      member: { id: "member-5", name: "Emma" },
    });
    await executeTool(
      "update_task",
      { task_id: "task-1", assignee_name: "Emma", confirmed: true },
      ctx,
    );

    expect(getUpdate()).toEqual({ assigned_to: "member-5" });
  });

  it("returns error for an unknown assignee instead of clearing it", async () => {
    const { ctx, getUpdate } = makeUpdateTaskCtx({
      task: { id: "task-1", title: "Test" },
      member: null,
    });
    const result = await executeTool(
      "update_task",
      { task_id: "task-1", assignee_name: "Unbekannt", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain("Unbekannt");
    expect(getUpdate()).toBeNull();
  });

  it("returns error on update failure", async () => {
    const { ctx } = makeUpdateTaskCtx({
      task: { id: "task-1", title: "Test" },
      updateError: { message: "RLS denied" },
    });
    const result = await executeTool(
      "update_task",
      { task_id: "task-1", title: "Neuer Titel", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Aufgabe konnte nicht aktualisiert werden.");
  });
});

// ---------------------------------------------------------------------------
// create_collection confirmation gate
// ---------------------------------------------------------------------------

/**
 * Ctx for create_collection: `.from("collections")` captures the insert
 * payload and resolves the select/single chain.
 */
function makeCollectionCtx({
  inserted = null,
  insertError = null,
}: {
  inserted?: { id: string; name: string } | null;
  insertError?: { code?: string; message?: string } | null;
} = {}) {
  let capturedInsert: Record<string, unknown> | null = null;

  const from = vi.fn((table: string) => {
    if (table === "collections") {
      return {
        insert: vi.fn((payload: Record<string, unknown>) => {
          capturedInsert = payload;
          return {
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: insertError ? null : inserted,
                error: insertError,
              }),
            })),
          };
        }),
      };
    }
    return makeThenableChain(null);
  });

  const ctx = {
    client: { from } as unknown as ToolContext["client"],
    familyId: "fam-1",
    sources: [] as ChatSource[],
    speakerName: null,
  };

  return { ctx, getInsert: () => capturedInsert };
}

describe("create_collection confirmation gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes 'create_collection' in CONFIRMATION_TOOLS", () => {
    expect(CONFIRMATION_TOOLS.has("create_collection")).toBe(true);
  });

  it("returns needs_confirmation when confirmed is missing, without inserting", async () => {
    const { ctx, getInsert } = makeCollectionCtx();
    const result = await executeTool(
      "create_collection",
      { name: "Steuer 2026" },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.needs_confirmation).toBe(true);
    expect(parsed.collection_name).toBe("Steuer 2026");
    expect(getInsert()).toBeNull();
  });

  it("returns error when name is empty", async () => {
    const { ctx, getInsert } = makeCollectionCtx();
    const result = await executeTool(
      "create_collection",
      { name: "  ", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Kein Name angegeben.");
    expect(getInsert()).toBeNull();
  });

  it("inserts into the ACTIVE chat family with default icon and color", async () => {
    const { ctx, getInsert } = makeCollectionCtx({
      inserted: { id: "col-1", name: "Steuer 2026" },
    });
    const result = await executeTool(
      "create_collection",
      { name: "Steuer 2026", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    // The family binding is the P1 regression guard: the collection must
    // land in ctx.familyId, not in an arbitrary RLS-visible family.
    expect(getInsert()).toEqual({
      family_id: "fam-1",
      name: "Steuer 2026",
      icon: "file-text",
      color: "petrol",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.collection_id).toBe("col-1");
  });

  it("passes a chosen icon and color through", async () => {
    const { ctx, getInsert } = makeCollectionCtx({
      inserted: { id: "col-2", name: "Finanzen" },
    });
    await executeTool(
      "create_collection",
      { name: "Finanzen", icon: "wallet", color: "apricot", confirmed: true },
      ctx,
    );

    expect(getInsert()).toMatchObject({ icon: "wallet", color: "apricot" });
  });

  it("rejects an invalid icon via the shared validation", async () => {
    const { ctx, getInsert } = makeCollectionCtx();
    const result = await executeTool(
      "create_collection",
      { name: "Finanzen", icon: "rocket", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Ungültiges Icon");
    expect(getInsert()).toBeNull();
  });

  it("returns a friendly error on duplicate name (unique violation)", async () => {
    const { ctx } = makeCollectionCtx({
      insertError: { code: "23505", message: "duplicate key" },
    });
    const result = await executeTool(
      "create_collection",
      { name: "Rechnungen", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Diese Sammlung gibt es schon.");
  });

  it("returns a generic error on other insert failures", async () => {
    const { ctx } = makeCollectionCtx({
      insertError: { message: "RLS denied" },
    });
    const result = await executeTool(
      "create_collection",
      { name: "Rechnungen", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Sammlung konnte nicht angelegt werden.");
  });
});

// ---------------------------------------------------------------------------
// create_note confirmation gate
// ---------------------------------------------------------------------------

/**
 * Ctx for create_note: the client carries `auth.getUser`, `.from("documents")`
 * supports the insert (select/single) and the confirmed-note analysis transition
 * (update/eq/eq/select/maybeSingle), `.from("document_pages")` the page insert.
 */
/** The payload of the most recent documents insert, for assertions. */
let capturedNoteInsert: Record<string, unknown> | null = null;

function makeNoteCtx({
  user = { id: "user-1" } as { id: string } | null,
  insertError = null,
}: {
  user?: { id: string } | null;
  insertError?: unknown;
} = {}): ToolContext {
  capturedNoteInsert = null;
  const from = vi.fn((table: string) => {
    if (table === "documents") {
      return {
        insert: vi.fn((payload: Record<string, unknown>) => {
          capturedNoteInsert = payload;
          return {
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: insertError ? null : { id: "note-1" },
                error: insertError,
              }),
            })),
          };
        }),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                maybeSingle: vi
                  .fn()
                  .mockResolvedValue({ data: { id: "note-1" }, error: null }),
              })),
            })),
          })),
        })),
      };
    }
    if (table === "document_pages") {
      return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
    }
    return makeThenableChain(null);
  });

  return {
    client: {
      from,
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      },
    } as unknown as ToolContext["client"],
    familyId: "fam-1",
    sources: [] as ChatSource[],
    speakerName: null,
  };
}

describe("create_note confirmation gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (performAnalyzeStep as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  it("includes 'create_note' in CONFIRMATION_TOOLS", () => {
    expect(CONFIRMATION_TOOLS.has("create_note")).toBe(true);
  });

  it("returns needs_confirmation when confirmed is missing, without inserting", async () => {
    const ctx = makeNoteCtx();
    const result = await executeTool(
      "create_note",
      { title: "WLAN", content: "Passwort haengt am Kuehlschrank" },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.needs_confirmation).toBe(true);
    expect(parsed.note_title).toBe("WLAN");
    expect(ctx.client.from).not.toHaveBeenCalled();
  });

  it("returns error when title or content is empty", async () => {
    const ctx = makeNoteCtx();
    const noTitle = JSON.parse(
      await executeTool(
        "create_note",
        { title: " ", content: "Text", confirmed: true },
        ctx,
      ),
    );
    const noContent = JSON.parse(
      await executeTool(
        "create_note",
        { title: "Titel", content: " ", confirmed: true },
        ctx,
      ),
    );

    expect(noTitle.error).toBe("Kein Titel angegeben.");
    expect(noContent.error).toBe("Kein Notiztext angegeben.");
  });

  it("rejects an over-long title", async () => {
    const ctx = makeNoteCtx();
    const result = JSON.parse(
      await executeTool(
        "create_note",
        { title: "x".repeat(201), content: "Text", confirmed: true },
        ctx,
      ),
    );

    expect(result.error).toContain("zu lang");
  });

  it("keeps a manually supplied note confirmed while it is analyzed", async () => {
    const ctx = makeNoteCtx();
    const result = await executeTool(
      "create_note",
      { title: "WLAN", content: "Passwort haengt am Kuehlschrank", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.analysiert).toBe(true);
    expect(ctx.client.from).toHaveBeenCalledWith("documents");
    expect(ctx.client.from).toHaveBeenCalledWith("document_pages");
    expect(performAnalyzeStep).toHaveBeenCalledWith(
      ctx.client,
      expect.objectContaining({
        family_id: "fam-1",
        ocr_text: "Passwort haengt am Kuehlschrank",
        wasConfirmed: true,
      }),
    );
  });

  it("keeps the user's note title out of the model's hands", async () => {
    const ctx = makeNoteCtx();
    await executeTool(
      "create_note",
      { title: "WLAN", content: "Passwort haengt am Kuehlschrank", confirmed: true },
      ctx,
    );

    expect(performAnalyzeStep).toHaveBeenCalledWith(
      ctx.client,
      expect.objectContaining({ source: "manual", title: "WLAN" }),
    );
  });

  it("keeps the note confirmed when the analysis fails", async () => {
    (performAnalyzeStep as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("OpenAI down"),
    );
    const ctx = makeNoteCtx();
    const result = await executeTool(
      "create_note",
      { title: "WLAN", content: "Text", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.analysiert).toBe(false);
    // The note itself is intact — only the enrichment failed, so it must
    // not be flagged as failed in the document list.
    expect(markDocumentFailed).not.toHaveBeenCalled();
    expect(restoreConfirmedAfterAnalysisFailure).toHaveBeenCalled();
  });

  it("marks the note failed when the enrichment broke mid-write", async () => {
    // A destructive failure can leave the note's stored results
    // half-replaced — the visible failed state is what gets it retried.
    (performAnalyzeStep as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new PipelineStepError("Speichern fehlgeschlagen", "DB_STORE_FAILED", {
        destructive: true,
      }),
    );
    const ctx = makeNoteCtx();
    const result = await executeTool(
      "create_note",
      { title: "WLAN", content: "Text", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.analysiert).toBe(false);
    expect(markDocumentFailed).toHaveBeenCalled();
    expect(restoreConfirmedAfterAnalysisFailure).not.toHaveBeenCalled();
  });

  it("returns error when the insert fails", async () => {
    const ctx = makeNoteCtx({ insertError: { message: "db error" } });
    const result = await executeTool(
      "create_note",
      { title: "WLAN", content: "Text", confirmed: true },
      ctx,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Notiz konnte nicht gespeichert werden.");
    expect(performAnalyzeStep).not.toHaveBeenCalled();
  });

  it("stores a plain note as type 'other' and lets the analysis reclassify", async () => {
    const ctx = makeNoteCtx();
    await executeTool(
      "create_note",
      { title: "WLAN", content: "Text", confirmed: true },
      ctx,
    );

    expect(capturedNoteInsert).toMatchObject({ document_type: "other" });
    // No type pinned → the analysis is free to classify the note.
    expect(performAnalyzeStep).toHaveBeenCalledWith(
      ctx.client,
      expect.objectContaining({ document_type: undefined }),
    );
  });
});

// ---------------------------------------------------------------------------
// create_note — Zugangsdaten
// ---------------------------------------------------------------------------

describe("create_note with document_type 'credentials'", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (performAnalyzeStep as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  it("asks for confirmation in the language of a login", async () => {
    const ctx = makeNoteCtx();
    const parsed = JSON.parse(
      await executeTool(
        "create_note",
        { title: "Netflix", document_type: "credentials", url: "https://netflix.com" },
        ctx,
      ),
    );

    expect(parsed.needs_confirmation).toBe(true);
    expect(parsed.message).toContain("Zugangsdaten 'Netflix'");
  });

  it("folds URL and user name into the body, exactly like the form", async () => {
    const ctx = makeNoteCtx();
    await executeTool(
      "create_note",
      {
        title: "Netflix",
        document_type: "credentials",
        url: "https://www.netflix.com",
        username: "familie@example.de",
        content: "Familienaccount",
        confirmed: true,
      },
      ctx,
    );

    expect(capturedNoteInsert).toMatchObject({
      document_type: "credentials",
      ocr_text:
        "- **URL:** https://www.netflix.com\n" +
        "- **Benutzername:** familie@example.de\n\n" +
        "Familienaccount",
    });
    // The chat never carries a password — the column stays untouched.
    expect(capturedNoteInsert).not.toHaveProperty("secret");
  });

  it("saves a login that has nothing but a name", async () => {
    const ctx = makeNoteCtx();
    const parsed = JSON.parse(
      await executeTool(
        "create_note",
        { title: "WLAN", document_type: "credentials", confirmed: true },
        ctx,
      ),
    );

    expect(parsed.success).toBe(true);
    expect(capturedNoteInsert).toMatchObject({ ocr_text: "Zugangsdaten WLAN" });
  });

  it("pins the type so the analysis cannot reclassify the login", async () => {
    const ctx = makeNoteCtx();
    await executeTool(
      "create_note",
      { title: "Netflix", document_type: "credentials", username: "a@b.de", confirmed: true },
      ctx,
    );

    expect(performAnalyzeStep).toHaveBeenCalledWith(
      ctx.client,
      expect.objectContaining({ document_type: "credentials" }),
    );
  });

  it("tells the user where the password goes", async () => {
    const ctx = makeNoteCtx();
    const parsed = JSON.parse(
      await executeTool(
        "create_note",
        { title: "Netflix", document_type: "credentials", username: "a@b.de", confirmed: true },
        ctx,
      ),
    );

    expect(parsed.message).toContain("Dokument");
    expect(parsed.message).toContain("Passwort");
  });

  it("falls back to 'other' for an unknown type", async () => {
    const ctx = makeNoteCtx();
    await executeTool(
      "create_note",
      { title: "Notiz", content: "Text", document_type: "nonsense", confirmed: true },
      ctx,
    );

    expect(capturedNoteInsert).toMatchObject({ document_type: "other" });
  });
});

// ---------------------------------------------------------------------------
// add_calendar_event
// ---------------------------------------------------------------------------

/**
 * Ctx for add_calendar_event: `.from("calendar_events")` supports the
 * insert → select → single chain, `.from("family_members")` resolves the
 * attendee name lookup, `.from("calendar_event_attendees")` captures the
 * attendee insert.
 */
function makeCalendarCtx({
  insertedEvent,
  members = [],
}: {
  insertedEvent: { id: string; title: string } | null;
  members?: Array<{ id: string; name: string }>;
}) {
  const single = vi.fn().mockResolvedValue({
    data: insertedEvent,
    error: insertedEvent ? null : { message: "insert failed" },
  });
  const insert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
  const attendeesInsert = vi.fn().mockResolvedValue({ error: null });

  const from = vi.fn((table: string) => {
    if (table === "calendar_events") return { insert };
    if (table === "family_members") return makeThenableChain(members);
    if (table === "calendar_event_attendees") return { insert: attendeesInsert };
    return makeThenableChain(null);
  });

  return {
    ctx: {
      client: { from } as unknown as ToolContext["client"],
      familyId: "fam-1",
      sources: [] as ChatSource[],
      speakerName: null,
    } as ToolContext,
    insert,
    attendeesInsert,
  };
}

describe("add_calendar_event", () => {
  it("carries the full proposal in the confirmation payload", async () => {
    const { ctx, insert } = makeCalendarCtx({ insertedEvent: null });
    const result = JSON.parse(
      await executeTool(
        "add_calendar_event",
        {
          title: "Zahnarzt Emma",
          starts_on: "2026-08-12",
          ends_on: "2026-08-12",
          all_day: false,
          starts_time: "15:00",
          ends_time: "15:30",
          recurrence: "weekly",
          attendee_names: ["Emma"],
          confirmed: false,
        },
        ctx,
      ),
    );

    expect(result).toMatchObject({
      needs_confirmation: true,
      event_title: "Zahnarzt Emma",
      starts_on: "2026-08-12",
      ends_on: "2026-08-12",
      all_day: false,
      starts_time: "15:00",
      ends_time: "15:30",
      recurrence: "weekly",
      attendee_names: ["Emma"],
    });
    // Nothing is written before confirmation.
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a timed event without both times instead of inserting garbage", async () => {
    const { ctx, insert } = makeCalendarCtx({ insertedEvent: null });
    const result = JSON.parse(
      await executeTool(
        "add_calendar_event",
        {
          title: "Zahnarzt",
          starts_on: "2026-08-12",
          all_day: false,
          confirmed: true,
        },
        ctx,
      ),
    );

    expect(result.error).toMatch(/Uhrzeit/);
    expect(insert).not.toHaveBeenCalled();
  });

  it("inserts an all-day event with null times and writes attendees", async () => {
    const { ctx, insert, attendeesInsert } = makeCalendarCtx({
      insertedEvent: { id: "ev-1", title: "Herbstferien" },
      members: [{ id: "m-1", name: "Emma" }],
    });
    const result = JSON.parse(
      await executeTool(
        "add_calendar_event",
        {
          title: "Herbstferien",
          starts_on: "2026-10-12",
          ends_on: "2026-10-18",
          attendee_names: ["Emma"],
          confirmed: true,
        },
        ctx,
      ),
    );

    expect(result.success).toBe(true);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        family_id: "fam-1",
        title: "Herbstferien",
        starts_on: "2026-10-12",
        ends_on: "2026-10-18",
        all_day: true,
        starts_time: null,
        ends_time: null,
        recurrence: "none",
      }),
    );
    expect(attendeesInsert).toHaveBeenCalledWith([
      { event_id: "ev-1", family_member_id: "m-1" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// query_calendar_events
// ---------------------------------------------------------------------------

/**
 * Ctx for query_calendar_events: `.from("calendar_events")` resolves to the
 * event rows, `.from("family_members")` and `.from("calendar_event_attendees")`
 * resolve the person filter and attendee enrichment.
 */
function makeCalendarQueryCtx({
  events = [],
  members = [],
  attendees = [],
}: {
  events?: Array<Record<string, unknown>>;
  members?: Array<{ id: string; name: string }>;
  attendees?: Array<{ event_id: string; family_member_id: string }>;
}) {
  const from = vi.fn((table: string) => {
    if (table === "calendar_events") return makeThenableChain(events);
    if (table === "family_members") return makeThenableChain(members);
    if (table === "calendar_event_attendees") return makeThenableChain(attendees);
    return makeThenableChain(null);
  });

  return {
    client: { from } as unknown as ToolContext["client"],
    familyId: "fam-1",
    sources: [] as ChatSource[],
    speakerName: null,
  } as ToolContext;
}

const DENTIST_EVENT = {
  id: "ev-1",
  title: "Zahnarzt Emma",
  note: "Kontrolle",
  starts_on: "2026-07-10",
  ends_on: "2026-07-10",
  all_day: false,
  starts_time: "15:00",
  ends_time: "15:30",
  recurrence: "none",
  recurrence_until: null,
  recurrence_exceptions: [],
};

describe("query_calendar_events", () => {
  it("returns matching events with dates, time and attendee names", async () => {
    const ctx = makeCalendarQueryCtx({
      events: [DENTIST_EVENT],
      members: [{ id: "m-1", name: "Emma" }],
      attendees: [{ event_id: "ev-1", family_member_id: "m-1" }],
    });
    const result = JSON.parse(
      await executeTool(
        "query_calendar_events",
        { query: "Zahnarzt", direction: "past" },
        ctx,
      ),
    );

    expect(result.heute).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      titel: "Zahnarzt Emma",
      notiz: "Kontrolle",
      von: "2026-07-10",
      uhrzeit: "15:00–15:30",
      wiederholung: "einmalig",
      teilnehmer: ["Emma"],
    });
    expect(result.events[0].bis).toBeUndefined();
  });

  it("filters events by person via the attendee join", async () => {
    const ctx = makeCalendarQueryCtx({
      events: [
        DENTIST_EVENT,
        { ...DENTIST_EVENT, id: "ev-2", title: "Elternabend" },
      ],
      members: [{ id: "m-1", name: "Emma" }],
      attendees: [{ event_id: "ev-1", family_member_id: "m-1" }],
    });
    const result = JSON.parse(
      await executeTool(
        "query_calendar_events",
        { person: "Emma", direction: "all" },
        ctx,
      ),
    );

    expect(result.events).toHaveLength(1);
    expect(result.events[0].titel).toBe("Zahnarzt Emma");
  });

  it("applies the attendee ids to the calendar query before limiting results", async () => {
    const ctx = makeCalendarQueryCtx({
      events: [DENTIST_EVENT],
      members: [{ id: "m-1", name: "Emma" }],
      attendees: [{ event_id: "ev-1", family_member_id: "m-1" }],
    });
    await executeTool(
      "query_calendar_events",
      { person: "Emma", direction: "all" },
      ctx,
    );

    const calendarQuery = (ctx.client.from as ReturnType<typeof vi.fn>).mock.results
      .find((result) => result.value?.select?.mock?.calls?.[0]?.[0]?.includes("starts_on"))
      ?.value;
    expect(calendarQuery.in).toHaveBeenCalledWith("id", ["ev-1"]);
    expect(calendarQuery.limit).toHaveBeenCalledWith(500);
  });

  it("expands an older recurring event to its next occurrence", async () => {
    const ctx = makeCalendarQueryCtx({
      events: [{
        ...DENTIST_EVENT,
        id: "ev-recurring",
        title: "Klavierunterricht",
        starts_on: "2020-01-06",
        ends_on: "2020-01-06",
        recurrence: "weekly",
      }],
    });
    const result = JSON.parse(
      await executeTool("query_calendar_events", { direction: "upcoming" }, ctx),
    );

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      titel: "Klavierunterricht",
      wiederholung: "wöchentlich",
    });
    expect(result.events[0].von >= result.heute).toBe(true);
  });

  it("resolves recurring events inside an all-direction date range", async () => {
    const ctx = makeCalendarQueryCtx({
      events: [{
        ...DENTIST_EVENT,
        id: "ev-recurring-range",
        title: "Klavierunterricht",
        starts_on: "2020-01-06",
        ends_on: "2020-01-06",
        recurrence: "weekly",
      }],
    });
    const result = JSON.parse(
      await executeTool(
        "query_calendar_events",
        {
          direction: "all",
          from: "2026-08-01",
          to: "2026-08-31",
        },
        ctx,
      ),
    );

    expect(result.events).toHaveLength(1);
    expect(result.events[0].von).toMatch(/^2026-08-/);
  });

  it("includes multi-day recurring occurrences overlapping an all-range", async () => {
    const ctx = makeCalendarQueryCtx({
      events: [{
        ...DENTIST_EVENT,
        id: "ev-recurring-overlap",
        title: "Wochenendseminar",
        starts_on: "2020-01-06",
        ends_on: "2020-01-08",
        recurrence: "weekly",
      }],
    });
    const result = JSON.parse(
      await executeTool(
        "query_calendar_events",
        {
          direction: "all",
          from: "2026-08-04",
          to: "2026-08-04",
        },
        ctx,
      ),
    );

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      von: "2026-08-03",
      bis: "2026-08-05",
    });
  });

  it("uses Berlin's date at the UTC day boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T22:30:00Z"));
    const ctx = makeCalendarQueryCtx({ events: [] });

    const result = JSON.parse(
      await executeTool("query_calendar_events", { direction: "upcoming" }, ctx),
    );

    expect(result.heute).toBe("2026-08-13");
    vi.useRealTimers();
  });

  it("says so when the named family member does not exist", async () => {
    const ctx = makeCalendarQueryCtx({ members: [] });
    const result = JSON.parse(
      await executeTool(
        "query_calendar_events",
        { person: "Zoe" },
        ctx,
      ),
    );

    expect(result.events).toEqual([]);
    expect(result.message).toContain("Zoe");
  });

  it("says so when nothing matches", async () => {
    const ctx = makeCalendarQueryCtx({ events: [] });
    const result = JSON.parse(
      await executeTool(
        "query_calendar_events",
        { query: "Zahnarzt" },
        ctx,
      ),
    );

    expect(result.events).toEqual([]);
    expect(result.message).toMatch(/Keine passenden Termine/);
  });

  it("labels multi-day and all-day events without a time", async () => {
    const ctx = makeCalendarQueryCtx({
      events: [{
        ...DENTIST_EVENT,
        id: "ev-3",
        title: "Herbstferien",
        starts_on: "2026-10-12",
        ends_on: "2026-10-18",
        all_day: true,
        starts_time: null,
        ends_time: null,
        recurrence: "yearly",
      }],
    });
    const result = JSON.parse(
      await executeTool("query_calendar_events", { direction: "upcoming" }, ctx),
    );

    expect(result.events[0]).toMatchObject({
      bis: "2026-10-18",
      uhrzeit: "ganztägig",
      wiederholung: "jährlich",
    });
  });
});
