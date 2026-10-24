import { isPublicMarketingPath } from "@/lib/public-routes";
import { readAttribution, type SignupAttribution } from "./attribution";

// Module memory only — never a cookie or browser storage. It lives as long
// as the page's JavaScript, which survives client-side navigations, so the
// first public page's UTM tags and landing path are still known when the
// visitor reaches /login a few clicks later. A full reload starts over.
let firstTouch: SignupAttribution | null = null;
// document.referrer never changes during client-side navigation, so after
// someone signed in it still names how the *first* person arrived.
let referrerSpent = false;

/** Pages a visitor can enter Ordilo through before having an account. */
function isEntryPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname.startsWith("/invite/") ||
    isPublicMarketingPath(pathname)
  );
}

function currentAttribution(): SignupAttribution {
  return readAttribution({
    search: window.location.search,
    referrer: referrerSpent ? "" : document.referrer,
    ownHost: window.location.host,
    pathname: window.location.pathname,
  });
}

/**
 * The attribution of the first entry page this tab showed. Captured on the
 * first call from an entry page and returned unchanged afterwards. App
 * pages are never remembered: they are not how anyone found Ordilo.
 * Browser-only.
 */
export function captureFirstTouch(): SignupAttribution {
  if (firstTouch) return firstTouch;
  const attribution = currentAttribution();
  if (isEntryPath(window.location.pathname)) firstTouch = attribution;
  return attribution;
}

/**
 * Forget the first touch. Called once someone is signed in: their account
 * already carries it, and a later signup in the same tab (another family
 * member after a sign-out) must not inherit it.
 */
export function forgetFirstTouch(): void {
  firstTouch = null;
  referrerSpent = true;
}

/** Test hook: back to a freshly loaded tab. */
export function resetFirstTouchForTests(): void {
  firstTouch = null;
  referrerSpent = false;
}
