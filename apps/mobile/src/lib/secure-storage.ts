import * as SecureStore from "expo-secure-store";

/**
 * Chunked storage adapter for Supabase Auth sessions.
 *
 * expo-secure-store values can be rejected by the platform when they grow
 * beyond roughly 2048 bytes (historically on iOS). A Supabase session JSON
 * holds two JWTs and regularly exceeds that, so values are split into
 * chunks and reassembled on read. The chunk count lives under a
 * `<key>-chunks` meta entry; a missing meta entry falls back to a direct
 * read so values written before this adapter existed still load.
 *
 * Key format note: expo-secure-store only accepts keys made of letters,
 * digits, `.`, `-` and `_`. The Supabase storage key
 * (`sb-<ref>-auth-token`) already complies, and the `-chunks` / `-chunk-N`
 * suffixes keep every derived key inside that alphabet.
 *
 * Implements the SupportedStorage interface expected by @supabase/supabase-js.
 */

const CHUNK_SIZE = 1800;
const META_SUFFIX = "-chunks";

function chunkKey(key: string, index: number): string {
  return `${key}-chunk-${index}`;
}

async function removeChunks(key: string): Promise<void> {
  const meta = await SecureStore.getItemAsync(key + META_SUFFIX);
  if (meta !== null) {
    const count = Number.parseInt(meta, 10);
    if (Number.isFinite(count)) {
      for (let i = 0; i < count; i++) {
        await SecureStore.deleteItemAsync(chunkKey(key, i));
      }
    }
    await SecureStore.deleteItemAsync(key + META_SUFFIX);
  }
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const meta = await SecureStore.getItemAsync(key + META_SUFFIX);
    if (meta === null) {
      // No chunk metadata — either a legacy single value or nothing at all.
      return SecureStore.getItemAsync(key);
    }
    const count = Number.parseInt(meta, 10);
    if (!Number.isFinite(count) || count < 1) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (part === null) return null; // incomplete write — treat as logged out
      parts.push(part);
    }
    return parts.join("");
  },

  async setItem(key: string, value: string): Promise<void> {
    // Clear previous chunks first so a shrinking value never leaves
    // stale trailing chunks behind.
    await removeChunks(key);
    await SecureStore.deleteItemAsync(key);

    const chunks: string[] = [];
    for (let offset = 0; offset < value.length; offset += CHUNK_SIZE) {
      chunks.push(value.slice(offset, offset + CHUNK_SIZE));
    }
    if (chunks.length === 0) chunks.push("");

    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(chunkKey(key, i), chunks[i]);
    }
    await SecureStore.setItemAsync(key + META_SUFFIX, String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    await removeChunks(key);
    await SecureStore.deleteItemAsync(key);
  },
};
