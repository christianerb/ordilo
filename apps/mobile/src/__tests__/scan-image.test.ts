import {
  prepareScanDocument,
  resizeActionsFor,
  SCAN_QUALITY_TIERS,
  type ScanImageEncoder,
} from "../lib/scan-image";

const BEST = SCAN_QUALITY_TIERS[0];
const MB = 1024 * 1024;

describe("resizeActionsFor", () => {
  it("shrinks a huge portrait page to the tier's short edge", () => {
    expect(resizeActionsFor({ width: 4284, height: 5712 }, BEST)).toEqual([
      { resize: { width: 3300 } },
    ]);
  });

  it("shrinks a landscape photo along its height", () => {
    expect(resizeActionsFor({ width: 5712, height: 4284 }, BEST)).toEqual([
      { resize: { height: 3300 } },
    ]);
  });

  it("keeps a typical scanner page at full resolution", () => {
    expect(resizeActionsFor({ width: 2480, height: 3508 }, BEST)).toEqual([]);
  });

  it("resizes by width when the source size is unknown", () => {
    expect(resizeActionsFor({}, BEST)).toEqual([{ resize: { width: 3300 } }]);
  });
});

describe("prepareScanDocument", () => {
  const scannerPages = [
    { uri: "file:///p1.jpg", name: "Scan-1.jpg", width: 2480, height: 3508, scannerJpeg: true },
    { uri: "file:///p2.jpg", name: "Scan-2.jpg", width: 2480, height: 3508, scannerJpeg: true },
  ];
  const photo = { uri: "file:///photo.heic", name: "Foto.heic", width: 3024, height: 4032 };

  function encoderWithSizes(sizesPerTier: number[]) {
    let call = 0;
    const passthrough = jest.fn(async (source: { uri: string }) => ({ uri: source.uri, size: 1 }));
    const encode = jest.fn(async () => ({ uri: "file:///out.jpg", size: 1 }));
    const finish = jest.fn(async () => ({ size: sizesPerTier[call++] }));
    return { passthrough, encode, finish } satisfies ScanImageEncoder<{ size?: number }>;
  }

  it("uploads scanner pages untouched when they fit (no second JPEG encode)", async () => {
    const encoder = encoderWithSizes([3 * MB]);
    await prepareScanDocument(scannerPages, 20 * MB, encoder);

    expect(encoder.passthrough).toHaveBeenCalledTimes(2);
    expect(encoder.encode).not.toHaveBeenCalled();
    expect(encoder.finish).toHaveBeenCalledTimes(1);
  });

  it("encodes photos exactly once at the top tier, upright and full size", async () => {
    const encoder = encoderWithSizes([4 * MB]);
    await prepareScanDocument([photo], 20 * MB, encoder);

    expect(encoder.passthrough).not.toHaveBeenCalled();
    expect(encoder.encode).toHaveBeenCalledTimes(1);
    expect(encoder.encode).toHaveBeenCalledWith(photo, [], 0.92);
  });

  it("steps down a tier only when the document is too large", async () => {
    const encoder = encoderWithSizes([25 * MB, 12 * MB]);
    const document = await prepareScanDocument(scannerPages, 20 * MB, encoder);

    expect(document.size).toBe(12 * MB);
    expect(encoder.encode).toHaveBeenLastCalledWith(
      scannerPages[1],
      [],
      0.88,
    );
  });

  it("leaves headroom below the hard limit", async () => {
    const encoder = encoderWithSizes([19.5 * MB, 12 * MB]);
    const document = await prepareScanDocument(scannerPages, 20 * MB, encoder);

    expect(document.size).toBe(12 * MB);
  });

  it("returns the smallest tier when nothing fits, so validation can explain", async () => {
    const encoder = encoderWithSizes([90, 80, 70, 60].map((n) => n * MB));
    const document = await prepareScanDocument(scannerPages, 20 * MB, encoder);

    expect(document.size).toBe(60 * MB);
    expect(encoder.encode).toHaveBeenLastCalledWith(
      scannerPages[1],
      [{ resize: { width: 1600 } }],
      0.72,
    );
  });

  it("rejects an empty scan", async () => {
    await expect(
      prepareScanDocument([], 20 * MB, encoderWithSizes([])),
    ).rejects.toThrow("Mindestens eine Seite");
  });
});
