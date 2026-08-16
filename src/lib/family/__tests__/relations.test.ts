import { describe, it, expect } from "vitest";
import {
  formatRelation,
  formatRelations,
  groupRelationRows,
  groupRelationsByMember,
  joinNames,
  nameMap,
  normalizeRelations,
  primaryRole,
} from "@/lib/family/relations";

describe("normalizeRelations", () => {
  it("drops relations without a role", () => {
    expect(
      normalizeRelations([
        { role: "", member_ids: ["mem-1"] },
        { role: "  ", member_ids: [] },
        { role: "Mutter", member_ids: [] },
      ]),
    ).toEqual([{ role: "Mutter", member_ids: [] }]);
  });

  it("merges the same role entered twice, keeping the first spelling", () => {
    expect(
      normalizeRelations([
        { role: "Mutter", member_ids: ["mem-1"] },
        { role: "mutter", member_ids: ["mem-2", "mem-1"] },
      ]),
    ).toEqual([{ role: "Mutter", member_ids: ["mem-1", "mem-2"] }]);
  });

  it("keeps distinct roles side by side", () => {
    expect(
      normalizeRelations([
        { role: "Mutter", member_ids: ["mem-1"] },
        { role: "Partnerin", member_ids: ["mem-2"] },
      ]),
    ).toEqual([
      { role: "Mutter", member_ids: ["mem-1"] },
      { role: "Partnerin", member_ids: ["mem-2"] },
    ]);
  });
});

describe("groupRelationRows", () => {
  it("groups one row per person into a role with several people", () => {
    expect(
      groupRelationRows([
        { member_id: "m", related_member_id: "mem-2", role: "Mutter", sort_order: 0 },
        { member_id: "m", related_member_id: "mem-3", role: "Mutter", sort_order: 0 },
        { member_id: "m", related_member_id: "mem-4", role: "Partnerin", sort_order: 1 },
      ]),
    ).toEqual([
      { role: "Mutter", member_ids: ["mem-2", "mem-3"] },
      { role: "Partnerin", member_ids: ["mem-4"] },
    ]);
  });

  it("keeps a role without a counterpart", () => {
    expect(
      groupRelationRows([
        { member_id: "m", related_member_id: null, role: "Oma", sort_order: 0 },
      ]),
    ).toEqual([{ role: "Oma", member_ids: [] }]);
  });

  it("respects the stored order regardless of the row order", () => {
    expect(
      groupRelationRows([
        { member_id: "m", related_member_id: null, role: "Partnerin", sort_order: 1 },
        { member_id: "m", related_member_id: null, role: "Mutter", sort_order: 0 },
      ]).map((r) => r.role),
    ).toEqual(["Mutter", "Partnerin"]);
  });
});

describe("groupRelationsByMember", () => {
  it("keys the grouped relations by member", () => {
    expect(
      groupRelationsByMember([
        { member_id: "a", related_member_id: "b", role: "Mutter", sort_order: 0 },
        { member_id: "b", related_member_id: "a", role: "Tochter", sort_order: 0 },
      ]),
    ).toEqual({
      a: [{ role: "Mutter", member_ids: ["b"] }],
      b: [{ role: "Tochter", member_ids: ["a"] }],
    });
  });
});

describe("primaryRole", () => {
  it("is the first relation's role", () => {
    expect(
      primaryRole([
        { role: "Mutter", member_ids: ["mem-1"] },
        { role: "Partnerin", member_ids: [] },
      ]),
    ).toBe("Mutter");
  });

  it("is null without relations", () => {
    expect(primaryRole([])).toBeNull();
  });
});

describe("joinNames", () => {
  it("joins German-style", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Emma"])).toBe("Emma");
    expect(joinNames(["Emma", "Hanna"])).toBe("Emma und Hanna");
    expect(joinNames(["Emma", "Hanna", "Ben"])).toBe("Emma, Hanna und Ben");
  });
});

describe("formatRelation / formatRelations", () => {
  const names = nameMap([
    { id: "mem-2", name: "Emma" },
    { id: "mem-3", name: "Hanna" },
    { id: "mem-4", name: "Chris" },
  ]);

  it("renders a relation as a sentence", () => {
    expect(
      formatRelation({ role: "Mutter", member_ids: ["mem-2", "mem-3"] }, names),
    ).toBe("Mutter von Emma und Hanna");
  });

  it("renders a role without a counterpart as the plain role", () => {
    expect(formatRelation({ role: "Oma", member_ids: [] }, names)).toBe("Oma");
  });

  it("falls back to the plain role when the person is unknown", () => {
    expect(
      formatRelation({ role: "Mutter", member_ids: ["gone"] }, names),
    ).toBe("Mutter");
  });

  it("joins several relations", () => {
    expect(
      formatRelations(
        [
          { role: "Mutter", member_ids: ["mem-2"] },
          { role: "Partnerin", member_ids: ["mem-4"] },
        ],
        names,
      ),
    ).toBe("Mutter von Emma · Partnerin von Chris");
  });

  it("is empty without relations", () => {
    expect(formatRelations([], names)).toBe("");
  });
});
