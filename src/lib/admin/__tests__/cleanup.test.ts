import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRpc = vi.fn();
const mockStorageRemove = vi.fn();
const mockDocumentDelete = vi.fn();
const mockDocumentIn = vi.fn();
const mockDocumentNot = vi.fn();
const mockTaskDelete = vi.fn();
const mockTaskIs = vi.fn();
const mockTaskLt = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createClient: () => ({
    rpc: mockRpc,
    storage: {
      from: () => ({ remove: mockStorageRemove }),
    },
    from: (table: string) => {
      if (table === "documents") {
        return { delete: mockDocumentDelete };
      }
      if (table === "tasks") {
        return { delete: mockTaskDelete };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

import { purgeExpiredTrash } from "../cleanup";

beforeEach(() => {
  mockRpc.mockReset();
  mockStorageRemove.mockReset();
  mockDocumentDelete.mockReset();
  mockDocumentIn.mockReset();
  mockDocumentNot.mockReset();
  mockTaskDelete.mockReset();
  mockTaskIs.mockReset();
  mockTaskLt.mockReset();

  mockRpc.mockResolvedValue({
    data: [{ id: "doc-1", file_url: "family/doc-1/file.pdf" }],
    error: null,
  });
  mockStorageRemove.mockResolvedValue({ error: null });
  mockDocumentDelete.mockReturnValue({ in: mockDocumentIn });
  mockDocumentIn.mockReturnValue({ not: mockDocumentNot });
  mockDocumentNot.mockResolvedValue({ error: null });
  mockTaskDelete.mockReturnValue({ is: mockTaskIs });
  mockTaskIs.mockReturnValue({ lt: mockTaskLt });
  mockTaskLt.mockResolvedValue({ error: null });
});

describe("purgeExpiredTrash", () => {
  it("claims documents before removing Storage files and database rows", async () => {
    await purgeExpiredTrash();

    expect(mockRpc).toHaveBeenCalledWith(
      "claim_expired_trash_documents",
      { p_cutoff: expect.any(String) },
    );
    expect(mockStorageRemove).toHaveBeenCalledWith([
      "family/doc-1/file.pdf",
    ]);
    expect(mockDocumentIn).toHaveBeenCalledWith("id", ["doc-1"]);
    expect(mockDocumentNot).toHaveBeenCalledWith(
      "purge_started_at",
      "is",
      null,
    );
  });

  it("does not delete claimed rows when Storage removal fails", async () => {
    const storageError = new Error("storage unavailable");
    mockStorageRemove.mockResolvedValue({ error: storageError });

    await expect(purgeExpiredTrash()).rejects.toBe(storageError);
    expect(mockDocumentDelete).not.toHaveBeenCalled();
    expect(mockTaskDelete).not.toHaveBeenCalled();
  });
});
