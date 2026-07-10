import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { CameraStep } from "../camera-step";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal fake MediaStreamTrack for a video track. */
function makeFakeTrack(capabilities: Record<string, unknown> = {}) {
  return {
    stop: vi.fn(),
    getCapabilities: vi.fn(() => capabilities),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
  };
}

/** A minimal fake MediaStream wrapping the given tracks. */
function makeFakeStream(track: ReturnType<typeof makeFakeTrack>) {
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  };
}

describe("CameraStep", () => {
  const originalMediaDevices = navigator.mediaDevices;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "mediaDevices", {
      value: originalMediaDevices,
      configurable: true,
    });
  });

  // -------------------------------------------------------------------------
  // Unavailable camera → fallback panel
  // -------------------------------------------------------------------------

  describe("when the camera is unavailable", () => {
    beforeEach(() => {
      Object.defineProperty(navigator, "mediaDevices", {
        value: undefined,
        configurable: true,
      });
    });

    it("shows a friendly fallback panel instead of a dead screen", async () => {
      render(
        <CameraStep onCapture={vi.fn()} onUseGallery={vi.fn()} onClose={vi.fn()} />,
      );

      expect(
        await screen.findByText(/kamera nicht verfügbar/i),
      ).toBeDefined();
    });

    it("calls onUseGallery from the fallback panel", async () => {
      const onUseGallery = vi.fn();
      render(
        <CameraStep onCapture={vi.fn()} onUseGallery={onUseGallery} onClose={vi.fn()} />,
      );

      const galleryButton = await screen.findByTestId(
        "camera-fallback-gallery-button",
      );
      fireEvent.click(galleryButton);
      expect(onUseGallery).toHaveBeenCalledTimes(1);
    });

    it("calls onClose from the close button", async () => {
      const onClose = vi.fn();
      render(
        <CameraStep onCapture={vi.fn()} onUseGallery={vi.fn()} onClose={onClose} />,
      );

      fireEvent.click(screen.getByLabelText(/kamera schließen/i));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Denied permission → fallback panel with denied copy
  // -------------------------------------------------------------------------

  it("shows denied-specific copy when getUserMedia rejects", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });

    render(
      <CameraStep onCapture={vi.fn()} onUseGallery={vi.fn()} onClose={vi.fn()} />,
    );

    expect(
      await screen.findByText(/kein zugriff auf die kamera/i),
    ).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Camera ready → viewfinder, capture, torch
  // -------------------------------------------------------------------------

  describe("when the camera is ready", () => {
    beforeEach(() => {
      HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    });

    function mockReadyCamera(capabilities: Record<string, unknown> = {}) {
      const track = makeFakeTrack(capabilities);
      const stream = makeFakeStream(track);
      Object.defineProperty(navigator, "mediaDevices", {
        value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
        configurable: true,
      });
      return { track, stream };
    }

    it("renders the live viewfinder and alignment hint once ready", async () => {
      mockReadyCamera();

      render(
        <CameraStep onCapture={vi.fn()} onUseGallery={vi.fn()} onClose={vi.fn()} />,
      );

      expect(await screen.findByTestId("camera-video")).toBeDefined();
      expect(
        screen.getByText(/dokument im rahmen ausrichten/i),
      ).toBeDefined();
      expect(screen.getByTestId("camera-shutter-button")).toBeDefined();
    });

    it("does not render a torch toggle when the device does not report torch support", async () => {
      mockReadyCamera();

      render(
        <CameraStep onCapture={vi.fn()} onUseGallery={vi.fn()} onClose={vi.fn()} />,
      );

      await screen.findByTestId("camera-video");
      expect(screen.queryByLabelText(/blitz/i)).toBeNull();
    });

    it("renders a torch toggle when the device reports torch support", async () => {
      mockReadyCamera({ torch: true });

      render(
        <CameraStep onCapture={vi.fn()} onUseGallery={vi.fn()} onClose={vi.fn()} />,
      );

      expect(
        await screen.findByLabelText(/blitz einschalten/i),
      ).toBeDefined();
    });

    it("captures the current video frame and calls onCapture with a JPEG File", async () => {
      const { track } = mockReadyCamera();
      const onCapture = vi.fn();

      // jsdom does not implement canvas rendering — stub just enough of
      // the 2D context + toBlob pipeline for the capture path to run.
      const drawImage = vi.fn();
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
        drawImage,
      } as unknown as CanvasRenderingContext2D);
      vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
        (callback: BlobCallback) => {
          callback(new Blob(["fake-jpeg"], { type: "image/jpeg" }));
        },
      );

      render(
        <CameraStep onCapture={onCapture} onUseGallery={vi.fn()} onClose={vi.fn()} />,
      );

      const video = await screen.findByTestId("camera-video");
      Object.defineProperty(video, "videoWidth", { value: 1280, configurable: true });
      Object.defineProperty(video, "videoHeight", { value: 720, configurable: true });

      fireEvent.click(screen.getByTestId("camera-shutter-button"));

      await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1));
      const file = onCapture.mock.calls[0][0] as File;
      expect(file).toBeInstanceOf(File);
      expect(file.type).toBe("image/jpeg");
      expect(track.stop).toHaveBeenCalled();
    });
  });
});
