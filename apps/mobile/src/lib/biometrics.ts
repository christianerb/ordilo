import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";

/**
 * Biometric unlock (Face ID / Touch ID / fingerprint) for the app lock.
 *
 * The label logic is pure and takes plain numbers so unit tests do not
 * need the native module — the constants mirror
 * LocalAuthentication.AuthenticationType.
 */

// Mirror of expo-local-authentication's AuthenticationType enum values.
const AUTH_TYPE_FINGERPRINT = 1;
const AUTH_TYPE_FACIAL_RECOGNITION = 2;

export interface BiometrySupport {
  /** Hardware present AND at least one biometric enrolled. */
  available: boolean;
  /** German label for the UI: "Face ID", "Touch ID", "Fingerabdruck", … */
  label: string;
}

export function biometryLabel(
  types: readonly number[],
  platform: "ios" | "android" | string = Platform.OS,
): string {
  if (types.includes(AUTH_TYPE_FACIAL_RECOGNITION)) {
    return platform === "ios" ? "Face ID" : "Gesichtserkennung";
  }
  if (types.includes(AUTH_TYPE_FINGERPRINT)) {
    return platform === "ios" ? "Touch ID" : "Fingerabdruck";
  }
  return "Biometrie";
}

export async function getBiometrySupport(): Promise<BiometrySupport> {
  try {
    const [hasHardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    if (!hasHardware || !enrolled) {
      return { available: false, label: biometryLabel([]) };
    }
    const types =
      await LocalAuthentication.supportedAuthenticationTypesAsync();
    return { available: true, label: biometryLabel(types) };
  } catch {
    return { available: false, label: biometryLabel([]) };
  }
}

/**
 * Ask the user to prove it is them. Device passcode stays as the system
 * fallback (disableDeviceFallback: false) so a wet thumb never locks a
 * parent out of the family documents.
 */
export async function authenticateToUnlock(prompt: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt,
      cancelLabel: "Abbrechen",
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
