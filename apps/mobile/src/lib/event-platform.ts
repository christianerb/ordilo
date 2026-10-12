import { Platform } from "react-native";

/** Coarse platform only; no device identifiers or user-agent strings. */
export function getProductPlatform(): "ios" | "android" | "web" | "unknown" {
  const os = Platform.OS;
  return os === "ios" || os === "android" || os === "web" ? os : "unknown";
}
