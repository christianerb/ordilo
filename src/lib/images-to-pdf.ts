/**
 * Minimal client-side PDF builder for multi-page scans.
 *
 * Combines captured JPEG pages into a single PDF (one image per page,
 * embedded via DCTDecode — the JPEG bytes go in unmodified, so there is
 * no quality loss and no heavy dependency). The result uploads through
 * the existing single-file pipeline and Datalab OCRs it page by page.
 *
 * Scope: JPEG input only (the camera step always produces JPEG via
 * canvas.toBlob). Not a general-purpose PDF library.
 */

// ---------------------------------------------------------------------------
// JPEG dimension parsing
// ---------------------------------------------------------------------------

/**
 * Read the pixel dimensions from a JPEG's SOF (Start of Frame) marker.
 *
 * Walks the JPEG marker segments until it finds SOF0–SOF15 (excluding
 * DHT/DAC/RST markers which share the range but are not frames).
 *
 * @throws {Error} if the buffer is not a parseable JPEG.
 */
export function getJpegDimensions(bytes: Uint8Array): {
  width: number;
  height: number;
} {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("Kein JPEG (SOI-Marker fehlt).");
  }

  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];

    // Standalone markers without a length field.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }

    const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];

    // SOF0..SOF15 carry dimensions — but 0xc4 (DHT), 0xc8 (JPG) and
    // 0xcc (DAC) share the numeric range and must be skipped.
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      if (width > 0 && height > 0) return { width, height };
      throw new Error("JPEG mit ungültigen Abmessungen.");
    }

    offset += 2 + segmentLength;
  }

  throw new Error("JPEG-Abmessungen nicht gefunden (kein SOF-Marker).");
}

// ---------------------------------------------------------------------------
// PDF assembly
// ---------------------------------------------------------------------------

const textEncoder = new TextEncoder();

/**
 * Build a PDF from JPEG pages (one image per page, page size = image size
 * in points so nothing is scaled or cropped).
 *
 * @param jpegPages - The JPEG bytes of each page, in order.
 * @returns The PDF file bytes (starts with %PDF-1.4).
 * @throws {Error} if a page is not a parseable JPEG or no pages are given.
 */
export function buildPdfFromJpegs(jpegPages: Uint8Array[]): Uint8Array {
  if (jpegPages.length === 0) {
    throw new Error("Mindestens eine Seite wird benötigt.");
  }

  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let position = 0;

  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === "string" ? textEncoder.encode(data) : data;
    parts.push(bytes);
    position += bytes.length;
  };

  /** Record the byte offset of object `num` and emit its header. */
  const beginObject = (num: number) => {
    offsets[num] = position;
    push(`${num} 0 obj\n`);
  };

  // Object layout:
  //   1            — Catalog
  //   2            — Pages
  //   3 + i*3      — Page i
  //   4 + i*3      — Image XObject i
  //   5 + i*3      — Content stream i
  const pageCount = jpegPages.length;
  const pageObj = (i: number) => 3 + i * 3;
  const imageObj = (i: number) => 4 + i * 3;
  const contentObj = (i: number) => 5 + i * 3;
  const totalObjects = 2 + pageCount * 3;

  push("%PDF-1.4\n");
  // Binary comment marker (recommended so transfers treat the file as binary).
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  beginObject(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  beginObject(2);
  const kids = Array.from(
    { length: pageCount },
    (_, i) => `${pageObj(i)} 0 R`,
  ).join(" ");
  push(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>\nendobj\n`);

  for (let i = 0; i < pageCount; i++) {
    const jpeg = jpegPages[i];
    const { width, height } = getJpegDimensions(jpeg);

    beginObject(pageObj(i));
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
        `/Resources << /XObject << /Im${i} ${imageObj(i)} 0 R >> >> ` +
        `/Contents ${contentObj(i)} 0 R >>\nendobj\n`,
    );

    beginObject(imageObj(i));
    push(
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
        `/Length ${jpeg.length} >>\nstream\n`,
    );
    push(jpeg);
    push("\nendstream\nendobj\n");

    const content = `q ${width} 0 0 ${height} 0 0 cm /Im${i} Do Q`;
    beginObject(contentObj(i));
    push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
  }

  // Cross-reference table + trailer.
  const xrefOffset = position;
  let xref = `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`;
  for (let num = 1; num <= totalObjects; num++) {
    xref += `${String(offsets[num]).padStart(10, "0")} 00000 n \n`;
  }
  push(xref);
  push(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  // Concatenate.
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

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
  const pdf = buildPdfFromJpegs(buffers);
  return new File([pdf.buffer as ArrayBuffer], `scan-${Date.now()}.pdf`, {
    type: "application/pdf",
  });
}
