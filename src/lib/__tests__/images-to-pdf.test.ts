import { describe, it, expect } from "vitest";
import {
  getJpegDimensions,
  buildPdfFromJpegs,
} from "@/lib/images-to-pdf";

/** Minimal valid JPEG: SOI + SOF0 (height 16, width 32) + EOI. */
function minimalJpeg(width = 32, height = 16): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xc0, 0x00, 0x11, // SOF0, length 17
    0x08, // precision
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, // 3 components
    0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9, // EOI
  ]);
}

describe("getJpegDimensions", () => {
  it("reads width and height from the SOF0 marker", () => {
    expect(getJpegDimensions(minimalJpeg(640, 480))).toEqual({
      width: 640,
      height: 480,
    });
  });

  it("skips non-frame markers (APP0) before SOF", () => {
    const sofPart = minimalJpeg(100, 50).slice(2); // strip SOI
    const withApp0 = new Uint8Array([
      0xff, 0xd8, // SOI
      0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, // APP0 segment (len 4)
      ...sofPart,
    ]);
    expect(getJpegDimensions(withApp0)).toEqual({ width: 100, height: 50 });
  });

  it("throws for non-JPEG bytes", () => {
    expect(() => getJpegDimensions(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });
});

describe("buildPdfFromJpegs", () => {
  it("builds a well-formed PDF with one page per image", () => {
    const pdf = buildPdfFromJpegs([minimalJpeg(), minimalJpeg(64, 48)]);
    const text = new TextDecoder("latin1").decode(pdf);

    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/Count 2");
    expect(text).toContain("/MediaBox [0 0 32 16]");
    expect(text).toContain("/MediaBox [0 0 64 48]");
    expect(text).toContain("/Filter /DCTDecode");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("embeds the JPEG bytes verbatim (no re-encoding)", () => {
    const jpeg = minimalJpeg();
    const pdf = buildPdfFromJpegs([jpeg]);
    // The raw JPEG byte sequence must appear inside the PDF stream.
    const pdfStr = Array.from(pdf).join(",");
    const jpegStr = Array.from(jpeg).join(",");
    expect(pdfStr).toContain(jpegStr);
  });

  it("throws for zero pages", () => {
    expect(() => buildPdfFromJpegs([])).toThrow();
  });
});
