import type { NextRequest } from "next/server";

/**
 * Public marketing and crawler routes that never depend on the session.
 * The middleware skips Supabase entirely for them so pages stay statically
 * cacheable and crawlers get the fastest possible response.
 */
const PUBLIC_PREFIXES = [
  "/ratgeber",
  "/hilfe",
  "/ueber-uns",
  "/datenschutz",
  "/impressum",
  "/nutzungsbedingungen",
];

const PUBLIC_FILES = new Set([
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/manifest.webmanifest",
  "/opengraph-image",
]);

export function isPublicMarketingPath(pathname: string): boolean {
  if (PUBLIC_FILES.has(pathname)) return true;
  // IndexNow key files live at the root as /<key>.txt.
  if (/^\/[a-f0-9]{32}\.txt$/.test(pathname)) return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Supabase SSR stores the session in `sb-<project>-auth-token`, chunked as
 * `.0`, `.1`, … when large. Only a cheap presence check — the middleware
 * still verifies the token before acting on it.
 */
export function hasSupabaseSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(({ name }) => /^sb-.+-auth-token(\.\d+)?$/.test(name));
}
