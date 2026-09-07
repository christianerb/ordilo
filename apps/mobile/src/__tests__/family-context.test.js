/* global jest, describe, it, expect, beforeEach */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { AppState } from "react-native";
import { FamilyProvider, useFamily } from "../lib/family-context";
import { resolveUserFamily } from "../lib/family";
import { retainOfflineFamily } from "../lib/offline-documents";

let mockUserId = "user-a";
let mockCurrent;
let mockAppChange;
jest.mock("../lib/session", () => ({ useSession: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null }) }));
jest.mock("../lib/family", () => ({ resolveUserFamily: jest.fn() }));
jest.mock("../lib/offline-documents", () => ({ retainOfflineFamily: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../lib/supabase", () => ({ getSupabase: () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: mockUserId } } } }) } }) }));
function Probe() { const current = useFamily(); React.useEffect(() => { mockCurrent = current; }, [current]); return null; }
const family = { id: "family-a", name: "A", isOwner: true, onboarding_completed_at: "2026-01-01", introSeenAt: null };
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  jest.clearAllMocks(); mockUserId = "user-a";
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => { mockAppChange = listener; return { remove: jest.fn() }; });
  resolveUserFamily.mockResolvedValue({ data: family, error: null });
  retainOfflineFamily.mockResolvedValue(undefined);
});
describe("family membership lifecycle", () => {
  it("refreshes on foreground without dropping the existing screen, retains it on network failure", async () => {
    let tree; await act(async () => { tree = renderer.create(<FamilyProvider><Probe /></FamilyProvider>); });
    const pending = deferred(); resolveUserFamily.mockReturnValueOnce(pending.promise);
    await act(async () => { mockAppChange("active"); });
    expect(mockCurrent.family).toEqual(family); expect(mockCurrent.isLoading).toBe(false);
    await act(async () => pending.resolve({ data: null, error: "offline" }));
    expect(mockCurrent.family).toEqual(family); expect(mockCurrent.error).toBeNull();
    expect(retainOfflineFamily).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });
  it("purges former memberships and exits loading even when cleanup rejects", async () => {
    let tree; await act(async () => { tree = renderer.create(<FamilyProvider><Probe /></FamilyProvider>); });
    retainOfflineFamily.mockRejectedValueOnce(new Error("device locked"));
    resolveUserFamily.mockResolvedValueOnce({ data: { ...family, id: "family-b" }, error: null });
    await act(async () => mockAppChange("active"));
    expect(retainOfflineFamily).toHaveBeenLastCalledWith("user-a", "family-b");
    expect(mockCurrent.family.id).toBe("family-b"); expect(mockCurrent.isLoading).toBe(false);
    resolveUserFamily.mockResolvedValueOnce({ data: null, error: null });
    await act(async () => mockAppChange("active"));
    expect(retainOfflineFamily).toHaveBeenLastCalledWith("user-a", null);
    expect(mockCurrent.family).toBeNull(); expect(mockCurrent.isLoading).toBe(false);
    await act(async () => tree.unmount());
  });
  it("never exposes a previous account while loading and ignores its late response", async () => {
    let tree; await act(async () => { tree = renderer.create(<FamilyProvider><Probe /></FamilyProvider>); });
    const old = deferred(); resolveUserFamily.mockReturnValueOnce(old.promise);
    await act(async () => mockAppChange("active"));
    const next = deferred(); resolveUserFamily.mockReturnValueOnce(next.promise);
    mockUserId = "user-b";
    await act(async () => tree.update(<FamilyProvider><Probe /></FamilyProvider>));
    expect(mockCurrent.family).toBeNull(); expect(mockCurrent.isLoading).toBe(true);
    await act(async () => old.resolve({ data: family, error: null }));
    expect(mockCurrent.family).toBeNull();
    await act(async () => next.resolve({ data: { ...family, id: "family-b" }, error: null }));
    expect(mockCurrent.family.id).toBe("family-b");
    await act(async () => tree.unmount());
  });
  it("lets an explicit refresh supersede an older foreground request", async () => {
    let tree; await act(async () => { tree = renderer.create(<FamilyProvider><Probe /></FamilyProvider>); });
    const old = deferred(); resolveUserFamily.mockReturnValueOnce(old.promise);
    await act(async () => mockAppChange("active"));
    resolveUserFamily.mockResolvedValueOnce({ data: { ...family, id: "new-family" }, error: null });
    await act(async () => mockCurrent.refresh());
    await act(async () => old.resolve({ data: null, error: null }));
    expect(mockCurrent.family.id).toBe("new-family");
    expect(retainOfflineFamily).not.toHaveBeenCalledWith("user-a", null);
    await act(async () => tree.unmount());
  });
});
