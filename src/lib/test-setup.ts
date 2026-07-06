import "@testing-library/jest-dom/vitest";

// ---------------------------------------------------------------------------
// jsdom polyfills
// ---------------------------------------------------------------------------

/**
 * Polyfill Blob.arrayBuffer() for jsdom.
 *
 * jsdom 26 does not implement Blob.arrayBuffer() (or File.arrayBuffer(),
 * since File extends Blob). In production (Node.js / Next.js runtime),
 * Blob.arrayBuffer() is natively available and this polyfill is not
 * activated (the typeof check guards against overriding the native impl).
 *
 * The polyfill uses FileReader.readAsArrayBuffer(), which IS implemented
 * in jsdom and correctly reads the Blob/File content.
 */
if (typeof Blob.prototype.arrayBuffer !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Blob.prototype as any).arrayBuffer = function (): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}
