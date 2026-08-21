import { secureStorage } from "../lib/secure-storage";

/**
 * In-memory SecureStore stand-in. The chunking logic is what protects
 * Supabase sessions from the platform value-size limit — these tests pin
 * the roundtrip, cleanup and legacy-read behavior.
 */
const mockStore = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

describe("secureStorage", () => {
  beforeEach(() => {
    mockStore.clear();
  });

  it("round-trips a short value", async () => {
    await secureStorage.setItem("key", "short-value");
    await expect(secureStorage.getItem("key")).resolves.toBe("short-value");
  });

  it("round-trips values larger than the platform limit via chunks", async () => {
    const largeValue = "x".repeat(1800 * 3 + 42);
    await secureStorage.setItem("session", largeValue);

    expect(mockStore.get("session-chunks")).toBe("4");
    expect(mockStore.has("session")).toBe(false);
    await expect(secureStorage.getItem("session")).resolves.toBe(largeValue);
  });

  it("removes all chunks and metadata on removeItem", async () => {
    const largeValue = "y".repeat(5000);
    await secureStorage.setItem("session", largeValue);
    await secureStorage.removeItem("session");

    const remainingKeys = [...mockStore.keys()].filter((key) =>
      key.startsWith("session"),
    );
    expect(remainingKeys).toEqual([]);
    await expect(secureStorage.getItem("session")).resolves.toBeNull();
  });

  it("drops stale trailing chunks when a value shrinks", async () => {
    await secureStorage.setItem("session", "z".repeat(4000));
    await secureStorage.setItem("session", "tiny");

    expect(mockStore.get("session-chunks")).toBe("1");
    expect(mockStore.has("session-chunk-1")).toBe(false);
    await expect(secureStorage.getItem("session")).resolves.toBe("tiny");
  });

  it("reads legacy single-entry values written before chunking", async () => {
    mockStore.set("legacy", "old-value");
    await expect(secureStorage.getItem("legacy")).resolves.toBe("old-value");
  });

  it("returns null when a chunk is missing", async () => {
    await secureStorage.setItem("broken", "a".repeat(4000));
    mockStore.delete("broken-chunk-1");
    await expect(secureStorage.getItem("broken")).resolves.toBeNull();
  });

  it("only writes keys that expo-secure-store accepts", async () => {
    // SecureStore keys may contain letters, digits, ".", "-" and "_" only —
    // anything else rejects on real devices. The Supabase storage key
    // format is `sb-<project-ref>-auth-token`.
    await secureStorage.setItem("sb-testproject-auth-token", "v".repeat(5000));
    for (const key of mockStore.keys()) {
      expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
    }
  });
});
