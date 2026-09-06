import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { randomUUID } from "expo-crypto";
import { getSupabase } from "./supabase";
import { apiJson } from "./api";

/**
 * Device registration is required in addition to OS permission. Never report
 * enabled when only the system dialog succeeded; foreground sync retries it.
 */

// Expo SecureStore accepts only letters, digits, `.`, `-` and `_` in keys.
const PUSH_TOKEN_KEY = "ordilo.push-token";
const DEVICE_KEY = "ordilo.push-device";
const REGISTERED_KEY = "ordilo.push-registered";

async function withTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Device registration timed out")), 15_000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

async function deviceId(): Promise<string> {
  const stored = await SecureStore.getItemAsync(DEVICE_KEY);
  if (stored) return stored;
  const id = randomUUID();
  await SecureStore.setItemAsync(DEVICE_KEY, id);
  return id;
}

export async function isPushRegistered(): Promise<boolean> {
  const { data } = await getSupabase().auth.getSession();
  return Boolean(data.session && (await SecureStore.getItemAsync(REGISTERED_KEY)) === data.session.user.id);
}

// Serialize registration with sign-out/revocation. A late token response must
// never recreate the old account's device after logout has completed.
let deviceOperation: Promise<unknown> = Promise.resolve();
export function syncPushRegistration(): Promise<boolean> {
  const next = deviceOperation.then(registerDevice, registerDevice);
  deviceOperation = next.catch(() => {});
  return next;
}
export function unregisterPushDevice(): Promise<void> {
  const next = deviceOperation.then(revokeDevice, revokeDevice);
  deviceOperation = next.catch(() => {});
  return next;
}

async function registerDevice(): Promise<boolean> {
  if (await getPushPermission() !== "granted") {
    await revokeDevice();
    return false;
  }
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return false;
    const { data } = await getSupabase().auth.getSession();
    if (!data.session) return false;
    const { data: token } = await withTimeout(Notifications.getExpoPushTokenAsync({ projectId }));
    await apiJson("/api/notifications/device", { method: "POST", signal: AbortSignal.timeout(15_000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: await deviceId(), token, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin" }) });
    await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
    await SecureStore.setItemAsync(REGISTERED_KEY, data.session.user.id);
    return true;
  } catch {
    await SecureStore.deleteItemAsync(REGISTERED_KEY).catch(() => {});
    return false;
  }
}

async function revokeDevice(): Promise<void> {
  const id = await SecureStore.getItemAsync(DEVICE_KEY);
  try {
    if (id) await apiJson("/api/notifications/device", { method: "DELETE", signal: AbortSignal.timeout(15_000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  } finally {
    await clearStoredPushToken();
    await SecureStore.deleteItemAsync(REGISTERED_KEY);
    await Notifications.dismissAllNotificationsAsync();
  }
}

/** Only known destinations within the active, authenticated family can open. */
export function notificationDestination(data: Record<string, unknown>, familyId: string): string | null {
  if (data.familyId !== familyId) return null;
  if (typeof data.documentId === "string" && /^[0-9a-f-]{36}$/i.test(data.documentId)) return `/document/${data.documentId}`;
  return "/(tabs)/plan";
}

/** Show notifications while the app is open — quietly, as a banner. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type PushPermissionState =
  | "granted"
  | "denied"
  | "ask" // never asked, or allowed to ask again
  | "blocked"; // denied and iOS will not show the dialog again

/** Translate the raw OS permission into the four states the UI speaks. */
export function describePushPermission(permissions: {
  granted: boolean;
  canAskAgain: boolean;
  status: string;
}): PushPermissionState {
  if (permissions.granted) return "granted";
  if (permissions.canAskAgain || permissions.status === "undetermined") {
    return "ask";
  }
  return "blocked";
}

export async function getPushPermission(): Promise<PushPermissionState> {
  try {
    return describePushPermission(await Notifications.getPermissionsAsync());
  } catch {
    return "blocked";
  }
}

/**
 * Ask for permission and, when granted, fetch + persist the Expo push
 * token. Without an EAS project id the token call rejects — that is fine
 * in development; the permission state is the source of truth for the UI.
 */
export async function enablePushNotifications(): Promise<{
  state: PushPermissionState;
  token: string | null;
}> {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Mitteilungen",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const requested = await Notifications.requestPermissionsAsync();
    const state = describePushPermission(requested);
    if (state !== "granted") return { state, token: null };

    try {
      const registered = await syncPushRegistration();
      return { state, token: registered ? await getStoredPushToken() : null };
    } catch {
      return { state, token: null };
    }
  } catch {
    return { state: "blocked", token: null };
  }
}

export async function getStoredPushToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function clearStoredPushToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
  } catch {
    // Best-effort housekeeping.
  }
}
