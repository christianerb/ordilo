import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ScanWizard } from "@/components/ordilo/scan-wizard/scan-wizard";

vi.mock("@/components/ordilo/scan-wizard/review-step", () => ({
  ScanReviewStep: () => <div data-testid="review-step-stub" />,
}));
vi.mock("@/components/ordilo/scan-wizard/camera-step", () => ({
  CameraStep: () => <div data-testid="camera-step-stub" />,
}));
vi.mock("@/components/ordilo/scan-wizard/processing-step", () => ({
  ScanProcessingStep: () => <div data-testid="processing-step-stub" />,
}));

function renderWizard(props: Partial<React.ComponentProps<typeof ScanWizard>>) {
  const handlers = {
    onCapture: vi.fn(),
    onUseGallery: vi.fn(),
    onRetryUpload: vi.fn(),
    onClose: vi.fn(),
    onReviewDone: vi.fn(),
    onScanNext: vi.fn(),
    onRetake: vi.fn(),
  };
  render(<ScanWizard step="review" doc={null} {...handlers} {...props} />);
  return handlers;
}

describe("ScanWizard on review without a document", () => {
  it("offers a way out instead of a blank overlay", () => {
    // A poll or realtime refresh that errors nulls the wizard document while
    // the step stays "review". That used to paint an empty full-screen
    // overlay whose only exit was the Escape key — absent on a phone.
    const handlers = renderWizard({});

    expect(screen.getByTestId("review-step-missing-document")).toBeDefined();

    fireEvent.click(screen.getByTestId("review-missing-close-button"));
    expect(handlers.onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("review-missing-retake-button"));
    expect(handlers.onRetake).toHaveBeenCalledTimes(1);
  });

  it("keeps the normal review chrome when the document is present", () => {
    renderWizard({
      doc: { id: "doc-1" } as never,
    });
    expect(screen.queryByTestId("review-step-missing-document")).toBeNull();
    expect(screen.getByTestId("review-step-stub")).toBeDefined();
  });
});
