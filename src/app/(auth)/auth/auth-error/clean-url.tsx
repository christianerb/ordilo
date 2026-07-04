"use client";

import { useEffect } from "react";

/**
 * Cleans sensitive tokens from the URL fragment.
 *
 * In edge cases where Supabase falls back to the implicit flow (e.g.
 * admin-generated links), access/refresh tokens can end up in the URL
 * fragment (`#access_token=...`). This component strips any fragment
 * containing token data so it never persists in the browser address bar
 * or history.
 */
export function CleanUrl() {
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      const hash = window.location.hash;
      if (
        hash.includes("access_token") ||
        hash.includes("refresh_token") ||
        hash.includes("id_token")
      ) {
        // Replace the URL to remove the fragment entirely, without
        // triggering a navigation or leaving the tokens in history.
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      }
    }
  }, []);

  return null;
}
