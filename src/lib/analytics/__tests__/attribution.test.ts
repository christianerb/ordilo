import { describe, expect, it } from "vitest";
import {
  attributionQuery,
  classifyChannel,
  cleanHost,
  readAttribution,
} from "../attribution";
import { parseStoredAttribution } from "../stored-attribution";

const page = (overrides: Partial<Parameters<typeof readAttribution>[0]> = {}) =>
  readAttribution({
    search: "",
    referrer: "",
    ownHost: "ordilo.de",
    pathname: "/",
    ...overrides,
  });

describe("readAttribution", () => {
  it("keeps UTM parameters, the external referrer host and the landing path", () => {
    expect(
      page({
        search: "?utm_source=Newsletter&utm_medium=email&utm_campaign=herbst-2026",
        referrer: "https://www.google.com/search?q=kindergeld",
        pathname: "/ratgeber/kindergeld",
      }),
    ).toEqual({
      source: "newsletter",
      medium: "email",
      campaign: "herbst-2026",
      referrer: "google.com",
      landing: "/ratgeber/kindergeld",
    });
  });

  it("prefers carried parameters over the current page", () => {
    expect(
      page({
        search: "?ref=chatgpt.com&lp=/ratgeber/steuer",
        referrer: "https://ordilo.de/ratgeber/steuer",
        pathname: "/login",
      }),
    ).toEqual({ referrer: "chatgpt.com", landing: "/ratgeber/steuer" });
  });

  it("ignores its own host as a referrer", () => {
    expect(page({ referrer: "https://www.ordilo.de/", pathname: "/login" })).toEqual({
      landing: "/login",
    });
    expect(page({ referrer: "https://app.ordilo.de/x" })).toEqual({ landing: "/" });
  });

  it("drops click ids but remembers that the click was paid", () => {
    const attribution = page({ search: "?gclid=abc123secret" });
    expect(attribution.paid_click).toBe("google");
    expect(JSON.stringify(attribution)).not.toContain("abc123secret");
  });

  it("never treats fbclid alone as paid; the medium decides", () => {
    expect(page({ search: "?fbclid=xyz" }).paid_click).toBeUndefined();
    expect(classifyChannel(page({ search: "?fbclid=xyz&utm_medium=paid_social" }))).toBe("bezahlt");
  });

  it("classifies an organic tagged Instagram post opened via Facebook as social", () => {
    expect(
      classifyChannel(page({ search: "?utm_source=instagram&utm_medium=social&fbclid=xyz" })),
    ).toBe("social");
  });

  it("rejects landing paths that are not plain same-site paths", () => {
    expect(page({ search: "?lp=//evil.example" }).landing).toBeUndefined();
    expect(page({ search: "?lp=https://evil.example" }).landing).toBeUndefined();
    expect(page({ search: "?lp=/ratgeber/x?email=a@b.de" }).landing).toBe("/ratgeber/x");
  });

  it("drops campaign values that look like personal data", () => {
    const attribution = page({
      search:
        "?utm_source=newsletter&utm_term=max.mustermann@gmail.com&utm_content=0170%201234567&utm_campaign=a8f3k2m9x7q1w5e4r6t2",
    });
    expect(attribution).toEqual({ source: "newsletter", landing: "/" });
    expect(page({ search: "?utm_term=max%40example.de" }).term).toBeUndefined();
    expect(page({ search: "?utm_content=550e8400-e29b-41d4-a716-446655440000" }).content).toBeUndefined();
    expect(page({ search: "?utm_content=5f2b9c1d8e7a6f30" }).content).toBeUndefined();
    // Ordinary campaign names stay, also long ones with a year.
    expect(page({ search: "?utm_source=newsletteroktober2026" }).source).toBe("newsletteroktober2026");
    expect(page({ search: "?utm_campaign=blackfriday2026promo" }).campaign).toBe("blackfriday2026promo");
    expect(page({ search: "?utm_campaign=herbst-2026&utm_content=banner-oben" })).toMatchObject({
      campaign: "herbst-2026",
      content: "banner-oben",
    });
  });

  it("detects Google ad clicks by any of their click ids", () => {
    for (const id of ["gclid", "gbraid", "wbraid", "dclid"]) {
      expect(classifyChannel(page({ search: `?${id}=0AAAA`, referrer: "https://www.google.com/" }))).toBe(
        "bezahlt",
      );
    }
  });

  it("keeps dates as campaign names and drops phone numbers", () => {
    expect(page({ search: "?utm_campaign=2026-10-24" }).campaign).toBe("2026-10-24");
    expect(page({ search: "?utm_campaign=20261024" }).campaign).toBe("20261024");
    expect(page({ search: "?utm_campaign=05.10.2026" }).campaign).toBe("05.10.2026");
    expect(page({ search: "?utm_term=%2B49%20170%201234567" }).term).toBeUndefined();
  });

  it("reads ref values with a path as their host, and falls back when utm_source was dropped", () => {
    expect(page({ search: "?ref=producthunt.com/posts/ordilo" }).referrer).toBe("producthunt.com");
    expect(page({ search: "?utm_source=max@example.de&ref=producthunt" }).source).toBe("producthunt");
  });

  it("reduces a URL in a campaign tag to its host", () => {
    expect(page({ search: "?utm_campaign=https://evil.com/private/path" }).campaign).toBe("evil.com");
    expect(page({ search: "?utm_source=https://www.elternforum.de/thread/123" }).source).toBe("elternforum.de");
  });

  it("caps and cleans free-text values", () => {
    const attribution = page({ search: `?utm_campaign=${"a".repeat(300)}<script>` });
    expect(attribution.campaign).toHaveLength(100);
    expect(attribution.campaign).not.toContain("<");
  });

  it("keeps percent-encoded and umlaut slugs of public pages", () => {
    // window.location.pathname is percent-encoded; carried as lp it is encoded once more.
    const encoded = "/ratgeber/elterngeld-%C3%BCbersicht";
    const carried = attributionQuery({ landing: encoded });
    expect(page({ search: `?${carried}`, pathname: "/login" }).landing).toBe(encoded);
    expect(page({ pathname: encoded }).landing).toBe(encoded);
    expect(page({ pathname: "/ratgeber/elterngeld-übersicht" }).landing).toBe("/ratgeber/elterngeld-übersicht");
  });

  it("checks long paths whole and shortens them to their first segment", () => {
    const longSlug = `/ratgeber/${"elterngeld-%C3%BC".repeat(15)}`;
    expect(longSlug.length).toBeGreaterThan(200);
    expect(page({ pathname: longSlug }).landing).toBe("/ratgeber");
    expect(page({ pathname: `/${"a".repeat(1200)}` }).landing).toBeUndefined();
  });

  it("keeps no landing when the first segment itself looks personal", () => {
    expect(page({ search: "?lp=/a8f3k2m9x7q1w5e4r6t2", pathname: "/login" }).landing).toBeUndefined();
    expect(page({ pathname: "/max%40example.de" }).landing).toBeUndefined();
  });

  it("drops path segments that look like personal data, also under public pages", () => {
    expect(page({ pathname: "/ratgeber/max%40example.de" }).landing).toBe("/ratgeber");
    expect(page({ search: "?lp=/ratgeber/550e8400-e29b-41d4-a716-446655440000" }).landing).toBe("/ratgeber");
    expect(page({ pathname: "/ratgeber/kindergeld-2026" }).landing).toBe("/ratgeber/kindergeld-2026");
  });

  it("keeps only the first segment of non-public paths", () => {
    const token = "a".repeat(64);
    expect(page({ pathname: `/invite/${token}` }).landing).toBe("/invite");
    expect(page({ search: `?lp=/invite/${token}` }).landing).toBe("/invite");
    expect(page({ pathname: "/dokumente/0b6c1f9e-1234" }).landing).toBe("/dokumente");
    expect(page({ pathname: "/ratgeber/kindergeld" }).landing).toBe("/ratgeber/kindergeld");
    expect(page({ pathname: "/login" }).landing).toBe("/login");
  });

  it("reads a non-host ref tag as the source", () => {
    expect(page({ search: "?ref=producthunt" })).toEqual({ source: "producthunt", landing: "/" });
    // An explicit utm_source wins over the ref tag.
    expect(page({ search: "?ref=producthunt&utm_source=newsletter" }).source).toBe("newsletter");
    // A host ref stays a referrer.
    expect(page({ search: "?ref=elternforum.de" }).referrer).toBe("elternforum.de");
  });

  it("never takes the invite or app entry from a URL", () => {
    expect(page({ search: "?via=invite" }).via).toBeUndefined();
    expect(attributionQuery({ via: "invite", source: "x" })).toBe("utm_source=x");
  });
});

describe("attributionQuery", () => {
  it("round-trips through readAttribution on the login page", () => {
    const original = page({
      search: "?utm_source=instagram&utm_medium=social&gclid=1",
      referrer: "https://l.instagram.com/",
      pathname: "/ratgeber/kita",
    });
    const carried = page({ search: `?${attributionQuery(original)}`, pathname: "/login" });
    expect(carried).toEqual(original);
  });

  it("is empty when there is nothing to carry", () => {
    expect(attributionQuery({})).toBe("");
  });
});

describe("cleanHost", () => {
  it("reduces URLs to bare hosts", () => {
    expect(cleanHost("https://www.Example.org/path?q=1")).toBe("example.org");
    expect(cleanHost("not a host")).toBeUndefined();
    expect(cleanHost("javascript:alert(1)")).toBeUndefined();
  });
});

describe("parseStoredAttribution", () => {
  it("re-cleans client-written metadata", () => {
    expect(
      parseStoredAttribution({
        source: "Google",
        referrer: "https://www.bing.com/",
        landing: "//evil",
        via: "hacker",
        extra: "dropped",
      }),
    ).toEqual({ source: "google", referrer: "bing.com" });
  });

  it("returns null for missing or malformed metadata", () => {
    expect(parseStoredAttribution(undefined)).toBeNull();
    expect(parseStoredAttribution("google")).toBeNull();
    expect(parseStoredAttribution([])).toBeNull();
  });
});

describe("classifyChannel", () => {
  it.each([
    [null, "unbekannt"],
    [{}, "direkt"],
    [{ landing: "/" }, "direkt"],
    [{ via: "invite" as const, referrer: "google.com" }, "einladung"],
    [{ via: "app" as const }, "app"],
    [{ landing: "/invite", referrer: "wa.me" }, "einladung"],
    [{ paid_click: "google" as const, referrer: "google.com" }, "bezahlt"],
    [{ source: "google", medium: "cpc" }, "bezahlt"],
    [{ source: "brevo", medium: "newsletter" }, "email"],
    [{ source: "instagram" }, "social"],
    [{ referrer: "l.instagram.com" }, "social"],
    [{ referrer: "google.de" }, "suche"],
    [{ referrer: "news.google.com" }, "suche"],
    [{ referrer: "google.co.uk" }, "suche"],
    [{ referrer: "docs.google.com" }, "verweis"],
    [{ referrer: "sites.google.com" }, "verweis"],
    [{ referrer: "ecosia.org" }, "suche"],
    [{ referrer: "mail.google.com" }, "email"],
    [{ referrer: "com.google.android.gm" }, "email"],
    [{ referrer: "navigator.web.de" }, "email"],
    [{ referrer: "email.t-online.de" }, "email"],
    // Portal news articles are referrals, not e-mail.
    [{ referrer: "web.de" }, "verweis"],
    [{ referrer: "t-online.de" }, "verweis"],
    [{ referrer: "chatgpt.com" }, "ki_assistent"],
    [{ referrer: "gemini.google.com" }, "ki_assistent"],
    [{ source: "chatgpt" }, "ki_assistent"],
    [{ source: "chatgpt.com" }, "ki_assistent"],
    [{ source: "perplexity.ai" }, "ki_assistent"],
    [{ source: "google", medium: "organic" }, "suche"],
    [{ source: "bing" }, "suche"],
    [{ source: "google", medium: "cpc" }, "bezahlt"],
    [{ source: "podcast-xy" }, "kampagne"],
    [{ referrer: "elternforum.de" }, "verweis"],
  ])("%j → %s", (attribution, channel) => {
    expect(classifyChannel(attribution)).toBe(channel);
  });
});
