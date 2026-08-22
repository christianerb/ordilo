import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Push notification groundwork.
 *
 * What lives here: the foreground display handler, the permission flow
 * with its German state copy, the Android channel, and local persistence
 * of the Expo push token. What deliberately does NOT live here yet: the
 * server sync of the token and the actual notification payloads — those
 * arrive with the backend contract (Agent D coordination) and only need
 * the token this module stores.
 */

// Expo SecureStore accepts only letters, digits, `.`, `-` and `_` in keys.
const PUSH_TOKEN_KEY = "ordilo.push-token";

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
      const pushToken = await Notifications.getExpoPushTokenAsync();
      await SecureStore.setItemAsync(PUSH_TOKEN_KEY, pushToken.data);
      return { state, token: pushToken.data };
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
