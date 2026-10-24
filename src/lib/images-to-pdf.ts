/**
 * Client-side multi-page scans: combines captured JPEG pages into one PDF
 * (see `@ordilo/document-contract` for the lossless builder). The result
 * uploads through the existing single-file pipeline and Datalab OCRs it
 * page by page.
 */

import { buildPdfFromJpegs } from "@ordilo/document-contract";

export { buildPdfFromJpegs, getJpegDimensions } from "@ordilo/document-contract";

/**
 * Combine captured page Files into a single upload File.
 *
 * One page → the original file, untouched (no PDF wrapping, no quality
 * loss, fastest path). Multiple pages → a PDF with one page per photo.
 */
export async function combinePagesToFile(pages: File[]): Promise<File> {
  if (pages.length === 0) {
    throw new Error("Mindestens eine Seite wird benötigt.");
  }
  if (pages.length === 1) return pages[0];

  const buffers = await Promise.all(
    pages.map(async (page) => new Uint8Array(await page.arrayBuffer())),
  );
  // A4 width, so the PDF prints at paper size; every pixel is kept.
  const pdf = buildPdfFromJpegs(buffers, { pageWidthPt: 595 });
  return new File([pdf.buffer as ArrayBuffer], `scan-${Date.now()}.pdf`, {
    type: "application/pdf",
  });
}
