import {
  prepareScanDocument,
  resizeActionsFor,
  SCAN_QUALITY_TIERS,
  type ScanImageEncoder,
} from "../lib/scan-image";

const BEST = SCAN_QUALITY_TIERS[0];

describe("resizeActionsFor", () => {
  it("shrinks a portrait page to the tier's short edge", () => {
    expect(resizeActionsFor({ width: 3024, height: 4032 }, BEST)).toEqual([
      { resize: { width: 2480 } },
    ]);
  });

  it("shrinks a landscape photo along its height", () => {
    expect(resizeActionsFor({ width: 4032, height: 3024 }, BEST)).toEqual([
      { resize: { height: 2480 } },
    ]);
  });

  it("never upscales a page that is already small enough", () => {
    expect(resizeActionsFor({ width: 1240, height: 1754 }, BEST)).toEqual([]);
  });

  it("resizes by width when the source size is unknown", () => {
    expect(resizeActionsFor({}, BEST)).toEqual([{ resize: { width: 2480 } }]);
  });
});

describe("prepareScanDocument", () => {
  const sources = [
    { uri: "file:///p1.jpg", name: "Scan-1.jpg", width: 2550, height: 3300 },
    { uri: "file:///p2.jpg", name: "Scan-2.jpg", width: 2550, height: 3300 },
  ];

  function encoderWithSizes(sizesPerTier: number[]) {
    let call = 0;
    const encode = jest.fn(async () => ({ uri: "file:///out.jpg", size: 1 }));
    const finish = jest.fn(async () => ({ size: sizesPerTier[call++] }));
    return { encode, finish } satisfies ScanImageEncoder<{ size?: number }>;
  }

  it("keeps the best quality when it fits the upload limit", async () => {
    const encoder = encoderWithSizes([2_000_000]);
    const document = await prepareScanDocument(sources, 4_000_000, encoder);

    expect(document.size).toBe(2_000_000);
    expect(encoder.finish).toHaveBeenCalledTimes(1);
    expect(encoder.encode).toHaveBeenCalledWith(
      sources[0],
      [{ resize: { width: 2480 } }],
      0.85,
    );
  });

  it("steps down a tier when the document is too large", async () => {
    const encoder = encoderWithSizes([5_000_000, 3_000_000]);
    const document = await prepareScanDocument(sources, 4_000_000, encoder);

    expect(document.size).toBe(3_000_000);
    expect(encoder.encode).toHaveBeenLastCalledWith(
      sources[1],
      [{ resize: { width: 2000 } }],
      0.8,
    );
  });

  it("leaves headroom below the hard limit", async () => {
    const encoder = encoderWithSizes([3_900_000, 3_000_000]);
    const document = await prepareScanDocument(sources, 4_000_000, encoder);

    expect(document.size).toBe(3_000_000);
  });

  it("returns the smallest tier when nothing fits, so validation can explain", async () => {
    const encoder = encoderWithSizes([9e6, 8e6, 7e6]);
    const document = await prepareScanDocument(sources, 4_000_000, encoder);

    expect(document.size).toBe(7e6);
    expect(encoder.encode).toHaveBeenLastCalledWith(
      sources[1],
      [{ resize: { width: 1600 } }],
      0.72,
    );
  });

  it("rejects an empty scan", async () => {
    await expect(
      prepareScanDocument([], 4_000_000, encoderWithSizes([])),
    ).rejects.toThrow("Mindestens eine Seite");
  });
});
