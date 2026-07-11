// Generates the PWA icon set (PNG) without external image tooling.
//
// Design: full-bleed petrol (#305460) rounded canvas with a warm-white ring
// ("O" for Ordilo) — simple, legible at 48px, and safe for maskable crops
// (the ring sits well inside the 80% safe zone).
//
// Usage: node scripts/generate-icons.mjs
// Output: public/icons/icon-{192,512}.png, icon-maskable-512.png,
//         public/apple-touch-icon.png (180)

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const PETROL = [0x30, 0x54, 0x60];
const WARM_WHITE = [0xfd, 0xfc, 0xfa];

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
  // Ring geometry: outer radius 30% of size, stroke ~11% of size.
  const ringOuter = size * 0.3;
  const ringInner = size * 0.19;
  // Small dot below-right of ring center (a quiet "document point").
  const aa = 1.25; // anti-alias falloff in px

  const smooth = (dist) => Math.max(0, Math.min(1, 0.5 - dist / aa + 0.5));

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

      // Ring coverage (signed distance to annulus)
      const dr = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const ringDist = Math.max(dr - ringOuter, ringInner - dr);
      const ringAlpha = smooth(ringDist);

      const r = PETROL[0] + (WARM_WHITE[0] - PETROL[0]) * ringAlpha;
      const g = PETROL[1] + (WARM_WHITE[1] - PETROL[1]) * ringAlpha;
      const b = PETROL[2] + (WARM_WHITE[2] - PETROL[2]) * ringAlpha;

      const i = (y * size + x) * 4;
      px[i] = Math.round(r);
      px[i + 1] = Math.round(g);
      px[i + 2] = Math.round(b);
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
