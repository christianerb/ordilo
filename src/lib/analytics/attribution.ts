import { isPublicMarketingPath } from "@/lib/public-routes";

/**
 * Signup attribution without cookies or browser storage.
 *
 * The privacy policy promises "only technically necessary cookies", so the
 * first touch is never persisted on the device. Instead, marketing pages
 * carry what the current request already knows (UTM parameters, the
 * referring host, the landing path) as query parameters on their link to
 * /login, and the login form hands that to Supabase as user metadata on
 * the one request that creates the account. Supabase only applies that
 * metadata at signup, and a database trigger copies it at that moment into
 * signup_attributions, which users cannot change (migration 0094).
 *
 * Only coarse, content-free values are kept: a referrer is reduced to its
 * host, a landing page to its path.
 */

export type SignupAttribution = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  /** Referring host, e.g. "google.com" — never a full URL. */
  referrer?: string;
  /** First public path the visitor saw, e.g. "/ratgeber/kindergeld". */
  landing?: string;
  /**
   * Entry path that is not a marketing channel: set directly in the signup
   * metadata by the invite flows and the native app, never read from a URL.
   */
  via?: "invite" | "app";
  /** Set when a paid click id was present; the id itself is dropped. */
  paid_click?: "google" | "microsoft";
};

export type AcquisitionChannel =
  | "einladung"
  | "app"
  | "bezahlt"
  | "suche"
  | "ki_assistent"
  | "social"
  | "email"
  | "verweis"
  | "kampagne"
  | "direkt"
  | "unbekannt";

export const ACQUISITION_CHANNEL_LABELS: Record<AcquisitionChannel, string> = {
  einladung: "Einladung",
  app: "App",
  bezahlt: "Bezahlte Werbung",
  suche: "Suchmaschine",
  ki_assistent: "KI-Assistent",
  social: "Social Media",
  email: "E-Mail / Newsletter",
  verweis: "Andere Website",
  kampagne: "Sonstige Kampagne",
  direkt: "Direkt",
  unbekannt: "Unbekannt (älteres Konto oder ältere App)",
};

/** Query parameters a link to /login may carry. */
const CARRIED_PARAMS = {
  utm_source: "source",
  utm_medium: "medium",
  utm_campaign: "campaign",
  utm_content: "content",
  utm_term: "term",
  ref: "referrer",
  lp: "landing",
} as const satisfies Record<string, keyof SignupAttribution>;

/** utm_medium values that mean the click was bought. */
const PAID_MEDIUMS = ["cpc", "ppc", "paid", "paidsocial", "paid_social", "paid-social", "display", "cpm", "ads"];

const MAX_VALUE_LENGTH = 100;
const MAX_PATH_LENGTH = 200;
/** Longer paths are not a page anyone landed on; drop them. */
const MAX_RAW_PATH_LENGTH = 1000;

/**
 * Clean a free-text campaign value. Values that look like personal data —
 * an email address, a phone number, or a long id/token some mail tools put
 * into utm_term or utm_content — are dropped entirely, not reshaped.
 */
function cleanValue(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const raw = value.trim();
  if (looksPersonal(raw)) return undefined;
  // A URL in a campaign tag is reduced to its host, like a referrer: the
  // path can name a private page.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return cleanHost(raw);
  const cleaned = raw
    .replace(/[^\p{L}\p{N} ._\-+]/gu, "")
    .trim()
    .toLowerCase()
    .slice(0, MAX_VALUE_LENGTH);
  return cleaned || undefined;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function looksPersonal(value: string): boolean {
  if (value.includes("@") || /%40/i.test(value)) return true;
  // Phone numbers start with "+" or "0" (dates like 2026-10-24 do not).
  if ((value.match(/\d/g) ?? []).length >= 7 && /^(\+|0)[\d\s()./-]+$/.test(value)) return true;
  // UUIDs and other hex ids, with or without separators.
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(value)) return true;
  if (/^[0-9a-f]{16,}$/i.test(value.replace(/[-_.]/g, ""))) return true;
  // Other ids and tokens: a long run of letters and digits where digits
  // make up a good share — "a8f3k2m9x7q1w5e4r6t2", but not campaign names
  // like "blackfriday2026promo".
  return (value.match(/[a-z0-9]{20,}/gi) ?? []).some(
    (run) => /[a-z]/i.test(run) && (run.match(/\d/g) ?? []).length / run.length >= 0.3,
  );
}

/** Reduce a referrer (host or URL) to a bare host without "www.". */
export function cleanHost(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  let host = value.trim().toLowerCase();
  try {
    if (host.includes("://")) host = new URL(host).hostname;
  } catch {
    return undefined;
  }
  host = host.replace(/^www\./, "");
  if (!/^[a-z0-9.-]+\.[a-z0-9-]+$/.test(host) || host.length > MAX_VALUE_LENGTH) {
    return undefined;
  }
  return host;
}

/**
 * A same-site path, reduced to what is safe to keep in account metadata
 * (which travels in every login token): public pages keep their path,
 * anything else only its first segment — "/invite/<token>" becomes
 * "/invite", "/dokumente/<id>" becomes "/dokumente".
 */
function cleanPath(value: string | null | undefined): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return undefined;
  const path = value.split(/[?#]/)[0];
  // Check the whole path first: cutting first could split a "%C3" escape.
  if (path.length > MAX_RAW_PATH_LENGTH) return undefined;
  // Letters in any script and percent-encoding (e.g. "%C3%BC"), nothing else.
  if (!/^\/(?:[\p{L}\p{N}\-/_.]|%[0-9a-f]{2})*$/iu.test(path)) return undefined;
  const firstSegment = `/${path.split("/")[1]}`;
  if (path.length > MAX_PATH_LENGTH) return firstSegment;
  // A segment that looks like personal data (an e-mail, an id from a mail
  // tool) never goes into account metadata, even under a public page.
  if (path.split("/").slice(2).some((segment) => looksPersonal(safeDecode(segment)))) {
    return firstSegment;
  }
  if (path === "/" || path === "/login" || isPublicMarketingPath(path)) return path;
  return firstSegment;
}

function isOwnHost(host: string, ownHost: string): boolean {
  const own = ownHost.toLowerCase().replace(/^www\./, "").split(":")[0];
  return host === own || host.endsWith(`.${own}`);
}

/**
 * Read attribution from the current page: carried query parameters win
 * (they describe the original landing), then the browser's referrer if
 * it points elsewhere, then the current path as the landing page.
 */
export function readAttribution({
  search,
  referrer,
  ownHost,
  pathname,
}: {
  search: string;
  referrer: string;
  ownHost: string;
  pathname: string;
}): SignupAttribution {
  const params = new URLSearchParams(search);
  const attribution: SignupAttribution = {};

  for (const [param, key] of Object.entries(CARRIED_PARAMS)) {
    const raw = params.get(param);
    if (key === "referrer") {
      // "?ref=producthunt.com/posts/ordilo" — keep the host, drop the path.
      const host = cleanHost(raw) ?? (raw?.includes("/") ? cleanHost(raw.split("/")[0]) : undefined);
      if (host && !isOwnHost(host, ownHost)) attribution.referrer = host;
      // "?ref=producthunt" names a source rather than a host. utm_source is
      // read earlier; a value dropped as personal leaves room for ref.
      else if (!host && !attribution.source) {
        const source = cleanValue(raw);
        if (source) attribution.source = source;
      }
    } else if (key === "landing") {
      const path = cleanPath(raw);
      if (path) attribution.landing = path;
    } else {
      const value = cleanValue(raw);
      if (value) attribution[key] = value;
    }
  }


  // Facebook's fbclid is not a paid signal: it is appended to every
  // outbound click, organic posts included. Paid Meta ads say so in
  // utm_medium, which classifyChannel already reads.
  // gbraid/wbraid: Google Ads clicks on iOS; dclid: Display & Video 360.
  if (["gclid", "gbraid", "wbraid", "dclid"].some((id) => params.has(id))) {
    attribution.paid_click = "google";
  }
  else if (params.has("msclkid")) attribution.paid_click = "microsoft";

  if (!attribution.referrer) {
    const host = cleanHost(referrer);
    if (host && !isOwnHost(host, ownHost)) attribution.referrer = host;
  }
  // A carried landing that does not pass is dropped, not replaced by this
  // page — otherwise every such signup would look like it began on /login.
  if (!attribution.landing && !params.has("lp")) attribution.landing = cleanPath(pathname);

  return attribution;
}

/** Query string (without "?") that carries attribution to /login. */
export function attributionQuery(attribution: SignupAttribution): string {
  const params = new URLSearchParams();
  for (const [param, key] of Object.entries(CARRIED_PARAMS)) {
    const value = attribution[key];
    if (typeof value === "string" && value) params.set(param, value);
  }
  if (attribution.paid_click === "google") params.set("gclid", "1");
  if (attribution.paid_click === "microsoft") params.set("msclkid", "1");
  return params.toString();
}

/**
 * Narrow untrusted user metadata back to a SignupAttribution. Metadata is
 * client-writable at signup, so every field is re-cleaned before use.
 */
export function parseStoredAttribution(value: unknown): SignupAttribution | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const text = (key: string) =>
    typeof raw[key] === "string" ? (raw[key] as string) : undefined;
  const attribution: SignupAttribution = {};
  for (const key of ["source", "medium", "campaign", "content", "term"] as const) {
    const cleaned = cleanValue(text(key));
    if (cleaned) attribution[key] = cleaned;
  }
  const referrer = cleanHost(text("referrer"));
  if (referrer) attribution.referrer = referrer;
  const landing = cleanPath(text("landing"));
  if (landing) attribution.landing = landing;
  if (raw.via === "invite" || raw.via === "app") attribution.via = raw.via;
  if (raw.paid_click === "google" || raw.paid_click === "microsoft") {
    attribution.paid_click = raw.paid_click;
  }
  return attribution;
}

/** Webmail and mail apps — checked before search, they share domains. */
const EMAIL_HOSTS = [
  "mail.google.com", "com.google.android.gm", "outlook.live.com",
  "outlook.office.com", "outlook.office365.com", "mail.yahoo.com",
  "web.de", "gmx.net", "gmx.de", "gmx.at", "gmx.ch", "t-online.de",
  "freenet.de", "mail.proton.me", "icloud.com", "posteo.de", "mailbox.org",
];
const SEARCH_ENGINES = [
  "google.", "bing.com", "duckduckgo.com", "ecosia.org", "startpage.com",
  "search.yahoo.com", "yahoo.com", "qwant.com", "search.brave.com", "yandex.",
  "baidu.com",
];
const AI_ASSISTANTS = [
  "chatgpt.com", "chat.openai.com", "perplexity.ai", "claude.ai",
  "gemini.google.com", "copilot.microsoft.com", "you.com", "phind.com",
];
const SOCIAL_NETWORKS = [
  "facebook.com", "instagram.com", "t.co", "x.com", "twitter.com",
  "linkedin.com", "lnkd.in", "tiktok.com", "pinterest.", "reddit.com",
  "youtube.com", "youtu.be", "whatsapp.com", "wa.me", "threads.net",
  "bsky.app", "xing.com",
];
const AI_SOURCES = ["chatgpt", "openai", "perplexity", "claude", "gemini", "copilot"];
const SEARCH_SOURCES = ["google", "bing", "duckduckgo", "ecosia", "yahoo", "qwant", "startpage", "brave"];
const SOCIAL_SOURCES = [
  "facebook", "fb", "instagram", "ig", "meta", "linkedin", "tiktok",
  "twitter", "x", "pinterest", "reddit", "youtube", "whatsapp", "threads",
];
const EMAIL_MEDIUMS = ["email", "e-mail", "newsletter", "mail"];
const SOCIAL_MEDIUMS = ["social", "social-media", "social_media", "organic_social"];

function matchesHost(host: string, list: string[]): boolean {
  return list.some((entry) =>
    entry.endsWith(".")
      ? host.startsWith(entry) || host.includes(`.${entry}`)
      : host === entry || host.endsWith(`.${entry}`),
  );
}

/**
 * Map an attribution to one channel. Order matters: an explicit entry path
 * beats campaign tags, campaign tags beat the referrer, and a referrer
 * beats "direct". `null` means the account predates attribution.
 */
export function classifyChannel(attribution: SignupAttribution | null): AcquisitionChannel {
  if (!attribution) return "unbekannt";
  // Entered through an invite link (also when finishing via /login).
  if (attribution.via === "invite" || attribution.landing === "/invite") return "einladung";
  if (attribution.via === "app") return "app";

  const medium = attribution.medium ?? "";
  const source = attribution.source ?? "";
  if (attribution.paid_click || PAID_MEDIUMS.includes(medium)) return "bezahlt";
  if (EMAIL_MEDIUMS.includes(medium)) return "email";
  if (SOCIAL_MEDIUMS.includes(medium) || SOCIAL_SOURCES.includes(source)) return "social";

  // Tools tag their own links with a host as source, e.g. ChatGPT's
  // "utm_source=chatgpt.com"; treat those like a referrer.
  const sourceHost = cleanHost(source);
  for (const host of [attribution.referrer, sourceHost]) {
    if (!host) continue;
    if (matchesHost(host, AI_ASSISTANTS)) return "ki_assistent";
    if (matchesHost(host, EMAIL_HOSTS)) return "email";
    if (matchesHost(host, SEARCH_ENGINES)) return "suche";
    if (matchesHost(host, SOCIAL_NETWORKS)) return "social";
  }
  if (AI_SOURCES.includes(source)) return "ki_assistent";
  if (SEARCH_SOURCES.includes(source)) return "suche";
  if (source || attribution.campaign) return "kampagne";
  return attribution.referrer ? "verweis" : "direkt";
}
