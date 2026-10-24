import { describe, expect, it, vi } from "vitest";
import { fetchAllRows } from "../paginate";

describe("fetchAllRows", () => {
  it("keeps reading until a page comes back short", async () => {
    const rows = Array.from({ length: 5 }, (_, index) => index);
    const page = vi.fn(async (from: number, to: number) => ({
      data: rows.slice(from, to + 1),
      error: null,
    }));
    await expect(fetchAllRows(page, 2)).resolves.toEqual([0, 1, 2, 3, 4]);
    expect(page.mock.calls).toEqual([[0, 1], [2, 3], [4, 5]]);
  });

  it("asks once more after an exactly full last page", async () => {
    const page = vi.fn(async (from: number) => ({
      data: from === 0 ? [1, 2] : [],
      error: null,
    }));
    await expect(fetchAllRows(page, 2)).resolves.toEqual([1, 2]);
    expect(page).toHaveBeenCalledTimes(2);
  });

  it("throws the query error instead of returning a partial list", async () => {
    const failure = { message: "timeout" };
    const page = vi.fn(async (from: number) =>
      from === 0 ? { data: [1, 2], error: null } : { data: null, error: failure },
    );
    await expect(fetchAllRows(page, 2)).rejects.toBe(failure);
  });
});
