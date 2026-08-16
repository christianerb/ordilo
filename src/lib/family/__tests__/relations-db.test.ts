import { describe, it, expect } from "vitest";
import { saveMemberRelations } from "@/lib/family/relations-db";
import type { createClient } from "@/lib/supabase/server";

/**
 * The reciprocal half of `saveMemberRelations`: setting "Karina ist Mutter
 * von Emma" has to leave "Emma ist Kind von Karina" behind, and removing it
 * has to take that away again.
 *
 * Backed by a tiny in-memory stand-in for the two tables involved — the
 * mirroring logic is what is under test, not Supabase's query builder.
 */

interface RelationRow {
  id: string;
  family_id: string;
  member_id: string;
  related_member_id: string | null;
  role: string;
  sort_order: number;
}

interface MemberRow {
  id: string;
  role: string | null;
}

function fakeClient(initial: {
  relations?: Omit<RelationRow, "id" | "family_id">[];
  members?: MemberRow[];
  /** Make the atomic replacement fail, as a transient database error would. */
  rpcFails?: boolean;
}) {
  let nextId = 1;
  const relations: RelationRow[] = (initial.relations ?? []).map((row) => ({
    id: `rel-${nextId++}`,
    family_id: "fam-1",
    ...row,
  }));
  const members: MemberRow[] = initial.members ?? [];

  /** What the `replace_member_relations` RPC does, in memory. */
  const replaceMemberRelations = (
    memberId: string,
    rows: { related_member_id: string | null; role: string; sort_order: number }[],
  ) => {
    const before = relations
      .filter((row) => row.member_id === memberId)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((row) => ({
        member_id: row.member_id,
        related_member_id: row.related_member_id,
        role: row.role,
        sort_order: row.sort_order,
      }));

    for (let i = relations.length - 1; i >= 0; i--) {
      if (relations[i].member_id === memberId) relations.splice(i, 1);
    }
    for (const row of rows) {
      relations.push({ id: `rel-${nextId++}`, family_id: "fam-1", member_id: memberId, ...row });
    }
    syncPrimaryRole(memberId);
    return before;
  };

  /** The DB-side trigger/function that keeps family_members.role current. */
  const syncPrimaryRole = (memberId: string) => {
    const member = members.find((m) => m.id === memberId);
    if (!member) return;
    const first = relations
      .filter((row) => row.member_id === memberId)
      .sort((a, b) => a.sort_order - b.sort_order)[0];
    member.role = first?.role ?? null;
  };

  const relationsTable = {
    select: () => ({
      // `.eq(...)` is awaited directly by the before-state read.
      eq: (_column: string, value: string) => {
        const data = relations.filter((row) => row.member_id === value);
        return Object.assign(Promise.resolve({ data, error: null }), {
          order: async () => ({ data, error: null }),
        });
      },
      in: async (_column: string, values: string[]) => ({
        data: relations.filter((row) => values.includes(row.member_id)),
        error: null,
      }),
    }),
    insert: async (rows: Omit<RelationRow, "id">[]) => {
      for (const row of rows) {
        relations.push({ id: `rel-${nextId++}`, ...row });
      }
      return { error: null };
    },
    delete: () => ({
      eq: async (_column: string, value: string) => {
        for (let i = relations.length - 1; i >= 0; i--) {
          if (relations[i].member_id === value) relations.splice(i, 1);
        }
        return { error: null };
      },
      in: async (_column: string, ids: string[]) => {
        const owners = new Set(
          relations.filter((row) => ids.includes(row.id)).map((row) => row.member_id),
        );
        for (let i = relations.length - 1; i >= 0; i--) {
          if (ids.includes(relations[i].id)) relations.splice(i, 1);
        }
        // The AFTER DELETE trigger from migration 0064.
        for (const owner of owners) syncPrimaryRole(owner);
        return { error: null };
      },
    }),
  };

  const membersTable = {
    select: () => ({
      in: async (_column: string, ids: string[]) => ({
        data: members.filter((m) => ids.includes(m.id)),
        error: null,
      }),
    }),
    update: (patch: { role: string | null }) => ({
      eq: async (_column: string, id: string) => {
        const member = members.find((m) => m.id === id);
        if (member) member.role = patch.role;
        return { error: null };
      },
    }),
  };

  const client = {
    from: (table: string) =>
      table === "family_member_relations" ? relationsTable : membersTable,
    rpc: async (
      name: string,
      args: {
        p_member_id: string;
        p_relations: {
          related_member_id: string | null;
          role: string;
          sort_order: number;
        }[];
      },
    ) => {
      if (name !== "replace_member_relations") throw new Error(`Unexpected rpc ${name}`);
      if (initial.rpcFails) {
        return { data: null, error: { message: "boom" } };
      }
      return { data: replaceMemberRelations(args.p_member_id, args.p_relations), error: null };
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>;

  return {
    client,
    relations,
    members,
    /** The relations of one member as `role → target` pairs, for assertions. */
    rolesOf: (memberId: string) =>
      relations
        .filter((row) => row.member_id === memberId)
        .map((row) => `${row.role}:${row.related_member_id ?? "-"}`)
        .sort(),
  };
}

describe("saveMemberRelations — the other side", () => {
  it("gives the counterpart the reverse role", async () => {
    const db = fakeClient({
      members: [
        { id: "karina", role: null },
        { id: "emma", role: null },
      ],
    });

    const ok = await saveMemberRelations(db.client, {
      familyId: "fam-1",
      memberId: "karina",
      relations: [{ role: "Mutter", member_ids: ["emma"] }],
    });

    expect(ok).toBe(true);
    expect(db.rolesOf("emma")).toEqual(["Kind:karina"]);
    // The counterpart's primary role follows its new relation.
    expect(db.members.find((m) => m.id === "emma")?.role).toBe("Kind");
  });

  it("uses the family's own wording when the counterpart already has a role", async () => {
    const db = fakeClient({
      relations: [
        { member_id: "emma", related_member_id: null, role: "Tochter", sort_order: 0 },
      ],
      members: [
        { id: "karina", role: null },
        { id: "emma", role: "Tochter" },
      ],
    });

    await saveMemberRelations(db.client, {
      familyId: "fam-1",
      memberId: "karina",
      relations: [{ role: "Mutter", member_ids: ["emma"] }],
    });

    // "Tochter" instead of the neutral "Kind", and the now-redundant role
    // without a counterpart is gone.
    expect(db.rolesOf("emma")).toEqual(["Tochter:karina"]);
  });

  it("mirrors a partner onto a partner", async () => {
    const db = fakeClient({
      members: [
        { id: "karina", role: null },
        { id: "chris", role: null },
      ],
    });

    await saveMemberRelations(db.client, {
      familyId: "fam-1",
      memberId: "karina",
      relations: [{ role: "Partner:in", member_ids: ["chris"] }],
    });

    expect(db.rolesOf("chris")).toEqual(["Partner:in:karina"]);
  });

  it("takes the counterpart away again when the relation is removed", async () => {
    const db = fakeClient({
      relations: [
        { member_id: "karina", related_member_id: "emma", role: "Mutter", sort_order: 0 },
        { member_id: "emma", related_member_id: "karina", role: "Kind", sort_order: 0 },
      ],
      members: [
        { id: "karina", role: "Mutter" },
        { id: "emma", role: "Kind" },
      ],
    });

    await saveMemberRelations(db.client, {
      familyId: "fam-1",
      memberId: "karina",
      relations: [],
    });

    expect(db.rolesOf("emma")).toEqual([]);
    expect(db.members.find((m) => m.id === "emma")?.role).toBeNull();
  });

  it("never overwrites what the other person already says", async () => {
    const db = fakeClient({
      relations: [
        {
          member_id: "emma",
          related_member_id: "karina",
          role: "Patenkind",
          sort_order: 0,
        },
      ],
      members: [
        { id: "karina", role: null },
        { id: "emma", role: "Patenkind" },
      ],
    });

    await saveMemberRelations(db.client, {
      familyId: "fam-1",
      memberId: "karina",
      relations: [{ role: "Mutter", member_ids: ["emma"] }],
    });

    expect(db.rolesOf("emma")).toEqual(["Patenkind:karina"]);
  });

  it("invents no counterpart for a made-up role", async () => {
    const db = fakeClient({
      members: [
        { id: "uta", role: null },
        { id: "emma", role: null },
      ],
    });

    await saveMemberRelations(db.client, {
      familyId: "fam-1",
      memberId: "uta",
      relations: [{ role: "Patentante", member_ids: ["emma"] }],
    });

    expect(db.rolesOf("emma")).toEqual([]);
  });

  it("leaves the counterparts alone when only a plain role is saved", async () => {
    const db = fakeClient({
      members: [
        { id: "karina", role: null },
        { id: "emma", role: "Tochter" },
      ],
    });

    await saveMemberRelations(db.client, {
      familyId: "fam-1",
      memberId: "karina",
      relations: [{ role: "Mutter", member_ids: [] }],
    });

    expect(db.rolesOf("karina")).toEqual(["Mutter:-"]);
    expect(db.rolesOf("emma")).toEqual([]);
    expect(db.members.find((m) => m.id === "emma")?.role).toBe("Tochter");
  });

  it("keeps both sides in step when a role is changed", async () => {
    const db = fakeClient({
      relations: [
        {
          member_id: "karina",
          related_member_id: "chris",
          role: "Schwester",
          sort_order: 0,
        },
        {
          member_id: "chris",
          related_member_id: "karina",
          role: "Geschwister",
          sort_order: 0,
        },
      ],
      members: [
        { id: "karina", role: "Schwester" },
        { id: "chris", role: "Geschwister" },
      ],
    });

    await saveMemberRelations(db.client, {
      familyId: "fam-1",
      memberId: "karina",
      relations: [{ role: "Partner:in", member_ids: ["chris"] }],
    });

    expect(db.rolesOf("chris")).toEqual(["Partner:in:karina"]);
  });
});

describe("saveMemberRelations — failures and ordering", () => {
  it("changes nothing when the atomic replacement fails", async () => {
    const db = fakeClient({
      relations: [
        { member_id: "karina", related_member_id: "emma", role: "Mutter", sort_order: 0 },
      ],
      members: [
        { id: "karina", role: "Mutter" },
        { id: "emma", role: "Kind" },
      ],
      rpcFails: true,
    });

    const ok = await saveMemberRelations(db.client, {
      familyId: "fam-1",
      memberId: "karina",
      relations: [],
    });

    expect(ok).toBe(false);
    // The old relations survive a failed save — no silent data loss.
    expect(db.rolesOf("karina")).toEqual(["Mutter:emma"]);
  });

  it("keeps the counterpart's primary role when replacing their plain role", async () => {
    const db = fakeClient({
      relations: [
        { member_id: "emma", related_member_id: null, role: "Tochter", sort_order: 0 },
        { member_id: "emma", related_member_id: "ben", role: "Schwester", sort_order: 1 },
      ],
      members: [
        { id: "karina", role: null },
        { id: "emma", role: "Tochter" },
        { id: "ben", role: "Bruder" },
      ],
    });

    await saveMemberRelations(db.client, {
      familyId: "fam-1",
      memberId: "karina",
      relations: [{ role: "Mutter", member_ids: ["emma"] }],
    });

    // "Tochter von Karina" takes the place of the plain "Tochter" instead of
    // being appended, so Emma stays a Tochter first and a Schwester second.
    expect(db.rolesOf("emma")).toEqual(["Schwester:ben", "Tochter:karina"]);
    expect(db.members.find((m) => m.id === "emma")?.role).toBe("Tochter");
  });
});
