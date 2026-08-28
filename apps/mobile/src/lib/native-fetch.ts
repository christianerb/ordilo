type ExpoFetch = typeof import("expo/fetch").fetch;
let transportPromise: Promise<ExpoFetch> | null = null;

/** Native transport for FormData containing Expo File blobs. */
export async function nativeFetch(
  ...args: Parameters<ExpoFetch>
): Promise<Awaited<ReturnType<ExpoFetch>>> {
  const transport = await (transportPromise ??= import("expo/fetch").then(
    ({ fetch }) => fetch,
  ));
  return transport(...args);
}
