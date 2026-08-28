import { File } from "expo-file-system";

import { getApiUrl } from "./api";
import { nativeFetch } from "./native-fetch";
import { getSupabase } from "./supabase";

export class VoiceInputError extends Error {}

export async function transcribeVoiceRecording(input: {
  familyId: string;
  uri: string;
  signal?: AbortSignal;
}): Promise<string> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new VoiceInputError("Nicht angemeldet. Bitte melde dich erneut an.");
  }

  const body = new FormData();
  body.append("family_id", input.familyId);
  body.append("audio", new File(input.uri), "ordilo-frage.m4a");

  let response: Response;
  try {
    response = await nativeFetch(`${getApiUrl()}/api/realtime/transcribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
      signal: input.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new VoiceInputError(
      "Keine Verbindung. Bitte prüfe dein Internet und versuch es nochmal.",
    );
  }
  const result = (await response.json().catch(() => null)) as {
    error?: unknown;
    text?: unknown;
  } | null;
  if (!response.ok || typeof result?.text !== "string") {
    throw new VoiceInputError(
      typeof result?.error === "string"
        ? result.error
        : "Die Spracheingabe hat nicht geklappt.",
    );
  }
  return result.text.trim();
}

/**
 * Recordings are sensitive family data. They live only in the app cache for
 * the duration of one upload and are removed after every terminal path.
 */
export function removeVoiceRecording(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Cleanup must never hide a completed transcript or a useful error.
  }
}
