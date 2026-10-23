/**
 * Image quality for scanned pages and picked photos.
 *
 * The document scanner (VisionKit on iOS) delivers sharp, perspective-
 * corrected pages. We keep all of it: a scanner JPEG that is not larger
 * than the top tier goes into the upload untouched (no second encode), and
 * everything else is encoded exactly once. Only if the finished upload
 * would exceed the limit do we step down a tier.
 */

export type ScanQualityTier = {
  /** Target pixels on the page's short edge (A4 width at 300 dpi = 2480). */
  shortEdge: number;
  /** JPEG compression, 0..1. */
  compress: number;
};

export const SCAN_QUALITY_TIERS: readonly ScanQualityTier[] = [
  { shortEdge: 3300, compress: 0.92 },
  { shortEdge: 2480, compress: 0.88 },
  { shortEdge: 2000, compress: 0.8 },
  { shortEdge: 1600, compress: 0.72 },
];

/** Headroom below the hard upload limit. */
export const SCAN_SIZE_BUDGET_RATIO = 0.95;

export type ScanImageSource = {
  uri: string;
  name: string;
  /** Pixel size when the source reports it; unknown sizes get resized. */
  width?: number;
  height?: number;
  /**
   * Upright JPEG straight from the document scanner: may be used as-is
   * when no resize is needed (photos can carry EXIF rotation, so they are
   * always re-encoded upright).
   */
  scannerJpeg?: boolean;
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
  /** Use the source file unchanged (only called for upright scanner JPEGs). */
  passthrough: (source: ScanImageSource) => Promise<EncodedPage>;
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
  for (const [index, tier] of tiers.entries()) {
    const pages = await Promise.all(
      sources.map((source) => {
        const actions = resizeActionsFor(source, tier);
        return index === 0 && source.scannerJpeg && actions.length === 0
          ? encoder.passthrough(source)
          : encoder.encode(source, actions, tier.compress);
      }),
    );
    document = await encoder.finish(pages, sources);
    if (document.size === undefined || document.size <= budget) return document;
  }
  return document as TDocument;
}
