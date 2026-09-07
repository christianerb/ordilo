import { clearOfflineDocuments } from "../lib/offline-documents";
import { signOutSession } from "../lib/session";
jest.mock("../lib/offline-documents", () => ({ clearOfflineDocuments: jest.fn().mockResolvedValue(undefined), clearOfflineExports: jest.fn() }));

describe("native session sign-out", () => {
  it("uses the normal remote sign-out when it succeeds", async () => {
    const signOut = jest.fn().mockResolvedValue({ error: null });

    await signOutSession({ signOut });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith();
  });

  it("clears local tokens when remote sign-out rejects", async () => {
    const signOut = jest
      .fn()
      .mockRejectedValueOnce(new Error("Auth user no longer exists"))
      .mockResolvedValueOnce({ error: null });

    await signOutSession({ signOut });

    expect(signOut).toHaveBeenNthCalledWith(1);
    expect(signOut).toHaveBeenNthCalledWith(2, { scope: "local" });
  });
});

it("still revokes auth when offline cleanup fails", async () => {
  jest.mocked(clearOfflineDocuments).mockRejectedValueOnce(new Error("storage unavailable"));
  const signOut = jest.fn().mockResolvedValue({ error: null });
  await signOutSession({ signOut });
  expect(signOut).toHaveBeenCalledWith();
});
it("clears local auth when remote sign-out returns an error", async () => {
  const signOut = jest.fn().mockResolvedValueOnce({ error: new Error("remote failed") }).mockResolvedValueOnce({ error: null });
  await signOutSession({ signOut });
  expect(signOut).toHaveBeenNthCalledWith(2, { scope: "local" });
});
