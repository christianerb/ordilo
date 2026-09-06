/* global jest, describe, it, expect, beforeEach */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { SessionProvider, useSession } from "../lib/session";
import { clearOfflineDocuments, clearOfflineExports } from "../lib/offline-documents";
let mockCurrent;
let mockAuthChange;
const mockGetSession = jest.fn();
jest.mock("../lib/offline-documents", () => ({ clearOfflineDocuments: jest.fn().mockResolvedValue(undefined), clearOfflineExports: jest.fn() }));
jest.mock("../lib/notifications", () => ({ unregisterPushDevice: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../lib/supabase", () => ({ getSupabase: () => ({ auth: {
  getSession: mockGetSession,
  onAuthStateChange: (listener) => { mockAuthChange = listener; return { data: { subscription: { unsubscribe: jest.fn() } } }; },
  startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn(),
} }) }));
function Probe() { const current = useSession(); React.useEffect(() => { mockCurrent = current; }, [current]); return null; }
const session = (id) => ({ user: { id } });
beforeEach(() => { jest.clearAllMocks(); clearOfflineDocuments.mockResolvedValue(undefined); mockGetSession.mockResolvedValue({ data: { session: session("a") } }); });
describe("auth and offline lifecycle", () => {
  it("does not restore a stale initial session after an auth change", async () => {
    let resolve; mockGetSession.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    let tree; await act(async () => { tree = renderer.create(<SessionProvider><Probe /></SessionProvider>); });
    await act(async () => mockAuthChange("SIGNED_IN", session("b")));
    await act(async () => resolve({ data: { session: session("a") } }));
    expect(mockCurrent.session.user.id).toBe("b"); expect(mockCurrent.isLoading).toBe(false);
    await act(async () => tree.unmount());
  });
  it("clears copies on account switch and auth loss even if cleanup rejects", async () => {
    let tree; await act(async () => { tree = renderer.create(<SessionProvider><Probe /></SessionProvider>); });
    clearOfflineDocuments.mockRejectedValueOnce(new Error("device locked"));
    await act(async () => mockAuthChange("SIGNED_IN", session("b")));
    expect(clearOfflineDocuments).toHaveBeenCalledTimes(1); expect(mockCurrent.session.user.id).toBe("b");
    await act(async () => mockAuthChange("SIGNED_OUT", null));
    expect(clearOfflineDocuments).toHaveBeenCalledTimes(2); expect(mockCurrent.session).toBeNull();
    await act(async () => tree.unmount());
  });
  it("finishes initial auth hydration when temporary export cleanup fails", async () => {
    clearOfflineExports.mockImplementationOnce(() => { throw new Error("filesystem unavailable"); });
    let tree; await act(async () => { tree = renderer.create(<SessionProvider><Probe /></SessionProvider>); });
    expect(mockCurrent.isLoading).toBe(false); expect(mockCurrent.session.user.id).toBe("a");
    await act(async () => tree.unmount());
  });
});
