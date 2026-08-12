// Generates the PWA icon set (PNG) without external image tooling.
//
// Design: full-bleed petrol canvas with Ordilo's hexagon elephant mark.
// The large ear, profile eye, and hooked trunk remain readable when the
// operating system scales the icon down to notification or spotlight size.
//
// Usage: node scripts/generate-icons.mjs
// Output: public/icons/icon-{192,512}.png, icon-maskable-512.png,
//         public/apple-touch-icon.png (180)

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const PETROL = [0x30, 0x54, 0x60];
const PETROL_DARK = [0x19, 0x32, 0x32];
const WARM_WHITE = [0xfd, 0xfc, 0xfa];
const SAGE = [0xdd, 0xeb, 0xe5];
const SAND = [0xef, 0xe8, 0xdc];
const APRICOT = [0xe4, 0x60, 0x18];

// --- Minimal PNG encoder (truecolor RGBA, filter 0) -------------------------

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // Prepend filter byte 0 to each scanline.
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Drawing -----------------------------------------------------------------

/**
 * Render the icon at the given size.
 * @param size - Canvas size in px.
 * @param rounded - Corner radius as a fraction of size (0 = square, for
 *                  maskable icons the OS applies its own mask).
 */
function renderIcon(size, rounded) {
  const px = Buffer.alloc(size * size * 4);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const radius = rounded * size;
  const aa = 1.25; // anti-alias falloff in px

  const smooth = (dist) => Math.max(0, Math.min(1, 0.5 - dist / aa + 0.5));
  const toIcon = (value) => (value / 72) * size;
  const hex = [
    [36, 5], [63, 20.5], [63, 51.5],
    [36, 67], [9, 51.5], [9, 20.5],
  ].map(([x, y]) => [toIcon(x), toIcon(y)]);
  const leftPlane = [
    [10.5, 22], [36, 7.3], [36, 64.7], [10.5, 50],
  ].map(([x, y]) => [toIcon(x), toIcon(y)]);
  const topPlane = [
    [36, 7.3], [61.5, 22], [61.5, 35], [36, 20.5],
  ].map(([x, y]) => [toIcon(x), toIcon(y)]);
  const lowerPlane = [
    [36, 64.7], [36, 42], [49.5, 49.8], [49.5, 56.9],
  ].map(([x, y]) => [toIcon(x), toIcon(y)]);

  const inside = (x, y, polygon) => {
    let hit = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        hit = !hit;
      }
    }
    return hit;
  };

  const segmentDistance = (x, y, ax, ay, bx, by) => {
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
  };

  const blend = (from, to, alpha) =>
    from.map((channel, index) =>
      Math.round(channel + (to[index] - channel) * alpha),
    );

  const cubic = (start, controlA, controlB, end, steps = 10) =>
    Array.from({ length: steps }, (_, index) => {
      const t = (index + 1) / steps;
      const mt = 1 - t;
      return [
        mt ** 3 * start[0] + 3 * mt ** 2 * t * controlA[0] + 3 * mt * t ** 2 * controlB[0] + t ** 3 * end[0],
        mt ** 3 * start[1] + 3 * mt ** 2 * t * controlA[1] + 3 * mt * t ** 2 * controlB[1] + t ** 3 * end[1],
      ];
    });

  const silhouetteRaw = [[28, 19]];
  const addCurve = (controlA, controlB, end) => {
    silhouetteRaw.push(...cubic(silhouetteRaw.at(-1), controlA, controlB, end));
  };
  addCurve([38, 16], [47, 21], [49, 30]);
  addCurve([50, 34], [49, 38], [52, 41]);
  addCurve([54, 43], [57, 44], [59, 42]);
  addCurve([61, 40], [60, 36], [61, 33]);
  addCurve([62, 30], [64, 29], [66, 30]);
  addCurve([68, 31], [68, 33], [66, 34]);
  addCurve([66, 40], [65, 46], [60, 49]);
  addCurve([54, 52], [48, 49], [45, 44]);
  addCurve([42, 48], [37, 50], [31, 49]);
  addCurve([23, 48], [18, 42], [18, 34]);
  addCurve([18, 25], [24, 18], [28, 19]);

  const earRaw = [[28, 20]];
  const addEarCurve = (controlA, controlB, end) => {
    earRaw.push(...cubic(earRaw.at(-1), controlA, controlB, end));
  };
  addEarCurve([20, 18], [14, 24], [14, 33]);
  addEarCurve([14, 41], [19, 46], [26, 45]);
  addEarCurve([33, 44], [36, 38], [35, 31]);
  addEarCurve([34, 25], [32, 21], [28, 20]);

  const scalePath = (path) =>
    path.map(([x, y]) => [toIcon(x), toIcon(y)]);
  const silhouette = scalePath(silhouetteRaw);
  const ear = scalePath(earRaw);
  const innerEar = scalePath([[26, 24], [22.5, 23.5], [19.5, 27], [19.5, 33], [20.5, 38], [23, 41], [25, 41]]);
  const pathDistance = (x, y, path) =>
    Math.min(
      ...path.slice(1).map(([bx, by], index) => {
        const [ax, ay] = path[index];
        return segmentDistance(x, y, ax, ay, bx, by);
      }),
    );

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Rounded-rect coverage
      let bgAlpha = 1;
      if (radius > 0) {
        const dx = Math.max(Math.abs(x - cx) - (size / 2 - radius), 0);
        const dy = Math.max(Math.abs(y - cy) - (size / 2 - radius), 0);
        const d = Math.sqrt(dx * dx + dy * dy) - radius;
        bgAlpha = smooth(d);
      }

      let color = PETROL;
      if (inside(x, y, hex)) color = WARM_WHITE;
      if (inside(x, y, leftPlane)) color = SAGE;
      if (inside(x, y, topPlane)) color = SAND;
      if (inside(x, y, lowerPlane)) color = PETROL;

      // One continuous elephant silhouette. The trunk belongs to the same
      // filled shape as the face, so it never reads as a separate hook.
      const ix = (x / size) * 72;
      const iy = (y / size) * 72;
      if (inside(x, y, silhouette)) color = WARM_WHITE;
      const silhouetteEdgeAlpha = smooth(pathDistance(x, y, silhouette) - toIcon(0.82));
      color = blend(color, PETROL_DARK, silhouetteEdgeAlpha);
      if (inside(x, y, ear)) color = [0xb8, 0xcc, 0xc4];
      const earEdgeAlpha = smooth(pathDistance(x, y, ear) - toIcon(0.82));
      color = blend(color, PETROL_DARK, earEdgeAlpha);
      const innerEarAlpha = smooth(pathDistance(x, y, innerEar) - toIcon(0.38));
      color = blend(color, PETROL, innerEarAlpha * 0.55);

      // Profile eye.
      const eyeDistance = Math.hypot(ix - 42, iy - 29);
      const eyeAlpha = smooth(toIcon(eyeDistance - 1.7));
      color = blend(color, PETROL_DARK, eyeAlpha);

      const tuskDistance = segmentDistance(ix, iy, 49, 36, 50.7, 38.7);
      const tuskAlpha = smooth(toIcon(tuskDistance - 0.58));
      color = blend(color, APRICOT, tuskAlpha);

      const i = (y * size + x) * 4;
      px[i] = color[0];
      px[i + 1] = color[1];
      px[i + 2] = color[2];
      px[i + 3] = Math.round(bgAlpha * 255);
    }
  }
  return encodePng(size, size, px);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", renderIcon(192, 0.22));
writeFileSync("public/icons/icon-512.png", renderIcon(512, 0.22));
// Maskable: full-bleed square — the platform applies its own mask.
writeFileSync("public/icons/icon-maskable-512.png", renderIcon(512, 0));
// Apple touch icon: iOS rounds corners itself — full-bleed square.
writeFileSync("public/apple-touch-icon.png", renderIcon(180, 0));
console.log("icons written to public/");
