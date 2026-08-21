import {
  addMember,
  completeOnboarding,
  createFamily,
  listMembers,
} from "../lib/onboarding-actions";

/**
 * Behavioral tests for the onboarding actions against a scripted Supabase
 * mock. They pin the parity-relevant behaviors of the web server actions:
 * idempotent family creation, 23505 race recovery, self-linking, relation
 * rollback, and once-only collection seeding.
 */

const mockGetUser = jest.fn();
const mockRpc = jest.fn();
let mockFromHandler: (table: string) => unknown = () => {
  throw new Error("mockFromHandler not set");
};

jest.mock("../lib/supabase", () => ({
  getSupabase: () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => mockFromHandler(table),
    rpc: mockRpc,
  }),
}));

jest.mock("../lib/analytics", () => ({
  recordProductEvent: jest.fn(async () => {}),
}));

interface Step {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
  count?: number | null;
}

type QueryMock = Record<string, jest.Mock> & {
  then: (resolve: (value: unknown) => void) => void;
};

/** A chainable, awaitable query builder resolving to the scripted step. */
function makeQuery(step: Step): QueryMock {
  const query = {} as QueryMock;
  for (const method of [
    "select",
    "eq",
    "order",
    "limit",
    "insert",
    "update",
    "delete",
  ]) {
    query[method] = jest.fn(() => query);
  }
  query.maybeSingle = jest.fn(async () => ({
    data: step.data ?? null,
    error: step.error ?? null,
  }));
  query.single = query.maybeSingle;
  query.then = (resolve) =>
    resolve({
      data: step.data ?? null,
      error: step.error ?? null,
      count: step.count ?? null,
    });
  return query;
}

/** Returns a from() implementation that serves the queued queries in order. */
function scriptedFrom(...queries: QueryMock[]): jest.Mock {
  const from = jest.fn();
  for (const query of queries) {
    from.mockImplementationOnce(() => query);
  }
  // Extra calls (e.g. product_events) get a benign empty query.
  from.mockImplementation(() => makeQuery({}));
  return from;
}

const USER = { id: "u1" };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: USER } });
  mockRpc.mockResolvedValue({ data: [], error: null });
});

describe("createFamily", () => {
  it("rejects an empty name before touching the database", async () => {
    const from = scriptedFrom();
    mockFromHandler = from;

    const result = await createFamily("   ");

    expect(result).toEqual({
      success: false,
      error: "Bitte gib einen Familiennamen ein",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("returns the existing family instead of creating a duplicate", async () => {
    const precheck = makeQuery({ data: { id: "fam-1", name: "Bestehend" } });
    mockFromHandler = scriptedFrom(precheck);

    const result = await createFamily("Neue Familie");

    expect(result).toEqual({
      success: true,
      data: { id: "fam-1", name: "Bestehend" },
    });
  });

  it("inserts a new family with created_by", async () => {
    const precheck = makeQuery({ data: null });
    const insert = makeQuery({ data: { id: "fam-2", name: "Familie Neu" } });
    mockFromHandler = scriptedFrom(precheck, insert);

    const result = await createFamily("Familie Neu");

    expect(result).toEqual({
      success: true,
      data: { id: "fam-2", name: "Familie Neu" },
    });
    expect(insert.insert).toHaveBeenCalledWith({
      name: "Familie Neu",
      created_by: "u1",
    });
  });

  it("recovers from a 23505 race by re-reading the existing family", async () => {
    const precheck = makeQuery({ data: null });
    const insert = makeQuery({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });
    const reread = makeQuery({ data: { id: "fam-3", name: "Gewonnen" } });
    mockFromHandler = scriptedFrom(precheck, insert, reread);

    const result = await createFamily("Familie Rennen");

    expect(result).toEqual({
      success: true,
      data: { id: "fam-3", name: "Gewonnen" },
    });
  });

  it("requires an authenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const from = scriptedFrom();
    mockFromHandler = from;

    const result = await createFamily("Familie");

    expect(result).toEqual({
      success: false,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    });
    expect(from).not.toHaveBeenCalled();
  });
});

describe("addMember", () => {
  it("links the self-member to the account when nothing is linked yet", async () => {
    const linkCheck = makeQuery({ data: null });
    const insert = makeQuery({
      data: { id: "m1", family_id: "fam-1", name: "Anna" },
    });
    mockFromHandler = scriptedFrom(linkCheck, insert);

    const result = await addMember("fam-1", { name: "Anna", is_self: true });

    expect(result.success).toBe(true);
    expect(insert.insert).toHaveBeenCalledWith(
      expect.objectContaining({ linked_user_id: "u1" }),
    );
  });

  it("does not double-link when a member is already linked", async () => {
    const linkCheck = makeQuery({ data: { id: "m0" } });
    const insert = makeQuery({
      data: { id: "m2", family_id: "fam-1", name: "Anna 2" },
    });
    mockFromHandler = scriptedFrom(linkCheck, insert);

    await addMember("fam-1", { name: "Anna 2", is_self: true });

    expect(insert.insert).toHaveBeenCalledWith(
      expect.objectContaining({ linked_user_id: null }),
    );
  });

  it("mirrors a given role through replace_member_relations", async () => {
    const insert = makeQuery({
      data: { id: "m3", family_id: "fam-1", name: "Karina" },
    });
    mockFromHandler = scriptedFrom(insert);

    const result = await addMember("fam-1", { name: "Karina", role: "Mutter" });

    expect(result.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("replace_member_relations", {
      p_member_id: "m3",
      p_relations: [{ related_member_id: null, role: "Mutter", sort_order: 0 }],
    });
  });

  it("rolls the member insert back when the relation write fails", async () => {
    const insert = makeQuery({
      data: { id: "m4", family_id: "fam-1", name: "Karina" },
    });
    const rollback = makeQuery({});
    mockFromHandler = scriptedFrom(insert, rollback);
    mockRpc.mockResolvedValue({ data: null, error: { message: "rpc down" } });

    const result = await addMember("fam-1", { name: "Karina", role: "Mutter" });

    expect(result).toEqual({
      success: false,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    });
    expect(rollback.delete).toHaveBeenCalled();
  });
});

describe("listMembers", () => {
  it("returns the family's members ordered by creation", async () => {
    const rows = [
      { id: "m1", family_id: "fam-1", name: "Anna" },
      { id: "m2", family_id: "fam-1", name: "Emma" },
    ];
    const query = makeQuery({ data: rows });
    mockFromHandler = scriptedFrom(query);

    const result = await listMembers("fam-1");

    expect(result).toEqual({ success: true, data: rows });
    expect(query.eq).toHaveBeenCalledWith("family_id", "fam-1");
  });

  it("propagates query failures instead of returning an empty list", async () => {
    mockFromHandler = scriptedFrom(
      makeQuery({ data: null, error: { message: "connection lost" } }),
    );

    const result = await listMembers("fam-1");

    expect(result).toEqual({
      success: false,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    });
  });
});

describe("completeOnboarding", () => {
  it("sets the completion marker and seeds the five default collections", async () => {
    const family = makeQuery({ data: { id: "fam-1" } });
    const update = makeQuery({});
    const collectionCount = makeQuery({ count: 0 });
    const seed = makeQuery({});
    mockFromHandler = scriptedFrom(family, update, collectionCount, seed);

    const result = await completeOnboarding("fam-1");

    expect(result).toEqual({ success: true, data: null });
    expect(update.update).toHaveBeenCalledWith(
      expect.objectContaining({
        onboarding_completed_at: expect.any(String),
      }),
    );
    expect(seed.insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: "Rechnungen", family_id: "fam-1" }),
        expect.objectContaining({ name: "Unterlagen", family_id: "fam-1" }),
      ]),
    );
    expect(seed.insert.mock.calls[0][0]).toHaveLength(5);
  });

  it("does not re-seed when the family already has collections", async () => {
    const family = makeQuery({ data: { id: "fam-1" } });
    const update = makeQuery({});
    const collectionCount = makeQuery({ count: 3 });
    mockFromHandler = scriptedFrom(family, update, collectionCount);

    const result = await completeOnboarding("fam-1");

    expect(result.success).toBe(true);
    // Only families + collections-count queries ran; no collections insert.
    const from = mockFromHandler as unknown as jest.Mock;
    const insertIntoCollections = from.mock.results
      .map((r) => r.value as QueryMock)
      .some((q) => q.insert?.mock.calls.length);
    expect(insertIntoCollections).toBe(false);
  });
});
