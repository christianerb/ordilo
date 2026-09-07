import { getFamilyAccess, revokeFamilyAccess } from "../lib/family-access";
const mockRpc = jest.fn();
jest.mock("../lib/supabase", () => ({ getSupabase: () => ({ rpc: mockRpc }) }));
const familyId = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
beforeEach(() => mockRpc.mockReset());

describe("family account access", () => {
  it("accepts a validated account roster and rejects incomplete responses", async () => {
    const data = { status: "ok", members: [{ user_id: userId, email: "member@example.test", is_owner: false, is_self: true }], invites: [] };
    mockRpc.mockResolvedValueOnce({ data, error: null });
    expect(await getFamilyAccess(familyId)).toEqual({ success: true, data });
    mockRpc.mockResolvedValueOnce({ data: { status: "ok", members: [] }, error: null });
    expect((await getFamilyAccess(familyId)).success).toBe(false);
  });
  it.each(["forbidden", "owner_protected", "not_found"])("does not report %s as successful revocation", async (status) => {
    mockRpc.mockResolvedValue({ data: { status }, error: null });
    expect((await revokeFamilyAccess(familyId, { userId })).success).toBe(false);
  });
  it("uses separate family-scoped RPCs for account and link removal", async () => {
    mockRpc.mockResolvedValue({ data: { status: "ok" }, error: null });
    expect(await revokeFamilyAccess(familyId, { userId })).toEqual({ success: true });
    expect(mockRpc).toHaveBeenLastCalledWith("revoke_family_access", { p_family_id: familyId, p_user_id: userId });
    expect(await revokeFamilyAccess(familyId, { inviteId: userId })).toEqual({ success: true });
    expect(mockRpc).toHaveBeenLastCalledWith("revoke_family_invite", { p_family_id: familyId, p_invite_id: userId });
  });
  it("contains transport failures without exposing raw server details", async () => {
    mockRpc.mockRejectedValue(new Error("private server detail"));
    expect(await getFamilyAccess(familyId)).toMatchObject({ success: false });
    const result = await revokeFamilyAccess(familyId, { userId });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private server detail");
  });
});
