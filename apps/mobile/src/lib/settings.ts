import * as SecureStore from "expo-secure-store";

/**
 * App-level settings, persisted in SecureStore (small JSON blob — the
 * values are preferences, not secrets, but SecureStore is already a
 * dependency and survives app reinstalls via the keychain, which matches
 * how users perceive these toggles).
 */

// Expo SecureStore accepts only letters, digits, `.`, `-` and `_` in keys.
const SETTINGS_KEY = "ordilo.app-settings";

export interface AppSettings {
  /** Unlock with Face ID / Touch ID when returning to the app. */
  appLockEnabled: boolean;
  /** Hide the app content in the iOS app switcher. */
  privacyShieldEnabled: boolean;
  /** Push notifications allowed to register (token sync is server-side). */
  notificationsEnabled: boolean;
}

export const defaultAppSettings: AppSettings = {
  appLockEnabled: false,
  privacyShieldEnabled: true,
  notificationsEnabled: false,
};

/** Merge anything stored on top of the defaults, dropping unknown keys. */
export function parseAppSettings(raw: string | null): AppSettings {
  if (!raw) return defaultAppSettings;
  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      appLockEnabled:
        typeof parsed.appLockEnabled === "boolean"
          ? parsed.appLockEnabled
          : defaultAppSettings.appLockEnabled,
      privacyShieldEnabled:
        typeof parsed.privacyShieldEnabled === "boolean"
          ? parsed.privacyShieldEnabled
          : defaultAppSettings.privacyShieldEnabled,
      notificationsEnabled:
        typeof parsed.notificationsEnabled === "boolean"
          ? parsed.notificationsEnabled
          : defaultAppSettings.notificationsEnabled,
    };
  } catch {
    return defaultAppSettings;
  }
}

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    return parseAppSettings(await SecureStore.getItemAsync(SETTINGS_KEY));
  } catch {
    // Keychain unavailable (rare) — run with defaults rather than crash.
    return defaultAppSettings;
  }
}

/** Persist a partial update and return the merged result. */
export async function saveAppSettings(
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  const next = { ...(await loadAppSettings()), ...patch };
  await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(next));
  return next;
}
