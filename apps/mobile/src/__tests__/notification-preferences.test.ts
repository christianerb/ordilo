import * as SecureStore from "expo-secure-store";

import {
  hasNotificationPrimerBeenShown,
  loadNotificationPreferences,
  markNotificationPrimerShown,
  NOTIFICATION_CATEGORIES,
  resolveNotificationPreferences,
  setNotificationPreference,
  shouldShowNotificationPrimer,
} from "../lib/notifications";

/**
 * Behavioral tests for the per-category notification preferences
 * (public.notification_preferences, migration 0083) and the one-time
 * permission primer flag.
 */

const mockGetUser = jest.fn();
const mockUpsert = jest.fn();
const mockPrefEq = jest.fn();
const mockPrefSelect = jest.fn(() => ({ eq: mockPrefEq }));
const mockFrom = jest.fn(() => ({
  select: mockPrefSelect,
  upsert: mockUpsert,
}));

jest.mock("../lib/supabase", () => ({
  getSupabase: () => ({ auth: { getUser: mockGetUser }, from: mockFrom }),
}));

// In-memory SecureStore — the primer flag only uses get/set.
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

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
});

describe("resolveNotificationPreferences", () => {
  it("treats a missing row as enabled", () => {
    expect(resolveNotificationPreferences([])).toEqual({
      deadlines: true,
      handoffs: true,
      processing: true,
      family: true,
    });
  });

  it("lets stored rows override the default", () => {
    expect(
      resolveNotificationPreferences([
        { category: "processing", enabled: false },
      ]),
    ).toEqual({
      deadlines: true,
      handoffs: true,
      processing: false,
      family: true,
    });
  });

  it("ignores categories the app does not know", () => {
    expect(
      resolveNotificationPreferences([
        { category: "marketing", enabled: false },
      ]),
    ).toEqual({
      deadlines: true,
      handoffs: true,
      processing: true,
      family: true,
    });
  });

  it("keeps the four categories in the order the settings show them", () => {
    expect(NOTIFICATION_CATEGORIES).toEqual([
      "deadlines",
      "handoffs",
      "processing",
      "family",
    ]);
  });
});

describe("loadNotificationPreferences", () => {
  it("reads the caller's rows scoped to the family", async () => {
    mockPrefEq.mockResolvedValue({
      data: [{ category: "family", enabled: false }],
      error: null,
    });

    const prefs = await loadNotificationPreferences("fam-1");

    expect(mockFrom).toHaveBeenCalledWith("notification_preferences");
    expect(mockPrefSelect).toHaveBeenCalledWith("category, enabled");
    expect(mockPrefEq).toHaveBeenCalledWith("family_id", "fam-1");
    expect(prefs.family).toBe(false);
    expect(prefs.deadlines).toBe(true);
  });

  it("throws a friendly German error when the read fails", async () => {
    mockPrefEq.mockResolvedValue({ data: null, error: { message: "rls" } });

    await expect(loadNotificationPreferences("fam-1")).rejects.toThrow(
      "Die Einstellungen konnten nicht geladen werden.",
    );
  });
});

describe("setNotificationPreference", () => {
  it("upserts the caller's own row with the composite conflict key", async () => {
    mockUpsert.mockResolvedValue({ error: null });

    await setNotificationPreference({
      familyId: "fam-1",
      category: "deadlines",
      enabled: false,
    });

    expect(mockUpsert).toHaveBeenCalledWith(
      {
        user_id: "u1",
        family_id: "fam-1",
        category: "deadlines",
        enabled: false,
      },
      { onConflict: "user_id,family_id,category" },
    );
  });

  it("refuses to write without a signed-in user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(
      setNotificationPreference({
        familyId: "fam-1",
        category: "family",
        enabled: true,
      }),
    ).rejects.toThrow("Deine Auswahl konnte nicht gespeichert werden.");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("surfaces a failed write as a friendly German error", async () => {
    mockUpsert.mockResolvedValue({ error: { message: "rls" } });

    await expect(
      setNotificationPreference({
        familyId: "fam-1",
        category: "handoffs",
        enabled: true,
      }),
    ).rejects.toThrow("Deine Auswahl konnte nicht gespeichert werden.");
  });
});

describe("shouldShowNotificationPrimer", () => {
  it("asks only when never asked AND the first result exists", () => {
    expect(
      shouldShowNotificationPrimer({
        permission: "ask",
        processedDocuments: 1,
        alreadyShown: false,
      }),
    ).toBe(true);
  });

  it("never shows on first app open before any value exists", () => {
    expect(
      shouldShowNotificationPrimer({
        permission: "ask",
        processedDocuments: 0,
        alreadyShown: false,
      }),
    ).toBe(false);
  });

  it("stays quiet once decided or already answered", () => {
    for (const permission of ["granted", "denied", "blocked"] as const) {
      expect(
        shouldShowNotificationPrimer({
          permission,
          processedDocuments: 3,
          alreadyShown: false,
        }),
      ).toBe(false);
    }
    expect(
      shouldShowNotificationPrimer({
        permission: "ask",
        processedDocuments: 3,
        alreadyShown: true,
      }),
    ).toBe(false);
  });
});

describe("notification primer flag", () => {
  it("remembers per family that the sheet was shown", async () => {
    expect(await hasNotificationPrimerBeenShown("fam-1")).toBe(false);

    await markNotificationPrimerShown("fam-1");

    expect(await hasNotificationPrimerBeenShown("fam-1")).toBe(true);
    expect(await hasNotificationPrimerBeenShown("fam-2")).toBe(false);
  });

  it("fails closed when the keychain is unavailable — never nag", async () => {
    jest
      .mocked(SecureStore.getItemAsync)
      .mockRejectedValueOnce(new Error("Keychain unavailable"));

    expect(await hasNotificationPrimerBeenShown("fam-1")).toBe(true);
  });
});
