/**
 * Signup attribution without cookies or browser storage.
 *
 * The privacy policy promises "only technically necessary cookies", so the
 * first touch is never persisted on the device. Instead, marketing pages
 * carry what the current request already knows (UTM parameters, the
 * referring host, the landing path) as query parameters on their link to
 * /login, and the login form hands that to Supabase as user metadata on
 * the one request that creates the account. Supabase only applies that
 * metadata at signup, so returning users never overwrite their first
 * touch.
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
  /** Entry path that is not a marketing channel: an invite or the app. */
  via?: "invite" | "app";
  /** Set when a paid click id was present; the id itself is dropped. */
  paid_click?: "google" | "meta" | "microsoft";
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
  unbekannt: "Unbekannt (vor dem Tracking)",
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

const MAX_VALUE_LENGTH = 100;
const MAX_PATH_LENGTH = 200;

function cleanValue(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    .replace(/[^\p{L}\p{N} ._\-+/:]/gu, "")
    .trim()
    .toLowerCase()
    .slice(0, MAX_VALUE_LENGTH);
  return cleaned || undefined;
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

function cleanPath(value: string | null | undefined): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return undefined;
  const path = value.split(/[?#]/)[0].slice(0, MAX_PATH_LENGTH);
  return /^\/[a-z0-9\-/_.]*$/i.test(path) ? path : undefined;
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
      const host = cleanHost(raw);
      if (host && !isOwnHost(host, ownHost)) attribution.referrer = host;
    } else if (key === "landing") {
      const path = cleanPath(raw);
      if (path) attribution.landing = path;
    } else {
      const value = cleanValue(raw);
      if (value) attribution[key] = value;
    }
  }

  if (params.get("via") === "invite") attribution.via = "invite";

  if (params.has("gclid")) attribution.paid_click = "google";
  else if (params.has("msclkid")) attribution.paid_click = "microsoft";
  else if (params.has("fbclid") && params.has("utm_medium")) {
    // fbclid is also appended to organic shares; only count it as paid
    // when the campaign itself says so via utm_medium.
    attribution.paid_click = "meta";
  }

  if (!attribution.referrer) {
    const host = cleanHost(referrer);
    if (host && !isOwnHost(host, ownHost)) attribution.referrer = host;
  }
  if (!attribution.landing) attribution.landing = cleanPath(pathname);

  return attribution;
}

/** Query string (without "?") that carries attribution to /login. */
export function attributionQuery(attribution: SignupAttribution): string {
  const params = new URLSearchParams();
  for (const [param, key] of Object.entries(CARRIED_PARAMS)) {
    const value = attribution[key];
    if (typeof value === "string" && value) params.set(param, value);
  }
  if (attribution.via === "invite") params.set("via", "invite");
  if (attribution.paid_click === "google") params.set("gclid", "1");
  if (attribution.paid_click === "microsoft") params.set("msclkid", "1");
  if (attribution.paid_click === "meta") params.set("fbclid", "1");
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
  if (raw.paid_click === "google" || raw.paid_click === "meta" || raw.paid_click === "microsoft") {
    attribution.paid_click = raw.paid_click;
  }
  return attribution;
}

const SEARCH_ENGINES = [
  "google.", "bing.com", "duckduckgo.com", "ecosia.org", "startpage.com",
  "search.yahoo.com", "yahoo.com", "qwant.com", "search.brave.com", "yandex.",
  "baidu.com", "web.de", "t-online.de",
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
const SOCIAL_SOURCES = [
  "facebook", "fb", "instagram", "ig", "meta", "linkedin", "tiktok",
  "twitter", "x", "pinterest", "reddit", "youtube", "whatsapp", "threads",
];
const PAID_MEDIUMS = ["cpc", "ppc", "paid", "paidsocial", "paid_social", "paid-social", "display", "cpm", "ads"];
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
  if (attribution.via === "invite") return "einladung";
  if (attribution.via === "app") return "app";

  const medium = attribution.medium ?? "";
  const source = attribution.source ?? "";
  if (attribution.paid_click || PAID_MEDIUMS.includes(medium)) return "bezahlt";
  if (EMAIL_MEDIUMS.includes(medium)) return "email";
  if (SOCIAL_MEDIUMS.includes(medium) || SOCIAL_SOURCES.includes(source)) return "social";

  const host = attribution.referrer;
  if (host) {
    if (matchesHost(host, AI_ASSISTANTS)) return "ki_assistent";
    if (matchesHost(host, SEARCH_ENGINES)) return "suche";
    if (matchesHost(host, SOCIAL_NETWORKS)) return "social";
  }
  if (["chatgpt", "openai", "perplexity", "claude", "gemini", "copilot"].includes(source)) {
    return "ki_assistent";
  }
  if (source || attribution.campaign) return "kampagne";
  if (host) return "verweis";
  return "direkt";
}
