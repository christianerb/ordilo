import "@testing-library/jest-dom/vitest";

// ---------------------------------------------------------------------------
// jsdom polyfills
// ---------------------------------------------------------------------------

/**
 * Polyfill ResizeObserver for jsdom.
 *
 * jsdom does not implement ResizeObserver. We provide a minimal mock that
 * immediately invokes the callback (to simulate a size change) and returns
 * a no-op observer. This is needed by components that use ResizeObserver
 * for auto-scroll behavior (via useMountEffect).
 */
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback([{ target } as ResizeObserverEntry], this);
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

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

/**
 * Polyfill window.matchMedia for jsdom.
 *
 * jsdom does not implement matchMedia. We provide a minimal mock (always
 * reporting no match) so components that use it for responsive behavior
 * (via useMountEffect) don't crash in tests. Tests that need a specific
 * match state should mock window.matchMedia themselves.
 */
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
