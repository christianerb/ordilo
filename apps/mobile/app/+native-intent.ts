/** Preserve ordinary invite/document links; only native shares enter intake. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (new URL(path).hostname === "expo-sharing") return "/empfangen";
    return path;
  } catch { return path.startsWith("/") ? path : "/"; }
}
