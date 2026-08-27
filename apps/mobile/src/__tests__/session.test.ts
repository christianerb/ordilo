import { signOutSession } from "../lib/session";

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
