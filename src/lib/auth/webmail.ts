/**
 * Webmail inbox URLs for common German email providers, so the
 * "check your inbox" moment is one tap instead of an app hunt.
 * Domains not listed simply don't get a button.
 */
const WEBMAIL_URLS: Record<string, { label: string; url: string }> = {
  "gmail.com": { label: "Gmail öffnen", url: "https://mail.google.com" },
  "googlemail.com": { label: "Gmail öffnen", url: "https://mail.google.com" },
  "gmx.de": { label: "GMX öffnen", url: "https://www.gmx.net" },
  "gmx.net": { label: "GMX öffnen", url: "https://www.gmx.net" },
  "web.de": { label: "WEB.DE öffnen", url: "https://web.de" },
  "t-online.de": {
    label: "T-Online öffnen",
    url: "https://email.t-online.de",
  },
  "outlook.com": {
    label: "Outlook öffnen",
    url: "https://outlook.live.com/mail",
  },
  "outlook.de": {
    label: "Outlook öffnen",
    url: "https://outlook.live.com/mail",
  },
  "hotmail.com": {
    label: "Outlook öffnen",
    url: "https://outlook.live.com/mail",
  },
  "icloud.com": { label: "iCloud Mail öffnen", url: "https://www.icloud.com/mail" },
};

/**
 * Returns the webmail quick-open link for the given email address,
 * or null if the domain is not a known webmail provider.
 */
export function webmailFor(email: string): { label: string; url: string } | null {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return WEBMAIL_URLS[domain] ?? null;
}
