// Composes App Store screenshots from real simulator captures.
//
// Each slide: headline + subline in Figtree on the warm canvas, the capture
// inside a simple device frame. Background shapes are laid out on one wide
// panorama so a shape leaving slide N continues on slide N+1 in the store's
// horizontal scroll.
//
// Usage: node scripts/compose-store-screenshots.mjs
// Input:  docs/marketing/app-store-assets/raw/<file>.png (1320 × 2868)
// Output: docs/marketing/app-store-assets/1.0/<file>.png (1320 × 2868, RGB)

import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const W = 1320;
const H = 2868;
const RAW = "docs/marketing/app-store-assets/raw";
const OUT = "docs/marketing/app-store-assets/1.0";
const FONTS = "node_modules/@expo-google-fonts/figtree";

export const slides = [
  { file: "01-fragen", title: "Frag einfach.<br>Ordilo weiß, wo es steht.", sub: "Antworten aus euren eigenen Briefen." },
  { file: "02-rein-damit", title: "Rein damit.", sub: "Scannen, Foto, PDF oder per Mail weiterleiten." },
  { file: "03-liest-mit", title: "Ordilo liest mit.", sub: "Termine, Fristen, Beträge. Du prüfst kurz, fertig." },
  { file: "04-fundstelle", title: "Die Antwort.<br>Und wo sie steht.", sub: "Nachsehen statt blind vertrauen." },
  { file: "05-heute", title: "Alles, was ansteht.", sub: "Fristen, Termine und Aufgaben<br>der Reihe nach." },
  { file: "06-wer-macht-was", title: "Wer macht was? Klar.", sub: "An jeder Aufgabe seht ihr, wer sich kümmert." },
  { file: "07-alles-an-einem-ort", title: "Alles an einem Ort.", sub: "Briefe, Verträge, Notizen, Kontakte." },
  { file: "08-sicher", title: "Sicher bei euch.", sub: "Face ID, Offline-Kopien, Export.<br>Kein Tracking, keine Werbung." },
];

// Panorama shapes in absolute x across all slides: [cx, cy, r, color].
const SHAPES = [
  [1180, 560, 430, "#DDEBE5"],
  [1320 + 1260, 2320, 520, "#F8E7D4"],
  [2 * 1320 + 1300, 700, 460, "#E5EEF1"],
  [3 * 1320 + 1240, 2400, 480, "#DDEBE5"],
  [4 * 1320 + 1320, 520, 440, "#F8E7D4"],
  [5 * 1320 + 1250, 2300, 500, "#E5EEF1"],
  [6 * 1320 + 1300, 640, 450, "#DDEBE5"],
  [7 * 1320 + 1100, 2450, 470, "#F8E7D4"],
  [-40, 2500, 420, "#E5EEF1"],
];

const font = (weight, file) =>
  `@font-face{font-family:Figtree;font-weight:${weight};src:url(data:font/ttf;base64,${readFileSync(join(FONTS, file)).toString("base64")})}`;

function slideHtml(slide, index, capture) {
  const offset = index * W;
  const shapes = SHAPES.filter(([cx, , r]) => cx + r > offset && cx - r < offset + W)
    .map(([cx, cy, r, color]) =>
      `<div class="shape" style="left:${cx - offset - r}px;top:${cy - r}px;width:${2 * r}px;height:${2 * r}px;background:${color}"></div>`)
    .join("");
  return `<html><head><style>
${font(400, "400Regular/Figtree_400Regular.ttf")}
${font(600, "600SemiBold/Figtree_600SemiBold.ttf")}
*{box-sizing:border-box}
body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#F8F6F2;font-family:Figtree;color:#262421;position:relative}
.shape{position:absolute;border-radius:50%;opacity:.9}
.copy{position:absolute;top:150px;left:110px;right:110px;text-align:center}
h1{margin:0;font-weight:600;font-size:100px;line-height:1.06;letter-spacing:-0.025em}
p{margin:34px 0 0;font-weight:400;font-size:50px;line-height:1.3;color:#625D54}
.phone{position:absolute;left:50%;transform:translateX(-50%);bottom:190px;width:980px;padding:20px;border-radius:132px;background:#1F2A2E;box-shadow:0 24px 60px rgba(25,50,50,.18)}
.phone img{display:block;width:100%;border-radius:112px}
.note{position:absolute;bottom:78px;left:0;right:0;text-align:center;font-size:30px;color:#625D54}
</style></head><body>${shapes}
<div class="copy"><h1>${slide.title}</h1><p>${slide.sub}</p></div>
<div class="phone"><img src="data:image/png;base64,${capture.toString("base64")}"></div>
<div class="note">Echte App-Ansichten · Fiktive Beispieldaten</div>
</body></html>`;
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  for (const [index, slide] of slides.entries()) {
    const rawPath = join(RAW, `${slide.file}.png`);
    if (!existsSync(rawPath)) {
      console.warn(`skip ${slide.file}: no capture`);
      continue;
    }
    await page.setContent(slideHtml(slide, index, readFileSync(rawPath)), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const target = join(OUT, `${slide.file}.png`);
    await page.screenshot({ path: target });
    // App Store Connect rejects screenshots with an alpha channel.
    execFileSync("magick", [target, "-background", "#F8F6F2", "-alpha", "remove", "-alpha", "off", target]);
    console.log(`wrote ${target}`);
  }
} finally {
  await browser.close();
}
