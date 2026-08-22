import { getSupabase } from "./supabase";

/**
 * Client for the Ordilo Next.js API routes (the web app).
 *
 * The mobile app holds no auth cookies, so every request carries the
 * current Supabase access token as `Authorization: Bearer <token>`. The
 * web API validates the token and applies RLS exactly as it does for
 * browser sessions (see src/lib/supabase/server.ts in the repo root).
 *
 * Supabase refreshes expired access tokens automatically inside
 * getSession(), so callers never deal with token renewal.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Absolute web origin without a trailing slash. Invite links are built
 * from it (recipients may open them on any device), so it must point at
 * the deployed web app in production.
 */
export function getApiUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      "EXPO_PUBLIC_API_URL fehlt. Bitte apps/mobile/.env ausfüllen.",
    );
  }
  return url.replace(/\/$/, "");
}

/**
 * Fetch an API route with the user's bearer token attached.
 *
 * Throws an ApiError for missing configuration, missing session, or any
 * non-2xx response. Error messages are German and safe to surface.
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new ApiError("Nicht angemeldet. Bitte melde dich erneut an.", 401);
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  const url = `${getApiUrl()}${path}`;
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch {
    throw new ApiError(
      "Keine Verbindung. Bitte prüfe dein Internet und versuch's nochmal.",
      0,
    );
  }

  if (!response.ok) {
    // Prefer the route's own German message (e.g. the family-name mismatch
    // from DELETE /api/me) over the generic one when the body carries it.
    let message = "Das hat nicht geklappt. Bitte versuch's nochmal.";
    try {
      const body = (await response.clone().json()) as { error?: unknown };
      if (typeof body.error === "string" && body.error.length > 0) {
        message = body.error;
      }
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new ApiError(message, response.status);
  }
  return response;
}

/** Typed JSON convenience wrapper around apiFetch. */
export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init);
  return (await response.json()) as T;
}
