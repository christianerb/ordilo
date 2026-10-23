/**
 * Image quality for scanned pages and picked photos.
 *
 * The document scanner (VisionKit on iOS) delivers sharp, perspective-
 * corrected pages at roughly A4 @ 300 dpi. We keep as much of that as the
 * 4 MB upload limit allows: every page is encoded once at the best tier,
 * and only if the finished upload would be too large do we step down.
 * The last tier matches the former fixed 1600 px / 0.72 setting, so a scan
 * that fit before still fits now.
 */

export type ScanQualityTier = {
  /** Target pixels on the page's short edge (A4 width at 300 dpi = 2480). */
  shortEdge: number;
  /** JPEG compression, 0..1. */
  compress: number;
};

export const SCAN_QUALITY_TIERS: readonly ScanQualityTier[] = [
  { shortEdge: 2480, compress: 0.85 },
  { shortEdge: 2000, compress: 0.8 },
  { shortEdge: 1600, compress: 0.72 },
];

/** Headroom for the multipart envelope around the file. */
export const SCAN_SIZE_BUDGET_RATIO = 0.95;

export type ScanImageSource = {
  uri: string;
  name: string;
  /** Pixel size when the source reports it; unknown sizes get resized. */
  width?: number;
  height?: number;
};

export type ResizeAction = { resize: { width: number } | { height: number } };

/**
 * Resize along the short edge, never upscaling a smaller image (that would
 * only add bytes, not detail).
 */
export function resizeActionsFor(
  source: Pick<ScanImageSource, "width" | "height">,
  tier: ScanQualityTier,
): ResizeAction[] {
  const { width, height } = source;
  if (width && height) {
    const landscape = width > height;
    const shortEdge = landscape ? height : width;
    if (shortEdge <= tier.shortEdge) return [];
    return [{ resize: landscape ? { height: tier.shortEdge } : { width: tier.shortEdge } }];
  }
  return [{ resize: { width: tier.shortEdge } }];
}

export type EncodedPage = { uri: string; size?: number };

export type ScanImageEncoder<TDocument extends { size?: number }> = {
  encode: (
    source: ScanImageSource,
    actions: ResizeAction[],
    compress: number,
  ) => Promise<EncodedPage>;
  /** Turns the encoded pages into the upload document (one image or a PDF). */
  finish: (pages: EncodedPage[], sources: ScanImageSource[]) => Promise<TDocument>;
};

/**
 * Encode pages at the best tier whose finished document fits `maxBytes`.
 * Falls back to the smallest tier's result if nothing fits; upload
 * validation then shows the size message as before.
 */
export async function prepareScanDocument<TDocument extends { size?: number }>(
  sources: ScanImageSource[],
  maxBytes: number,
  encoder: ScanImageEncoder<TDocument>,
  tiers: readonly ScanQualityTier[] = SCAN_QUALITY_TIERS,
): Promise<TDocument> {
  if (!sources.length) throw new Error("Mindestens eine Seite wird benötigt.");
  const budget = Math.floor(maxBytes * SCAN_SIZE_BUDGET_RATIO);
  let document: TDocument | undefined;
  for (const tier of tiers) {
    const pages = await Promise.all(
      sources.map((source) =>
        encoder.encode(source, resizeActionsFor(source, tier), tier.compress),
      ),
    );
    document = await encoder.finish(pages, sources);
    if (document.size === undefined || document.size <= budget) return document;
  }
  return document as TDocument;
}
