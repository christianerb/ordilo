import {
  defaultAppSettings,
  loadAppSettings,
  parseAppSettings,
  saveAppSettings,
} from "../lib/settings";

// In-memory SecureStore — the settings module only uses get/set/delete.
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

describe("parseAppSettings", () => {
  it("returns defaults when nothing was stored", () => {
    expect(parseAppSettings(null)).toEqual(defaultAppSettings);
  });

  it("merges stored values over the defaults", () => {
    const parsed = parseAppSettings(JSON.stringify({ appLockEnabled: true }));
    expect(parsed.appLockEnabled).toBe(true);
    expect(parsed.privacyShieldEnabled).toBe(
      defaultAppSettings.privacyShieldEnabled,
    );
  });

  it("ignores values with the wrong type", () => {
    const parsed = parseAppSettings(
      JSON.stringify({ appLockEnabled: "ja", notificationsEnabled: true }),
    );
    expect(parsed.appLockEnabled).toBe(defaultAppSettings.appLockEnabled);
    expect(parsed.notificationsEnabled).toBe(true);
  });

  it("falls back to defaults on corrupt JSON", () => {
    expect(parseAppSettings("{kaputt")).toEqual(defaultAppSettings);
  });
});

describe("load/saveAppSettings", () => {
  beforeEach(() => mockStore.clear());

  it("round-trips a partial update", async () => {
    const saved = await saveAppSettings({ appLockEnabled: true });
    expect(saved.appLockEnabled).toBe(true);
    expect(await loadAppSettings()).toEqual(saved);
  });

  it("keeps earlier values when saving a different key", async () => {
    await saveAppSettings({ privacyShieldEnabled: false });
    const saved = await saveAppSettings({ notificationsEnabled: true });
    expect(saved.privacyShieldEnabled).toBe(false);
    expect(saved.notificationsEnabled).toBe(true);
  });
});
