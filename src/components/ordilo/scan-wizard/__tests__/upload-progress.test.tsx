import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UploadProgressCard } from "@/components/ordilo/scan-wizard/upload-progress";

describe("UploadProgressCard", () => {
  it("renders progress through a compositor transform", () => {
    render(
      <UploadProgressCard
        upload={{
          id: "upload-1",
          file: new File(["pdf"], "brief.pdf", { type: "application/pdf" }),
          progress: 42,
          phase: "uploading",
        }}
        onRetry={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    const progress = screen.getByTestId("progress-bar");
    expect(progress.style.transform).toBe("scaleX(0.42)");
    expect(progress.style.width).toBe("");
    expect(progress.className).toContain("transition-transform");
  });
});
