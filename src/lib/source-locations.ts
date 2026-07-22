export interface SourceLocation {
  pageNumber: number;
  bounds: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

type BoundingBox = [number, number, number, number];

interface LayoutBlock {
  bbox?: unknown;
  html?: unknown;
  text?: unknown;
  children?: unknown;
}

interface LocatedBlock {
  bbox: BoundingBox;
  text: string;
}

const MAX_SOURCE_TEXT_LENGTH = 500;

function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase("de-DE")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parseBoundingBox(value: unknown): BoundingBox | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  if (!value.every((part) => typeof part === "number" && Number.isFinite(part))) {
    return null;
  }

  const [left, top, right, bottom] = value as number[];
  if (right <= left || bottom <= top) return null;
  return [left, top, right, bottom];
}

function collectBlocks(value: unknown, blocks: LocatedBlock[]): void {
  if (!value || typeof value !== "object") return;

  const block = value as LayoutBlock;
  const bbox = parseBoundingBox(block.bbox);
  const text =
    typeof block.html === "string"
      ? block.html
      : typeof block.text === "string"
        ? block.text
        : "";

  if (bbox && normalizeText(text)) {
    blocks.push({ bbox, text });
  }

  if (Array.isArray(block.children)) {
    block.children.forEach((child) => collectBlocks(child, blocks));
  }
}

/**
 * Finds one unambiguous OCR layout block containing the supplied source text.
 * The returned coordinates are normalized to the page bounds, so the client
 * can overlay them on a rendered image without knowing its pixel dimensions.
 */
export function findSourceLocation(
  layout: unknown,
  pageNumber: number,
  sourceText: string,
): SourceLocation | null {
  const query = normalizeText(sourceText.slice(0, MAX_SOURCE_TEXT_LENGTH));
  if (!query) return null;

  const blocks: LocatedBlock[] = [];
  collectBlocks(layout, blocks);

  const matches = blocks.filter((block) =>
    normalizeText(block.text).includes(query),
  );
  if (matches.length !== 1) return null;

  const pageBounds = blocks.reduce<BoundingBox | null>((bounds, block) => {
    const [left, top, right, bottom] = block.bbox;
    if (!bounds) return [left, top, right, bottom];
    return [
      Math.min(bounds[0], left),
      Math.min(bounds[1], top),
      Math.max(bounds[2], right),
      Math.max(bounds[3], bottom),
    ];
  }, null);
  if (!pageBounds) return null;

  const [pageLeft, pageTop, pageRight, pageBottom] = pageBounds;
  const pageWidth = pageRight - pageLeft;
  const pageHeight = pageBottom - pageTop;
  if (pageWidth <= 0 || pageHeight <= 0) return null;

  const [left, top, right, bottom] = matches[0].bbox;
  return {
    pageNumber,
    bounds: {
      left: (left - pageLeft) / pageWidth,
      top: (top - pageTop) / pageHeight,
      width: (right - left) / pageWidth,
      height: (bottom - top) / pageHeight,
    },
  };
}
