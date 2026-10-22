import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import {
  hasSupabaseSessionCookie,
  isPublicMarketingPath,
} from "@/lib/public-routes";

describe("isPublicMarketingPath", () => {
  it.each([
    "/ratgeber",
    "/ratgeber/mahnung-erhalten",
    "/hilfe",
    "/ueber-uns",
    "/datenschutz",
    "/robots.txt",
    "/sitemap.xml",
    "/llms.txt",
    "/opengraph-image",
    "/0123456789abcdef0123456789abcdef.txt",
  ])("skips the session for %s", (path) => {
    expect(isPublicMarketingPath(path)).toBe(true);
  });

  it.each(["/", "/home", "/login", "/auth/callback", "/ratgeberx", "/dokumente"])(
    "keeps the session for %s",
    (path) => {
      expect(isPublicMarketingPath(path)).toBe(false);
    },
  );
});

describe("hasSupabaseSessionCookie", () => {
  function request(cookie?: string) {
    return new NextRequest("http://localhost/", {
      headers: cookie ? { cookie } : {},
    });
  }

  it("detects plain and chunked auth cookies", () => {
    expect(hasSupabaseSessionCookie(request("sb-abc-auth-token=x"))).toBe(true);
    expect(hasSupabaseSessionCookie(request("sb-abc-auth-token.0=x"))).toBe(true);
  });

  it("ignores unrelated cookies", () => {
    expect(hasSupabaseSessionCookie(request())).toBe(false);
    expect(hasSupabaseSessionCookie(request("theme=dark; sb-abc-other=1"))).toBe(
      false,
    );
  });
});
