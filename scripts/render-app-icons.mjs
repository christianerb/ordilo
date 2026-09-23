// Renders the native app icon set from one vector source.
//
// Design: warm-white hexagon (the family's safe home) on Harbor Blue with the
// Ordilo elephant inside. Ear, profile eye and hooked trunk stay readable at
// home-screen and Spotlight sizes.
//
// Usage: node scripts/render-app-icons.mjs
// Output: apps/mobile/assets/images/icon.png (iOS, 1024, no alpha),
//         android-icon-{foreground,background,monochrome}.png,
//         splash-icon.png, favicon.png

import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HARBOR_BLUE = "#305460";
const HARBOR_BLUE_DARKER = "#193232";
const WARM_WHITE = "#FDFCFA";
const SAGE = "#DDEBE5";
const APRICOT = "#E46018";

const OUT = "apps/mobile/assets/images";

const HEXAGON = "M512 118 L853 315 L853 709 L512 906 L171 709 L171 315 Z";

// The trunk leaves the head tangent to its right edge, so head and trunk read
// as one silhouette instead of a circle with a hook attached.
const TRUNK = "M628 468 C632 560 702 622 686 702 C674 762 606 776 580 736";
const EAR =
  "M410 318 C330 308 275 375 280 480 C285 575 340 640 420 632 C490 625 520 560 512 480 C505 390 475 325 410 318 Z";
const EAR_FOLD = "M398 368 C352 368 327 415 330 478 C333 535 362 575 405 572";
const TUSK = "M588 598 C600 628 592 652 568 668";

function elephant() {
  return `
    <path d="${TRUNK}" fill="none" stroke="${HARBOR_BLUE}" stroke-width="84" stroke-linecap="round"/>
    <circle cx="500" cy="480" r="175" fill="${HARBOR_BLUE}"/>
    <path d="${EAR}" fill="${SAGE}" stroke="${HARBOR_BLUE_DARKER}" stroke-width="14" stroke-linejoin="round"/>
    <path d="${EAR_FOLD}" fill="none" stroke="${HARBOR_BLUE}" stroke-width="12" stroke-linecap="round" opacity="0.5"/>
    <circle cx="585" cy="440" r="24" fill="${WARM_WHITE}"/>
    <circle cx="589" cy="440" r="13" fill="${HARBOR_BLUE_DARKER}"/>
    <path d="${TUSK}" fill="none" stroke="${APRICOT}" stroke-width="24" stroke-linecap="round"/>`;
}

function mark() {
  return `
    <path d="${HEXAGON}" fill="${WARM_WHITE}" stroke="${WARM_WHITE}" stroke-width="56" stroke-linejoin="round"/>
    ${elephant()}`;
}

// Android masks the adaptive icon to roughly the centre 61-66%, so the mark
// shrinks to stay inside the safe zone on every launcher shape.
const ANDROID_SCALE = 0.72;
const scaled = (content, scale) =>
  `<g transform="translate(${512 * (1 - scale)} ${512 * (1 - scale)}) scale(${scale})">${content}</g>`;

const svg = (body, extra = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">${extra}${body}</svg>`;

const icons = {
  icon: svg(`<rect width="1024" height="1024" fill="${HARBOR_BLUE}"/>${mark()}`),
  "android-icon-background": svg(`<rect width="1024" height="1024" fill="${HARBOR_BLUE}"/>`),
  "android-icon-foreground": svg(scaled(mark(), ANDROID_SCALE)),
  // Monochrome launchers tint one alpha channel: the hexagon stays solid and
  // the elephant is cut out of it.
  "android-icon-monochrome": svg(
    scaled(`<path d="${HEXAGON}" fill="#fff" stroke="#fff" stroke-width="56" stroke-linejoin="round" mask="url(#cut)"/>`, ANDROID_SCALE),
    `<defs><mask id="cut" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
      <rect width="1024" height="1024" fill="#fff"/>
      <path d="${TRUNK}" fill="none" stroke="#000" stroke-width="84" stroke-linecap="round"/>
      <circle cx="500" cy="480" r="175" fill="#000"/>
      <path d="${EAR}" fill="#000" stroke="#000" stroke-width="14"/>
      <path d="${EAR}" fill="#fff" transform="translate(410 475) scale(0.8) translate(-410 -475)"/>
      <circle cx="585" cy="440" r="20" fill="#fff"/>
    </mask></defs>`,
  ),
  // The splash sits on Warm White, where a white hexagon would vanish, so it
  // shows the full icon tile instead.
  "splash-icon": svg(
    `<clipPath id="tile"><rect width="1024" height="1024" rx="230"/></clipPath>
     <g clip-path="url(#tile)"><rect width="1024" height="1024" fill="${HARBOR_BLUE}"/>${mark()}</g>`,
  ),
};

const sizes = {
  icon: 1024,
  "android-icon-background": 512,
  "android-icon-foreground": 512,
  "android-icon-monochrome": 432,
  "splash-icon": 1024,
  favicon: 48,
};

const work = mkdtempSync(join(tmpdir(), "ordilo-icons-"));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  const render = async (name, markup) => {
    await page.setContent(`<html><body style="margin:0;background:transparent">${markup}</body></html>`);
    const raw = join(work, `${name}.png`);
    await page.screenshot({ path: raw, omitBackground: true });
    return raw;
  };

  for (const [name, markup] of Object.entries(icons)) {
    const raw = await render(name, markup);
    const size = String(sizes[name]);
    const args = [raw, "-filter", "Lanczos", "-resize", `${size}x${size}`];
    // App Store Connect rejects an icon with an alpha channel.
    if (name === "icon") args.push("-background", HARBOR_BLUE, "-alpha", "remove", "-alpha", "off");
    execFileSync("magick", [...args, join(OUT, `${name}.png`)]);
  }

  const splashRaw = join(work, "splash-icon.png");
  execFileSync("magick", [splashRaw, "-filter", "Lanczos", "-resize", "48x48", join(OUT, "favicon.png")]);
} finally {
  await browser.close();
  rmSync(work, { recursive: true, force: true });
}

console.log(`icons written to ${OUT}/`);
