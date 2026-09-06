import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordDocumentValueEvent } from "../first-value";

const { getUser, maybeSingle, insert, eq } = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  insert: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser },
    from: (table: string) => table === "documents"
      ? { select: () => ({ eq }) }
      : { insert },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  maybeSingle.mockResolvedValue({ data: { family_id: "family-1" } });
  eq.mockReturnValue({ maybeSingle });
  insert.mockResolvedValue({ error: null });
});

describe("document value telemetry", () => {
  it("uses the RLS-visible document's family and excludes document content", async () => {
    await recordDocumentValueEvent({ name: "document_result_viewed", documentId: "doc-1" });
    expect(eq).toHaveBeenCalledWith("id", "doc-1");
    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1", family_id: "family-1", event_name: "document_result_viewed",
      properties: { document_id: "doc-1" },
    });
  });
  it("records nothing for an inaccessible document or signed-out visitor", async () => {
    maybeSingle.mockResolvedValue({ data: null });
    await recordDocumentValueEvent({ name: "document_result_viewed", documentId: "missing" });
    expect(insert).not.toHaveBeenCalled();
    maybeSingle.mockResolvedValue({ data: { family_id: "family-1" } });
    getUser.mockResolvedValue({ data: { user: null } });
    await recordDocumentValueEvent({ name: "document_result_viewed", documentId: "doc-1" });
    expect(insert).not.toHaveBeenCalled();
  });
  it("does not block the UI when analytics or authentication fails", async () => {
    insert.mockRejectedValue(new Error("offline"));
    await expect(recordDocumentValueEvent({ name: "document_result_viewed", documentId: "doc-1" })).resolves.toBeUndefined();
    getUser.mockRejectedValue(new Error("offline"));
    await expect(recordDocumentValueEvent({ name: "document_result_viewed", documentId: "doc-1" })).resolves.toBeUndefined();
  });
});
