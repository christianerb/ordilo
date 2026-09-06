import { recordFirstValueEvent } from "../lib/first-value";

const mockGetUser = jest.fn();
const mockInsert = jest.fn();
jest.mock("../lib/supabase", () => ({
  getSupabase: () => ({
    auth: { getUser: mockGetUser },
    from: () => ({ insert: mockInsert }),
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mockInsert.mockResolvedValue({ error: null });
});

it("records only document identity and the selected destination", async () => {
  await recordFirstValueEvent("family-1", {
    name: "document_next_step_selected", documentId: "doc-1", destination: "calendar",
  });
  expect(mockInsert).toHaveBeenCalledWith({
    user_id: "user-1", family_id: "family-1", event_name: "document_next_step_selected",
    properties: { document_id: "doc-1", destination: "calendar" },
  });
});

it("does not write without a user and never blocks on failure", async () => {
  mockGetUser.mockResolvedValue({ data: { user: null } });
  await recordFirstValueEvent("family-1", { name: "document_result_viewed", documentId: "doc-1" });
  expect(mockInsert).not.toHaveBeenCalled();
  mockGetUser.mockRejectedValue(new Error("offline"));
  await expect(recordFirstValueEvent("family-1", { name: "document_result_viewed", documentId: "doc-1" })).resolves.toBeUndefined();
});
